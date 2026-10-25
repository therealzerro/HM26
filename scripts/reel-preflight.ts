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
//   5. FAULT    — FAULT-MON-01 (2026-10-25): the gross-fault monitor from
//                 ENG-REVIEW-04 runs over the trailing 120 days of every
//                 jurisdiction×session stream and prints FLAG / WATCH lines.
//                 READ-ONLY and FAIL-OPEN: it never stops the run — a FLAG is
//                 information for the operator (that state's draw is not
//                 uniform), a fetch error is a one-line 'skipped'.

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { scanFaults, formatFaultReport } from '../lib/faultMonitor';

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

  // 4. INTEGRITY (DATA-06 classes, last 7 days) — PARSER-HARDEN-01 companion.
  // Fail-closed on the unambiguous classes; warn on 2-row sessions in one-draw
  // states (Double Draw bonus drawings are legitimate, ruled DATA-06).
  const from7 = shift(dMinus1, -6);
  const hist = await get<{ jurisdiction: string; game: string; date_et: string; session: string; result_digits: string }[]>(
    `/rest/v1/histories?date_et=gte.${from7}&date_et=lte.${dMinus1}&select=jurisdiction,game,date_et,session,result_digits&order=date_et.asc,jurisdiction.asc&limit=1000`);
  if (hist.length >= 1000) fails.push(`INTEGRITY: ${hist.length} rows in ${from7}→${dMinus1} hit the 1000-row page — widen the query before trusting this check`);
  const KNOWN = new Set(['AR','AZ','CA','CO','CT','DC','DE','FL','GA','IA','ID','IL','IN','KS','KY','LA','ME,NH,VT','MI','MN','MO','MS','NC','NE','NJ','NM','NY','OH','OK','ON','PA','QC','SC','TN','TX','VA','W.Canada','WA','WI','WV']);
  const MULTI = new Set(['TX','GA','DC','TN']);
  const EVE_ONLY = new Set(['LA','NE','MN','OK','QC','WA','W.Canada','WV']);
  const slots = new Map<string, string[]>();
  const labels = new Map<string, Set<string>>();
  for (const r of hist) {
    if (!KNOWN.has(r.jurisdiction)) fails.push(`INTEGRITY: unknown jurisdiction "${r.jurisdiction}" on ${r.date_et} — a state header mapped to a code the system does not know`);
    const k = `${r.jurisdiction}|${r.date_et}|${r.session}`;
    slots.set(k, [...(slots.get(k) ?? []), r.result_digits]);
    labels.set(r.jurisdiction, new Set([...(labels.get(r.jurisdiction) ?? []), r.game]));
    if (EVE_ONLY.has(r.jurisdiction) && r.session === 'midday') fails.push(`INTEGRITY: ${r.jurisdiction} ${r.date_et} has a MIDDAY row (${r.result_digits}) — evening-only jurisdiction; a header above it mapped to the wrong state (DATA-06 LA/NE class)`);
  }
  for (const [j, set] of labels) if (set.size > 1) fails.push(`INTEGRITY: ${j} carries ${set.size} game labels in the window (${[...set].join(' | ')}) — label variants defeat the histories unique key`);
  const twoRow: string[] = [];
  for (const [k, digits] of slots) {
    const [j, d, s] = k.split('|');
    const max = MULTI.has(j) ? 2 : 1;
    if (digits.length > max + (MULTI.has(j) ? 0 : 1)) fails.push(`INTEGRITY: ${j} ${d} ${s} has ${digits.length} rows (${digits.join('/')}) — more than ${max}${MULTI.has(j) ? '' : ' + one Double Draw'} is a bad paste`);
    else if (!MULTI.has(j) && digits.length === 2) twoRow.push(`${j} ${d} ${s} ${digits.join('/')}`);
  }
  notes.push(`integrity ${from7}→${dMinus1}: ${hist.length} rows · ${twoRow.length ? `2-row one-draw sessions (Double Draw expected): ${twoRow.join(', ')}` : 'no 2-row one-draw sessions'}`);

  // 5. FAULT MONITOR (FAULT-MON-01) — read-only, fail-open; see lib/faultMonitor.ts
  try {
    const from120 = shift(dMinus1, -119);
    const rows: { jurisdiction: string; session: string; date_et: string; result_digits: string; created_at: string }[] = [];
    for (let offset = 0; offset < 50_000; offset += 1000) {
      const page = await get<typeof rows>(
        `/rest/v1/histories?date_et=gte.${from120}&date_et=lte.${dMinus1}&select=jurisdiction,session,date_et,result_digits,created_at&order=date_et.asc,created_at.asc,id.asc&limit=1000&offset=${offset}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const scan = scanFaults(rows.map(r => ({ stream: `${r.jurisdiction}|${r.session}`, date: r.date_et, digits: r.result_digits, order: r.created_at })), { from: from120, asOf: dMinus1 });
    for (const line of formatFaultReport(scan, { from: from120, asOf: dMinus1, top: 3 })) notes.push(line.replace(/^fault-monitor: /, 'fault-monitor · '));
  } catch (e) {
    notes.push(`fault-monitor · skipped — ${e instanceof Error ? e.message : String(e)} (fail-open; run npm run monitor:fault by hand)`);
  }

  for (const n of notes) console.log(`preflight: ${n}`);
  if (fails.length) {
    for (const f of fails) console.error(`ABORT(preflight): ${f}`);
    console.error('preflight: fix the data (import the missing session / run the Daily Workflow), then relaunch npm run reel:daily. Escape hatch, operator-stated only: npm run reel:daily -- --skip-preflight');
    process.exit(2);
  }
  console.log('preflight: PASS — ledger complete, D−1 graded on all scopes, D boards live, 7-day integrity clean');
}

main().catch(e => { console.error(`ABORT(preflight): ${e instanceof Error ? e.message : String(e)}`); process.exit(2); });
