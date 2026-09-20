// STAT-01 PHASE 1 — THE LEDGER. Rebuild-from-source only (order §1.3).
//
// One row per (board, draw_event) over the study window, built from two stored
// artifacts and nothing else:
//   · slate_snapshots   — every snapshot ever written for (scope, slate_date),
//                         INCLUDING soft-deleted rows (G4: deleted_at ignored)
//   · histories         — the draw store (G3: accepted as the fixed draw set;
//                         provenance unrecorded — see preregistration_v1.md)
//
// Board selection (G4): for each (scope, date) the study board is THE LATEST
// snapshot written BEFORE THE CUTOFF (10:00 ET midday/allday, 18:00 ET evening),
// whether or not it is soft-deleted. The data-derived guard (board written after
// the first `imported_at` of that day's graded draws) is ALSO applied; a board
// fails if it fails either. Backfilled boards (`_source=backfill`, G1) can never
// be pre-cutoff (they are written days later), so a key whose only snapshots are
// backfills is `no_board_stored`; a key with non-backfill snapshots but none
// pre-cutoff is `timestamp_after_draw`.
//
// Grading is recomputed here from raw draws with the production rule
// (run-hit-detection/index.ts:354-368): box = comboset_sorted === comboSet;
// straight = result_digits === (bestOrder ?? combo); allday grades against
// every draw on the date, sessions only against their own session. Stored hit
// flags are never read (BUG-162). Distinct box classes on one board are
// disjoint against a single draw, so a (board, draw) row carries at most one
// box match — summing box_match over rows is exactly the total match count.
//
// Output: docs/stat01/ledger.csv (deterministic order) + ledger_manifest.json
// with the sha256 of the CSV bytes and every count. Re-running on unchanged
// inputs must reproduce the hash (§1.4).
//
// ⛔ This script computes NO statistic. Phase 2 lives in analytic-base-rate.ts.

import { config as loadEnv } from 'dotenv';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

loadEnv();

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
if (!URL || !KEY) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env');

// ── Pre-registered constants (G4, G5) ────────────────────────────────────────
export const WINDOW_START = '2026-04-18';
export const WINDOW_END   = '2026-09-19';
export const SECONDARY_WINDOW_START = '2026-07-23';    // corroborated era (G5)
export const CUTOFF_ET_HOUR: Record<string, number> = { midday: 10, allday: 10, evening: 18 };
const ET_OFFSET_HOURS = 4;   // whole window is EDT (2026-03-08 → 2026-11-01); asserted below
const SCOPES = ['midday', 'evening', 'allday'] as const;
type Scope = typeof SCOPES[number];

export const EXCLUSION_REASONS = [
  'no_board_stored', 'timestamp_missing', 'timestamp_after_draw',
  'non_official_source', 'grading_era_change', 'jurisdiction_gap',
] as const;
type Reason = typeof EXCLUSION_REASONS[number];

// ── REST (paginated; PostgREST caps at 1000) ─────────────────────────────────
async function sbAll<T>(path: string, orderCol = 'id'): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${URL}${path}${sep}order=${orderCol}.asc&limit=${PAGE}&offset=${offset}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface SnapRow {
  id: string; scope: string; slate_date: string; mode: string; jurisdiction: string | null;
  updated_at_et: string | null; deleted_at: string | null;
  horizons_present_json: any; top_k_straights_json: any;
}
interface HistRow {
  id: string; jurisdiction: string; game: string; date_et: string; session: string;
  result_digits: string; comboset_sorted: string; imported_at: string | null;
}
interface Pick { combo: string; bestOrder: string | null; comboSet: string; cls: 'sixway' | 'double' | 'triple' }

function classOf(comboSet: string): Pick['cls'] {
  const d = comboSet.match(/\d/g) ?? [];
  const distinct = new Set(d).size;
  return distinct === 3 ? 'sixway' : distinct === 2 ? 'double' : 'triple';
}
function toComboSet(digits: string): string {
  return '{' + digits.split('').sort().join(',') + '}';
}

function cutoffUtcMs(scope: string, date: string): number {
  // date is an ET calendar day; cutoff hour ET → UTC by the fixed EDT offset.
  return Date.parse(`${date}T00:00:00Z`) + (CUTOFF_ET_HOUR[scope] + ET_OFFSET_HOURS) * 3600_000;
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
}

async function main() {
  const t0 = Date.now();
  if (WINDOW_START < '2026-03-08' || WINDOW_END > '2026-11-01') throw new Error('window crosses a DST boundary; ET_OFFSET_HOURS is fixed at 4');

  // ── Source 1: every snapshot (deleted or not) for the national balanced board ──
  const snaps = await sbAll<SnapRow>(
    `/rest/v1/slate_snapshots?jurisdiction=is.null&mode=eq.balanced&scope=in.(midday,evening,allday)` +
    `&slate_date=gte.${WINDOW_START}&slate_date=lte.${WINDOW_END}` +
    `&select=id,scope,slate_date,mode,jurisdiction,updated_at_et,deleted_at,horizons_present_json,top_k_straights_json`,
  );
  // ── Source 2: every draw in the window ──
  const draws = await sbAll<HistRow>(
    `/rest/v1/histories?date_et=gte.${WINDOW_START}&date_et=lte.${WINDOW_END}` +
    `&select=id,jurisdiction,game,date_et,session,result_digits,comboset_sorted,imported_at`,
  );
  console.log(`[ledger] snapshots=${snaps.length} (incl. soft-deleted)  draws=${draws.length}`);

  // Sanity on the draw store: sessions strictly midday|evening; digits 3-wide.
  const badSession = draws.filter(d => d.session !== 'midday' && d.session !== 'evening');
  const badDigits  = draws.filter(d => !/^\d{3}$/.test(d.result_digits));
  const badSet     = draws.filter(d => /^\d{3}$/.test(d.result_digits) && toComboSet(d.result_digits) !== d.comboset_sorted);
  if (badSession.length || badDigits.length || badSet.length) {
    console.warn(`[ledger] ⚠ draw-store anomalies: session=${badSession.length} digits=${badDigits.length} comboset≠sorted(digits)=${badSet.length}`);
  }

  // Draw pools per (scope, date) — exactly the production session rule.
  const pool = new Map<string, HistRow[]>();        // `${scope}|${date}` → draws
  const firstImport = new Map<string, number>();     // `${scope}|${date}` → min imported_at ms
  for (const d of draws) {
    for (const scope of SCOPES) {
      if (scope !== 'allday' && d.session !== scope) continue;
      const k = `${scope}|${d.date_et}`;
      (pool.get(k) ?? pool.set(k, []).get(k)!).push(d);
      const imp = d.imported_at ? Date.parse(d.imported_at) : NaN;
      if (!Number.isNaN(imp)) firstImport.set(k, Math.min(firstImport.get(k) ?? Infinity, imp));
    }
  }

  // Snapshots per key.
  const byKey = new Map<string, SnapRow[]>();
  for (const s of snaps) {
    const k = `${s.scope}|${s.slate_date}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(s);
  }

  // ── Board selection (G4) ──
  interface Board {
    key: string; scope: Scope; date: string; snapshot_id: string | null; written_at: string | null;
    source: string | null; was_deleted: boolean | null; picks: Pick[]; excluded: boolean; reason: Reason | '';
    marginFlag: boolean;     // excluded by the fixed cutoff, but a non-backfill snapshot exists within 60 min after it
    dataGuardOnly: boolean;  // pre-cutoff board that fails only the data-derived guard
  }
  const boards: Board[] = [];
  const dateList: string[] = [];
  for (let d = WINDOW_START; d <= WINDOW_END; d = addDays(d, 1)) dateList.push(d);

  const pickAnomalies: string[] = [];
  const parsePicks = (s: SnapRow): Pick[] => {
    let raw: any = s.top_k_straights_json;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
    if (!Array.isArray(raw)) return [];
    const picks: Pick[] = [];
    for (const p of raw) {
      const combo = String(p?.combo ?? '');
      const comboSet = String(p?.comboSet ?? p?.normKey ?? (combo ? toComboSet(combo) : ''));
      if (!/^\d{3}$/.test(combo) || !comboSet) continue;
      const bestOrder = typeof p?.bestOrder === 'string' && /^\d{3}$/.test(p.bestOrder) ? p.bestOrder : null;
      if (bestOrder && toComboSet(bestOrder) !== comboSet) pickAnomalies.push(`${s.id} ${combo}/${bestOrder}/${comboSet}`);
      if (toComboSet(combo) !== comboSet) pickAnomalies.push(`${s.id} combo≠set ${combo}/${comboSet}`);
      picks.push({ combo, bestOrder, comboSet, cls: classOf(comboSet) });
    }
    return picks;
  };

  for (const date of dateList) {
    for (const scope of SCOPES) {
      const key = `${scope}|${date}`;
      const cands = (byKey.get(key) ?? []).filter(s => parsePicks(s).length > 0);
      const cutoff = cutoffUtcMs(scope, date);
      const nonBackfill = cands.filter(s => s.horizons_present_json?._source !== 'backfill');
      const stamped = nonBackfill.filter(s => s.updated_at_et);
      const pre = stamped.filter(s => Date.parse(s.updated_at_et!) < cutoff)
                         .sort((a, b) => Date.parse(b.updated_at_et!) - Date.parse(a.updated_at_et!));
      const b: Board = { key, scope, date, snapshot_id: null, written_at: null, source: null, was_deleted: null,
                         picks: [], excluded: true, reason: '', marginFlag: false, dataGuardOnly: false };
      if (cands.length === 0) {
        b.reason = 'no_board_stored';
      } else if (nonBackfill.length === 0) {
        b.reason = 'no_board_stored';                       // G1: backfill-only key
      } else if (stamped.length === 0) {
        b.reason = 'timestamp_missing';
      } else if (pre.length === 0) {
        b.reason = 'timestamp_after_draw';
        b.marginFlag = stamped.some(s => Date.parse(s.updated_at_et!) < cutoff + 3600_000);
      } else {
        const s = pre[0];
        b.snapshot_id = s.id; b.written_at = s.updated_at_et; b.source = s.horizons_present_json?._source ?? null;
        b.was_deleted = !!s.deleted_at; b.picks = parsePicks(s);
        const fi = firstImport.get(key);
        if (fi !== undefined && Date.parse(s.updated_at_et!) >= fi) {
          b.reason = 'timestamp_after_draw'; b.dataGuardOnly = true;
        } else {
          b.excluded = false;
        }
      }
      boards.push(b);
    }
  }

  // ── Rows: one per (board, draw_event) ──
  const header = [
    'draw_id', 'date', 'scope', 'jurisdiction', 'session', 'result_at', 'imported_at',
    'winning_digits', 'winning_box_class', 'board_id', 'board_written_at', 'board_source', 'board_was_deleted',
    'board_combos', 'board_best_orders', 'n_sixway', 'n_double', 'n_triple',
    'box_match', 'straight_match', 'matched_combo', 'excluded', 'exclusion_reason',
  ];
  // RFC-4180 quoting: the tri-state code is literally "ME,NH,VT".
  const q = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lines: string[] = [header.join(',')];
  const counts = { rows_in: 0, rows_excluded: 0, rows_surviving: 0 } as Record<string, number>;
  const byReason: Record<string, number> = Object.fromEntries(EXCLUSION_REASONS.map(r => [r, 0]));
  const boardsByReason: Record<string, number> = Object.fromEntries(EXCLUSION_REASONS.map(r => [r, 0]));
  let boardsSurviving = 0, boardsFromDeleted = 0, boardsMargin = 0, boardsDataGuardOnly = 0, keysNoDraws = 0;
  const compHist: Record<string, number> = {};

  for (const b of boards) {
    const drawsHere = (pool.get(b.key) ?? []).slice().sort((x, y) =>
      x.jurisdiction.localeCompare(y.jurisdiction) || x.session.localeCompare(y.session) ||
      x.result_digits.localeCompare(y.result_digits) || x.id.localeCompare(y.id));
    if (drawsHere.length === 0) { keysNoDraws++; continue; }   // no draw events → no rows (grain is (board, draw))
    if (b.excluded) { boardsByReason[b.reason]++; if (b.marginFlag) boardsMargin++; if (b.dataGuardOnly) boardsDataGuardOnly++; }
    else { boardsSurviving++; if (b.was_deleted) boardsFromDeleted++; }
    const n6 = b.picks.filter(p => p.cls === 'sixway').length;
    const n2 = b.picks.filter(p => p.cls === 'double').length;
    const n1 = b.picks.filter(p => p.cls === 'triple').length;
    if (!b.excluded) compHist[`${n6}/${n2}/${n1}`] = (compHist[`${n6}/${n2}/${n1}`] ?? 0) + 1;
    for (const d of drawsHere) {
      counts.rows_in++;
      let box = false, straight = false, matched = '';
      if (!b.excluded) {
        for (const p of b.picks) {
          const bx = d.comboset_sorted === p.comboSet;
          const st = d.result_digits === (p.bestOrder ?? p.combo);
          if (bx || st) { box = box || bx; straight = straight || st; matched = matched || p.combo; }
        }
        counts.rows_surviving++;
      } else { counts.rows_excluded++; byReason[b.reason]++; }
      lines.push([
        d.id, d.date_et, b.scope, d.jurisdiction, d.session, '', d.imported_at ?? '',
        d.result_digits, classOf(d.comboset_sorted),
        b.snapshot_id ?? '', b.written_at ?? '', b.source ?? '', b.was_deleted === null ? '' : String(b.was_deleted),
        b.picks.map(p => p.combo).join(' '), b.picks.map(p => p.bestOrder ?? p.combo).join(' '),
        n6, n2, n1, box ? 1 : 0, straight ? 1 : 0, matched, b.excluded ? 1 : 0, b.reason,
      ].map(q).join(','));
    }
  }

  const csv = lines.join('\n') + '\n';
  const hash = createHash('sha256').update(csv).digest('hex');
  const outDir = join(process.cwd(), 'docs', 'stat01');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'ledger.csv'), csv);
  const manifest = {
    study: 'STAT-01', phase: 1, built_at: new Date().toISOString(),
    window: { start: WINDOW_START, end: WINDOW_END, secondary_start: SECONDARY_WINDOW_START },
    cutoff_et_hour: CUTOFF_ET_HOUR, et_offset_hours: ET_OFFSET_HOURS,
    sources: { slate_snapshots_rows_fetched: snaps.length, histories_rows_fetched: draws.length },
    ledger_sha256: hash, ledger_rows: lines.length - 1,
    rows: counts, rows_excluded_by_reason: byReason,
    boards: {
      keys_in_window: boards.length, keys_with_no_draws_in_pool: keysNoDraws,
      surviving: boardsSurviving, surviving_taken_from_soft_deleted_snapshot: boardsFromDeleted,
      excluded_by_reason: boardsByReason,
      g4_margin_excluded_by_fixed_cutoff_only_snapshot_within_60min_after_cutoff: boardsMargin,
      excluded_by_data_guard_only: boardsDataGuardOnly,
      surviving_composition_histogram: compHist,
    },
    draw_store_anomalies: { bad_session: badSession.length, bad_digits: badDigits.length, comboset_mismatch: badSet.length },
    pick_anomalies: pickAnomalies.slice(0, 20), pick_anomaly_count: pickAnomalies.length,
    notes: [
      'histories_unique = (jurisdiction, game, date_et, session, result_digits): two draws of the same digits in the same bucket/day collapse to one row; graded as one event here, exactly as production grades them (known under-count, affects observed and null alike).',
      'result_at is empty: the draw store records no draw time; imported_at is the only per-row timestamp.',
      'Stored hit flags (adaptive_tracking, daily_intelligence, snapshot hitType) were not read (BUG-162).',
      'Provenance: draw rows were manually transcribed from Lottery Post (aggregator); provenance is uniform but unverified per row; observed and null are graded against the same rows.',
    ],
    duration_ms: Date.now() - t0,
  };
  writeFileSync(join(outDir, 'ledger_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ ...manifest, pick_anomalies: undefined }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
