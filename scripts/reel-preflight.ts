// reel-preflight.ts — the ledger-completeness + workflow gate that reel:daily
// never had (OPS-05, 2026-09-27: the 9/26 midday ledger was never imported;
// the morning run graded half a day and only a manual histories query caught
// it). run-daily-reels.sh calls this BEFORE detaching; a non-zero exit stops
// the run before any renderer touches the dev server.
//
//   npx tsx scripts/reel-preflight.ts            # D−1 = yesterday ET, D = today ET
//   npx tsx scripts/reel-preflight.ts 20261008   # explicit D−1 stamp
//   npm run reel:daily -- --skip-preflight       # operator escape hatch (stated)
//
// Three checks, all fail-closed, all read-only (anon key, same REST the app uses):
//   1. LEDGER   — histories for D−1 has BOTH sessions, and each session's row
//                 count is ≥ LEDGER_FLOOR × the same weekday one week earlier
//                 (D−8). Sundays run light (~27/38) and some Saturdays follow
//                 the Sunday pattern, so the baseline is same-weekday, not a
//                 fixed number. A missing session = verify / allday_public /
//                 record_public under-count receipts.
//   2. GRADED   — adaptive_tracking for D−1 has result_at stamped on every
//                 scope (allday / midday / evening). Unstamped = the Daily
//                 Workflow has not run; verify would read 0 of 6 and abort,
//                 and the hook cards would carry the wrong count.
//   3. BOARDS   — slate_snapshots has a live (deleted_at IS NULL) board for D
//                 on all three scopes. Missing = slate reels would capture a
//                 stale or empty Home.
// Nothing here writes. Nothing here regenerates — slate regen stays an
// explicit operator ask (feedback_no_slate_regen_without_ask).

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve('.env'), quiet: true });

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error('ABORT(preflight): EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing (load .env).');
  process.exit(2);
}

const LEDGER_FLOOR = 0.7;            // session count must be ≥ 70% of the same weekday a week earlier
const SCOPES = ['allday', 'midday', 'evening'] as const;
const SESSIONS = ['midday', 'evening'] as const;

function etDate(offsetDays: number): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString('en-CA');
}
function stampToIso(s: string): string { return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; }
function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${URL_}${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

async function sessionCounts(dateEt: string): Promise<Record<string, number>> {
  const rows = await get<{ session: string }[]>(`/rest/v1/histories?date_et=eq.${dateEt}&select=session&limit=1000`);
  const out: Record<string, number> = { midday: 0, evening: 0 };
  for (const r of rows) out[r.session] = (out[r.session] ?? 0) + 1;
  return out;
}

async function main() {
  const arg = process.argv.slice(2).find(a => /^\d{8}$/.test(a));
  const dMinus1 = arg ? stampToIso(arg) : etDate(-1);
  const d = shift(dMinus1, 1);
  const baselineDay = shift(dMinus1, -7);
  const fails: string[] = [];
  const notes: string[] = [];

  // 1. LEDGER
  const [cur, base] = await Promise.all([sessionCounts(dMinus1), sessionCounts(baselineDay)]);
  for (const s of SESSIONS) {
    const c = cur[s] ?? 0, b = base[s] ?? 0;
    if (c === 0) { fails.push(`LEDGER: ${dMinus1} ${s} has 0 rows — session not imported`); continue; }
    if (b > 0 && c < Math.floor(b * LEDGER_FLOOR)) fails.push(`LEDGER: ${dMinus1} ${s} = ${c} rows vs ${b} on ${baselineDay} (same ${weekday(baselineDay)}) — below ${Math.round(LEDGER_FLOOR * 100)}% floor, partial import`);
  }
  notes.push(`ledger ${dMinus1} (${weekday(dMinus1)}): midday ${cur.midday} / evening ${cur.evening} · baseline ${baselineDay}: ${base.midday} / ${base.evening}`);

  // 2. GRADED
  const at = await get<{ scope: string; result_at: string | null }[]>(
    `/rest/v1/adaptive_tracking?slate_date=eq.${dMinus1}&mode=eq.balanced&select=scope,result_at&limit=200`);
  for (const sc of SCOPES) {
    const rows = at.filter(r => r.scope === sc);
    if (rows.length === 0) { fails.push(`GRADED: ${dMinus1} ${sc} has no tracking rows — no board was built that day`); continue; }
    const stamped = rows.filter(r => r.result_at).length;
    if (stamped === 0) fails.push(`GRADED: ${dMinus1} ${sc} tracking rows are unstamped (result_at NULL) — Daily Workflow has not graded D−1`);
  }
  notes.push(`graded ${dMinus1}: ${SCOPES.map(sc => `${sc} ${at.filter(r => r.scope === sc && r.result_at).length}/${at.filter(r => r.scope === sc).length}`).join(' · ')}`);

  // 3. BOARDS
  const boards = await get<{ scope: string; updated_at_et: string }[]>(
    `/rest/v1/slate_snapshots?slate_date=eq.${d}&deleted_at=is.null&mode=eq.balanced&select=scope,updated_at_et&limit=20`);
  for (const sc of SCOPES) {
    if (!boards.some(b => b.scope === sc)) fails.push(`BOARDS: no live ${sc} board for ${d} — run the Daily Workflow first`);
  }
  const newest = boards.map(b => b.updated_at_et).sort().pop();
  notes.push(`boards ${d}: ${boards.map(b => b.scope).sort().join(', ') || 'none'}${newest ? ` · newest ${newest}` : ''}`);

  for (const n of notes) console.log(`preflight: ${n}`);
  if (fails.length) {
    for (const f of fails) console.error(`ABORT(preflight): ${f}`);
    console.error('preflight: fix the data (import the missing session / run the Daily Workflow), then relaunch npm run reel:daily. Escape hatch, operator-stated only: npm run reel:daily -- --skip-preflight');
    process.exit(2);
  }
  console.log('preflight: PASS — ledger complete, D−1 graded on all scopes, D boards live');
}

main().catch(e => { console.error(`ABORT(preflight): ${e instanceof Error ? e.message : String(e)}`); process.exit(2); });
