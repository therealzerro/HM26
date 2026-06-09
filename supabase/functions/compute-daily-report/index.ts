/**
 * compute-daily-report — Supabase Edge Function
 *
 * Aggregates daily_intelligence rows for a (date × scope) and upserts the
 * result into engine_daily_report. Idempotent — re-running for the same
 * (date, scope) overwrites the row in place.
 *
 * Why this exists: the 7-day ZK6 verification window (2026-05-13 →
 * 2026-05-19) needs a captured daily number, not a "remember to check"
 * ritual. Once shipped, every future engine-change baseline/candidate
 * comparison reads from the same table.
 *
 * Source rows:
 *   daily_intelligence WHERE on_slate=true AND mode='balanced' AND slate_date=:date AND scope=:scope
 *
 * Output per (date, scope):
 *   picks_count, hits_count (hit_box OR hit_straight), straights_count,
 *   boxes_count (= hits - straights), rate = hits / picks, mean_energy,
 *   jurisdictions = { hit_state: { picks, hits } } per state with hits.
 *
 * POST body:
 *   {
 *     "date"?:  "YYYY-MM-DD",    // default: today ET
 *     "scope"?: "midday"|"evening"|"allday",  // default: process all 3
 *     "dryRun"?: boolean
 *   }
 *
 * SCRUB-02 (2026-06-09): production engine is balanced-only since SCRUB-01
 * (2026-05-27). daily_intelligence verified to contain zero non-balanced rows
 * across all 4582 rows. ZK6_MODES collapsed to ['balanced']; modes_included
 * output array retained for engine_daily_report.modes_included column compat.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ZK6_MODES = ['balanced'] as const;
const SCOPES = ['midday', 'evening', 'allday'] as const;

interface DiRow {
  combo: string | null;
  on_slate: boolean | null;
  energy_score: number | null;
  hit_box: boolean | null;
  hit_straight: boolean | null;
  hit_state: string | null;
}

interface ReportRow {
  slate_date: string;
  scope: string;
  picks_count: number;
  hits_count: number;
  straights_count: number;
  boxes_count: number;
  rate: number;
  mean_energy: number | null;
  jurisdictions: Record<string, { picks: number; hits: number }>;
  modes_included: string[];
}

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function fetchRows(date: string, scope: string): Promise<DiRow[]> {
  const modes = ZK6_MODES.join(',');
  const url = `${SUPABASE_URL}/rest/v1/daily_intelligence` +
    `?slate_date=eq.${date}` +
    `&scope=eq.${scope}` +
    `&on_slate=eq.true` +
    `&mode=in.(${modes})` +
    `&select=combo,on_slate,energy_score,hit_box,hit_straight,hit_state` +
    `&limit=10000`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`fetch daily_intelligence ${res.status}: ${await res.text()}`);
  }
  const rows = (await res.json()) as DiRow[];
  return Array.isArray(rows) ? rows : [];
}

function aggregate(date: string, scope: string, rows: DiRow[]): ReportRow {
  let picks = 0;
  let hits = 0;
  let straights = 0;
  let energySum = 0;
  let energyN = 0;
  const juris: Record<string, { picks: number; hits: number }> = {};

  for (const r of rows) {
    picks += 1;
    const hitBox = !!r.hit_box;
    const hitStraight = !!r.hit_straight;
    const isHit = hitBox || hitStraight;
    if (isHit) hits += 1;
    if (hitStraight) straights += 1;
    if (typeof r.energy_score === 'number' && Number.isFinite(r.energy_score)) {
      energySum += r.energy_score;
      energyN += 1;
    }
    // Jurisdiction bucket only set for hit rows (hit_state is the state
    // where the hit landed). Pre-hit-detection rows have hit_state=null,
    // so we can't break down "picks per state" pre-hit. Only post-hit.
    if (isHit && r.hit_state) {
      const k = r.hit_state;
      const cur = juris[k] ?? { picks: 0, hits: 0 };
      cur.picks += 1;
      cur.hits += 1;
      juris[k] = cur;
    }
  }

  const boxes = hits - straights;
  const rate = picks > 0 ? Math.round((hits / picks) * 10000) / 10000 : 0;
  const meanEnergy = energyN > 0 ? Math.round((energySum / energyN) * 1000) / 1000 : null;

  return {
    slate_date: date,
    scope,
    picks_count: picks,
    hits_count: hits,
    straights_count: straights,
    boxes_count: boxes,
    rate,
    mean_energy: meanEnergy,
    jurisdictions: juris,
    modes_included: [...ZK6_MODES],
  };
}

async function upsertReport(row: ReportRow): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/engine_daily_report?on_conflict=slate_date,scope`,
    {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) {
    throw new Error(`upsert engine_daily_report ${res.status}: ${await res.text()}`);
  }
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }
  let body: { date?: string; scope?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date : todayET();
  const scopes = body.scope
    ? [body.scope].filter(s => (SCOPES as readonly string[]).includes(s))
    : [...SCOPES];
  if (scopes.length === 0) {
    return new Response(JSON.stringify({ error: 'invalid scope' }), { status: 400 });
  }

  const results: ReportRow[] = [];
  const errors: Array<{ scope: string; error: string }> = [];

  for (const scope of scopes) {
    try {
      const rows = await fetchRows(date, scope);
      const report = aggregate(date, scope, rows);
      results.push(report);
      if (!body.dryRun) await upsertReport(report);
    } catch (e) {
      errors.push({ scope, error: String(e instanceof Error ? e.message : e) });
    }
  }

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      dryRun: !!body.dryRun,
      date,
      scopes_processed: scopes,
      results,
      errors,
      durationMs: Date.now() - started,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
