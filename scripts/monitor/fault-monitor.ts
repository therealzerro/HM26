// fault-monitor.ts — FAULT-MON-01 CLI (2026-10-25). Operator-triggered, read-only,
// fail-open. Scans every jurisdiction×session stream in `histories` for a
// NON-UNIFORM draw (the only edge this game has ever had — ENG-REVIEW-04) and
// prints FLAG / WATCH lines plus the top rising e-values. Detectors and
// thresholds live in lib/faultMonitor.ts.
//
//   npm run monitor:fault                        # coverage era (2026-04-01) → today ET
//   npm run monitor:fault -- --as-of 2026-04-21  # replay the ledger as it stood on a date
//   npm run monitor:fault -- --from 2026-07-01   # move the e-process start
//   npm run monitor:fault -- --json              # machine-readable scan
//   npm run monitor:fault -- --strict            # exit 3 on any FLAG (default exit 0, always)
//
// Nothing here is scheduled (ops_no_auto_crons). The reel pre-flight prints the
// same scan as a NOTE every morning the operator runs reel:daily.

import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { scanFaults, formatFaultReport } from '../../lib/faultMonitor';

loadEnv({ path: resolve('.env'), quiet: true });

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error('fault-monitor: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing (load .env).');
  process.exit(2);
}

export const COVERAGE_START = '2026-04-01'; // full-coverage era; Jan–Mar = one jurisdiction

function etToday(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).toLocaleDateString('en-CA');
}
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Row { jurisdiction: string; session: string; date_et: string; result_digits: string; created_at: string }

export async function fetchHistories(from: string, to: string): Promise<Row[]> {
  const all: Row[] = [];
  const page = 1000;
  for (let offset = 0; offset < 100_000; offset += page) {
    const path = `/rest/v1/histories?select=jurisdiction,session,date_et,result_digits,created_at` +
      `&date_et=gte.${from}&date_et=lte.${to}&order=date_et.asc,created_at.asc,id.asc&limit=${page}&offset=${offset}`;
    const r = await fetch(`${URL_}${path}`, { headers: { apikey: KEY!, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} on ${path}: ${(await r.text()).slice(0, 200)}`);
    const rows = (await r.json()) as Row[];
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all;
}

async function main() {
  const from = arg('--from') ?? COVERAGE_START;
  const asOf = arg('--as-of') ?? etToday();
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    console.error('fault-monitor: --from / --as-of take YYYY-MM-DD');
    process.exit(2);
  }
  const rows = await fetchHistories(from, asOf);
  const scan = scanFaults(
    rows.map(r => ({ stream: `${r.jurisdiction}|${r.session}`, date: r.date_et, digits: r.result_digits, order: r.created_at })),
    { from, asOf },
  );
  if (json) {
    console.log(JSON.stringify({ from, asOf, ...scan, eValues: scan.eValues.slice(0, 40) }, null, 2));
  } else {
    for (const line of formatFaultReport(scan, { from, asOf })) console.log(line);
  }
  const flags = scan.signals.filter(s => s.severity === 'FLAG').length;
  if (strict && flags > 0) process.exit(3);
}

main().catch(e => {
  // fail-open: a monitor outage is never a reason to stop the day's work
  console.error(`fault-monitor: skipped — ${e instanceof Error ? e.message : String(e)}`);
  process.exit(0);
});
