/**
 * import-tx-raw — Supabase Edge Function
 *
 * Operator-facing TX Pick 3 import + dataset rebuild. Mirrors the
 * scripts/imports/import_tx_raw.ts + aggregate_tx_datasets.ts CLI flow but
 * runs server-side so the operator can paste results into the admin UI
 * (app/zk30-import.tsx) and click one button.
 *
 * POST body:
 *   { rawText: string }      ← paste of TX draws, tab-separated
 *
 * Behavior:
 *   1. Parse rawText into TxRawRecord[] using the inlined parser (mirror of
 *      lib/zk30/parseTxRaw.ts).
 *   2. Idempotent batched INSERT into histories_tx with
 *      Prefer: resolution=ignore-duplicates,return=minimal so re-pastes are
 *      no-ops on existing (date_et, session) rows.
 *   3. Read all histories_tx rows back (paginated), run the inlined
 *      aggregator (mirror of lib/zk30/aggregateTxDatasets.ts) for both
 *      H01Y + H02Y horizons, anchored at the latest date_et.
 *   4. DELETE TX rows from datasets_box + datasets_pair (jurisdiction='TX',
 *      scope='allday') and batched INSERT the freshly-computed rows.
 *   5. Write audit_logs row marking the run + counts.
 *
 * Response shape:
 *   { success, parsed, inserted, skipped, rejected: [{line_number, reason}],
 *     boxRowsWritten, pairRowsWritten, anchor, durationMs }
 *
 * Auth: verify_jwt=true (admin-screen calls forward the user JWT). All
 * actual writes use service-role from Deno env.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_SIZE   = 500;
const PAGE         = 1000;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const svcHeaders = (extra: Record<string, string> = {}) => ({
  'apikey':        SVC_KEY,
  'Authorization': 'Bearer ' + SVC_KEY,
  'Content-Type':  'application/json',
  ...extra,
});

// ─── Parser (mirror of lib/zk30/parseTxRaw.ts) ──────────────────────────────

type TxSession = 'Morning' | 'Day' | 'Evening' | 'Night';
type TxRawRecord = {
  date_et: string;
  session: TxSession;
  result_digits: string;
  fireball: string | null;
};
type RejectedLine = {
  line_number: number;
  raw: string;
  reason: 'field_count' | 'bad_date' | 'sunday' | 'bad_session' | 'bad_result' | 'bad_fireball';
};

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const SESSIONS: ReadonlySet<TxSession> = new Set(['Morning', 'Day', 'Evening', 'Night']);
const DATE_RE = /^([A-Za-z]{3}),\s+([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/;
const RESULT_FIREBALL_RE = /^(\d-\d-\d|\d{3})(?:\s*,\s*Fireball:\s*(\d))?$/i;

function stripTrailingPunct(s: string): string { return s.replace(/[.,;\s]+$/u, ''); }

function parseDate(s: string): { iso: string; dayOfWeek: number } | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const monthNum = MONTHS[m[2]];
  if (!monthNum) return null;
  const day = Number(m[3]);
  const year = Number(m[4]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 2099) return null;
  const d = new Date(Date.UTC(year, monthNum - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== monthNum - 1 || d.getUTCDate() !== day) return null;
  const iso = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, dayOfWeek: d.getUTCDay() };
}

function extractSession(field: string): TxSession | null {
  const trimmed = field.trim();
  if (!trimmed) return null;
  const tail = trimmed.split(/\s+/).pop();
  return tail && SESSIONS.has(tail as TxSession) ? (tail as TxSession) : null;
}

type ResultParse = { result: string; fireball: string | null } | { error: 'bad_result' | 'bad_fireball' };
function parseResultField(field: string): ResultParse {
  const trimmed = field.trim();
  const m = RESULT_FIREBALL_RE.exec(trimmed);
  if (!m) {
    if (/fireball/i.test(trimmed) && /^(\d-\d-\d|\d{3})/.test(trimmed)) return { error: 'bad_fireball' };
    return { error: 'bad_result' };
  }
  const result = m[1].replace(/-/g, '');
  if (result.length !== 3) return { error: 'bad_result' };
  return { result, fireball: m[2] ?? null };
}

function parseTxRawText(input: string): { records: TxRawRecord[]; rejected: RejectedLine[] } {
  const records: TxRawRecord[] = [];
  const rejected: RejectedLine[] = [];
  const lines = input.split(/\r\n|\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNumber = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const fields = stripTrailingPunct(trimmed).split('\t');
    if (fields.length < 3 || fields.length > 4) {
      rejected.push({ line_number: lineNumber, raw, reason: 'field_count' });
      continue;
    }
    let dateField: string, sessionField: string, resultField: string;
    if (fields.length === 4) { [dateField, , sessionField, resultField] = fields; }
    else { [dateField, sessionField, resultField] = fields; }
    const parsedDate = parseDate(dateField.trim());
    if (!parsedDate) { rejected.push({ line_number: lineNumber, raw, reason: 'bad_date' }); continue; }
    if (parsedDate.dayOfWeek === 0) { rejected.push({ line_number: lineNumber, raw, reason: 'sunday' }); continue; }
    const session = extractSession(sessionField);
    if (!session) { rejected.push({ line_number: lineNumber, raw, reason: 'bad_session' }); continue; }
    const parsed = parseResultField(resultField);
    if ('error' in parsed) { rejected.push({ line_number: lineNumber, raw, reason: parsed.error }); continue; }
    records.push({
      date_et: parsedDate.iso,
      session,
      result_digits: parsed.result,
      fireball: parsed.fireball,
    });
  }
  return { records, rejected };
}

// ─── Aggregator helpers (mirror of lib/zk30/aggregateTxDatasets.ts) ─────────

type ZK30Horizon = 'H01Y' | 'H02Y';
const ZK30_HORIZONS: ReadonlyArray<ZK30Horizon> = ['H01Y', 'H02Y'];
const HORIZON_DAYS: Record<ZK30Horizon, number> = { H01Y: 365, H02Y: 730 };

type TxDraw = { date_et: string; session: string; result_digits: string; fireball: string | null };
type BoxRow = {
  class_id: 1; scope: 'allday'; horizon_label: ZK30Horizon; jurisdiction: 'TX';
  key: string; key_box: string;
  times_drawn: number; last_seen: string | null;
  ds_raw: number; draws_since: number; ds_normalized: number; expected: number | null;
};
type PairRow = {
  class_id: number; scope: 'allday'; horizon_label: ZK30Horizon; jurisdiction: 'TX';
  key: string; key_pair: string;
  times_drawn: number; last_seen: string | null;
  ds_raw: number; draws_since: number; ds_normalized: number;
};

function sortedPair(a: string, b: string): string { return a <= b ? a + b : b + a; }

function isoDateMinusDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(anchor: string, dateStr: string): number {
  const a = new Date(anchor + 'T00:00:00Z').getTime();
  const d = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((a - d) / 86_400_000));
}

function* iterBoxUniverse() {
  for (let a = 0; a <= 9; a++) for (let b = a; b <= 9; b++) for (let c = b; c <= 9; c++) yield `${a}${b}${c}`;
}
function* iterSortedPairUniverse() {
  for (let a = 0; a <= 9; a++) for (let b = a; b <= 9; b++) yield `${a}${b}`;
}
function* iterPositionalPairUniverse() {
  for (let a = 0; a <= 9; a++) for (let b = 0; b <= 9; b++) yield `${a}${b}`;
}

function sortDigits3(combo: string): string { return combo.split('').sort().join(''); }

function distinctBoxPairs(combo: string): string[] {
  const [a, b, c] = combo;
  const set = new Set<string>();
  set.add(sortedPair(a, b));
  set.add(sortedPair(b, c));
  set.add(sortedPair(a, c));
  return Array.from(set);
}

type Accum = { times_drawn: number; last_seen: string | null };
function bumpAccum(map: Map<string, Accum>, key: string, dateEt: string): void {
  const cur = map.get(key);
  if (!cur) { map.set(key, { times_drawn: 1, last_seen: dateEt }); return; }
  cur.times_drawn += 1;
  if (cur.last_seen === null || dateEt > cur.last_seen) cur.last_seen = dateEt;
}
function drawsSinceCount(draws: TxDraw[], lastSeen: string | null, windowDraws: number): number {
  if (lastSeen === null) return windowDraws;
  let n = 0;
  for (const d of draws) if (d.date_et > lastSeen) n++;
  return n;
}

function aggregateForHorizon(draws: TxDraw[], anchor: string, horizon: ZK30Horizon): {
  windowStart: string; windowDraws: number; boxRows: BoxRow[]; pairRows: PairRow[];
} {
  const horizonDays = HORIZON_DAYS[horizon];
  const windowStart = isoDateMinusDays(anchor, horizonDays);
  const inWindow = draws.filter(d => d.date_et > windowStart && d.date_et <= anchor);
  const windowDraws = inWindow.length;

  const box = new Map<string, Accum>();
  const pair: Record<number, Map<string, Accum>> = {
    2: new Map(), 3: new Map(), 4: new Map(),
    5: new Map(), 6: new Map(), 7: new Map(),
    8: new Map(), 9: new Map(), 10: new Map(), 11: new Map(),
  };

  for (const d of inWindow) {
    if (!/^\d{3}$/.test(d.result_digits)) continue;
    bumpAccum(box, sortDigits3(d.result_digits), d.date_et);
    const [a, b, c] = d.result_digits;
    const sorted = sortDigits3(d.result_digits);
    const [s1, s2, s3] = sorted;
    bumpAccum(pair[2], a + b, d.date_et);
    bumpAccum(pair[3], b + c, d.date_et);
    bumpAccum(pair[4], a + c, d.date_et);
    bumpAccum(pair[5], sortedPair(a, b), d.date_et);
    bumpAccum(pair[6], sortedPair(b, c), d.date_et);
    bumpAccum(pair[7], sortedPair(a, c), d.date_et);
    bumpAccum(pair[8],  s1 + s2, d.date_et);
    bumpAccum(pair[9],  s2 + s3, d.date_et);
    bumpAccum(pair[10], s1 + s3, d.date_et);
    for (const p of distinctBoxPairs(d.result_digits)) bumpAccum(pair[11], p, d.date_et);
  }

  const boxRows: BoxRow[] = [];
  for (const key of iterBoxUniverse()) {
    const acc = box.get(key);
    const td = acc?.times_drawn ?? 0;
    const ls = acc?.last_seen ?? null;
    const dsRaw = ls === null ? horizonDays : daysBetween(anchor, ls);
    boxRows.push({
      class_id: 1, scope: 'allday', horizon_label: horizon, jurisdiction: 'TX',
      key, key_box: key,
      times_drawn: td, last_seen: ls,
      ds_raw: dsRaw, draws_since: drawsSinceCount(inWindow, ls, windowDraws),
      ds_normalized: 0, expected: null,
    });
  }

  const pairRows: PairRow[] = [];
  const emitPair = (classId: number, universe: Iterable<string>) => {
    const acc = pair[classId];
    for (const key of universe) {
      const a = acc.get(key);
      const td = a?.times_drawn ?? 0;
      const ls = a?.last_seen ?? null;
      const dsRaw = ls === null ? horizonDays : daysBetween(anchor, ls);
      pairRows.push({
        class_id: classId, scope: 'allday', horizon_label: horizon, jurisdiction: 'TX',
        key, key_pair: key,
        times_drawn: td, last_seen: ls,
        ds_raw: dsRaw, draws_since: drawsSinceCount(inWindow, ls, windowDraws),
        ds_normalized: 0,
      });
    }
  };
  for (const cid of [2, 3, 4]) emitPair(cid, iterPositionalPairUniverse());
  for (const cid of [5, 6, 7, 8, 9, 10, 11]) emitPair(cid, iterSortedPairUniverse());

  return { windowStart, windowDraws, boxRows, pairRows };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`GET ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function sbInsertBatch(table: string, rows: unknown[], prefer = 'return=minimal'): Promise<void> {
  if (rows.length === 0) return;
  const r = await fetch(SUPABASE_URL + `/rest/v1/${table}`, {
    method: 'POST',
    headers: svcHeaders({ 'Prefer': prefer }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

async function sbDelete(path: string): Promise<void> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'DELETE',
    headers: svcHeaders({ 'Prefer': 'return=minimal' }),
  });
  if (!r.ok) throw new Error(`DELETE ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// Pre-existing histories_tx rows by composite key, used to compute the
// inserted-vs-skipped split since Prefer: ignore-duplicates swallows the
// row count silently.
async function existingKeys(records: TxRawRecord[]): Promise<Set<string>> {
  const dates = Array.from(new Set(records.map(r => r.date_et)));
  if (dates.length === 0) return new Set();
  const out = new Set<string>();
  for (let i = 0; i < dates.length; i += 50) {
    const slice = dates.slice(i, i + 50);
    const inList = slice.join(',');
    const rows = await sbGet<Array<{ date_et: string; session: string }>>(
      `/rest/v1/histories_tx?date_et=in.(${inList})&select=date_et,session&limit=1000`,
    );
    for (const r of rows ?? []) out.add(`${r.date_et}|${r.session}`);
  }
  return out;
}

async function fetchAllHistoriesTx(): Promise<TxDraw[]> {
  const rows: TxDraw[] = [];
  let from = 0;
  while (true) {
    const chunk = await sbGet<TxDraw[]>(
      `/rest/v1/histories_tx?select=date_et,session,result_digits,fireball` +
      `&order=date_et.asc&limit=${PAGE}&offset=${from}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function rebuildDatasets(draws: TxDraw[]): Promise<{
  anchor: string; boxWritten: number; pairWritten: number;
}> {
  if (draws.length === 0) return { anchor: '', boxWritten: 0, pairWritten: 0 };
  const anchor = draws.reduce((m, r) => (r.date_et > m ? r.date_et : m), draws[0].date_et);

  // Pre-compute both horizons before any DELETE — minimizes the empty-dataset
  // window in case INSERT batches partially fail.
  const perHorizon: Array<{ horizon: ZK30Horizon; boxRows: BoxRow[]; pairRows: PairRow[] }> = [];
  for (const h of ZK30_HORIZONS) {
    const r = aggregateForHorizon(draws, anchor, h);
    perHorizon.push({ horizon: h, boxRows: r.boxRows, pairRows: r.pairRows });
  }

  await sbDelete('/rest/v1/datasets_box?jurisdiction=eq.TX&scope=eq.allday');
  await sbDelete('/rest/v1/datasets_pair?jurisdiction=eq.TX&scope=eq.allday');

  let boxWritten = 0;
  let pairWritten = 0;
  for (const ph of perHorizon) {
    for (let i = 0; i < ph.boxRows.length; i += BATCH_SIZE) {
      const batch = ph.boxRows.slice(i, i + BATCH_SIZE);
      await sbInsertBatch('datasets_box', batch);
      boxWritten += batch.length;
    }
    for (let i = 0; i < ph.pairRows.length; i += BATCH_SIZE) {
      const batch = ph.pairRows.slice(i, i + BATCH_SIZE);
      await sbInsertBatch('datasets_pair', batch);
      pairWritten += batch.length;
    }
  }

  return { anchor, boxWritten, pairWritten };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const started = Date.now();
  let body: { rawText?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const rawText = typeof body.rawText === 'string' ? body.rawText : '';
  if (!rawText.trim()) {
    return new Response(JSON.stringify({ error: 'rawText required (non-empty)' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Parse
    const { records, rejected } = parseTxRawText(rawText);

    let inserted = 0;
    let skipped = 0;

    if (records.length > 0) {
      // 2. Compute inserted-vs-skipped before the write (the
      // ignore-duplicates POST returns no body so we can't introspect after).
      const existing = await existingKeys(records);
      for (const r of records) {
        if (existing.has(`${r.date_et}|${r.session}`)) skipped++;
        else inserted++;
      }

      // 3. Batched INSERT (idempotent). PostgREST needs both the
      // on_conflict URL param AND the resolution Prefer header to silently
      // skip duplicates instead of 409'ing — without on_conflict the server
      // doesn't know which unique constraint we're targeting.
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        await sbInsertBatch(
          'histories_tx?on_conflict=date_et,session',
          batch,
          'resolution=ignore-duplicates,return=minimal',
        );
      }
    }

    // 4. Rebuild datasets if we actually wrote new history. (If everything
    // was a duplicate, datasets are already in sync — skip the heavy work.)
    let anchor = '';
    let boxWritten = 0;
    let pairWritten = 0;
    let aggregateSkipped = false;
    if (inserted > 0) {
      const draws = await fetchAllHistoriesTx();
      const rb = await rebuildDatasets(draws);
      anchor = rb.anchor;
      boxWritten = rb.boxWritten;
      pairWritten = rb.pairWritten;
    } else {
      aggregateSkipped = true;
    }

    // 5. Audit log (non-fatal).
    try {
      await sbInsertBatch('audit_logs', [{
        action: 'import_tx_raw',
        target: 'histories_tx,datasets_box,datasets_pair',
        payload_meta: {
          source: 'edge:import-tx-raw',
          parsed: records.length,
          inserted, skipped,
          rejected_count: rejected.length,
          anchor, box_rows_written: boxWritten, pair_rows_written: pairWritten,
          aggregate_skipped: aggregateSkipped,
        },
      }]);
    } catch (e) {
      console.warn('[import-tx-raw] audit_logs write failed (non-fatal):', String(e));
    }

    return new Response(JSON.stringify({
      success: true,
      parsed: records.length,
      inserted,
      skipped,
      rejected: rejected.map(r => ({ line_number: r.line_number, reason: r.reason })),
      rejected_count: rejected.length,
      anchor,
      boxRowsWritten: boxWritten,
      pairRowsWritten: pairWritten,
      aggregateSkipped,
      durationMs: Date.now() - started,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[import-tx-raw] error:', msg);
    return new Response(JSON.stringify({
      success: false,
      error: msg,
      durationMs: Date.now() - started,
    }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
