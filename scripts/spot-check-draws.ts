/**
 * spot-check-draws.ts — CONFIG-19: the weekly draw-row spot check.
 *
 * Every `histories` row is a manual Lottery Post paste (ARCH-09; operator-
 * confirmed 2026-09-20). Until an official feed exists (MKT-81 backend item)
 * a SAMPLED manual check against the state sites is the only verification
 * behind every "checked against the draw results" string.
 *
 * Operator-run after the Sunday import (OPS-01: no cron, ever).
 *
 *   npm run spot-check:draws                       # print this ISO week's sample (10 rows, last 7 days)
 *   npm run spot-check:draws -- --verify <id>,<id> # mark rows confirmed (verified_at = now)
 *   npm run spot-check:draws -- --discrepancy <id> "what the state site shows"
 *   npm run spot-check:draws -- --week 2026-W38    # re-print an earlier week's sample
 *
 * The sample is SEEDED BY ISO WEEK so a re-run prints the same ten rows —
 * the operator can check five today and five tomorrow. Writes use the same
 * service-role client as `npm run import:results` (scripts/backfill/write.ts,
 * .env.backtest); nothing here is reachable from the anon key (SEC-05).
 *
 * A discrepancy means the row is CORRECTED (re-import the true digits) AND the
 * correction is logged in MASTER_AUDIT CONFIG-19; if the row is inside the
 * STAT-01 ledger window the ledger is rebuilt and re-hashed.
 */
import { config as loadEnv } from 'dotenv';
import { sbPatch } from './backfill/write.js';
loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SVC_KEY) { console.error('Missing .env.backtest credentials.'); process.exit(1); }

const SAMPLE = 10;
const DAYS = 7;

interface Row { id: string; jurisdiction: string; date_et: string; session: string; result_digits: string; source: string; verified_at: string | null; discrepancy: string | null }

const args = process.argv.slice(2);
const flag = (name: string): string | null => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] ?? null) : null; };

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
/** mulberry32 — small, deterministic, good enough to pick 10 of ~500. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function seedFromWeek(week: string): number { let h = 2166136261; for (const ch of week) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: { apikey: SVC_KEY!, Authorization: `Bearer ${SVC_KEY}` } });
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

(async () => {
  const verify = flag('--verify');
  const discrepancyId = flag('--discrepancy');
  if (verify) {
    const ids = verify.split(',').map(s => s.trim()).filter(Boolean);
    for (const id of ids) await sbPatch(`/histories?id=eq.${id}`, { verified_at: new Date().toISOString() });
    console.log(`verified_at set on ${ids.length} row(s).`);
    return;
  }
  if (discrepancyId) {
    const note = args[args.indexOf('--discrepancy') + 2];
    if (!note) { console.error('--discrepancy <id> "<what the state site shows>"'); process.exit(1); }
    await sbPatch(`/histories?id=eq.${discrepancyId}`, { discrepancy: note.slice(0, 500), verified_at: new Date().toISOString() });
    console.log(`discrepancy recorded on ${discrepancyId}. Now correct the row (re-import the true digits) and log it under MASTER_AUDIT CONFIG-19; rebuild + re-hash the STAT-01 ledger if the date is inside its window.`);
    return;
  }

  const today = new Date();
  const week = flag('--week') ?? isoWeek(today);
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - (DAYS - 1) * 86400_000).toISOString().slice(0, 10);
  const rows = await get<Row[]>(`/histories?select=id,jurisdiction,date_et,session,result_digits,source,verified_at,discrepancy&date_et=gte.${from}&date_et=lte.${to}&order=date_et.asc,jurisdiction.asc,session.asc,id.asc&limit=1000`);
  if (rows.length === 0) { console.log(`No histories rows ${from}→${to}.`); return; }
  const r = rng(seedFromWeek(week));
  const pool = rows.slice();
  const picked: Row[] = [];
  while (picked.length < Math.min(SAMPLE, pool.length)) picked.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  picked.sort((a, b) => a.date_et.localeCompare(b.date_et) || a.jurisdiction.localeCompare(b.jurisdiction));

  console.log(`CONFIG-19 spot check · ${week} · ${from}→${to} · ${rows.length} rows in window · sample ${picked.length} (seeded by ISO week — re-runs print the same rows)`);
  console.log('Compare each row against the STATE SITE (not an aggregator), then: --verify <id,...> or --discrepancy <id> "<site digits>"\n');
  console.log('id                                    jurisdiction  date        session  digits  source              status');
  for (const p of picked) {
    const status = p.discrepancy ? `DISCREPANCY: ${p.discrepancy}` : p.verified_at ? `verified ${p.verified_at.slice(0, 10)}` : '';
    console.log(`${p.id}  ${p.jurisdiction.padEnd(12)}  ${p.date_et}  ${p.session.padEnd(7)}  ${p.result_digits}     ${p.source.padEnd(18)}  ${status}`);
  }
  const already = rows.filter(x => x.verified_at).length;
  console.log(`\nwindow: ${already} of ${rows.length} rows carry verified_at; ${rows.filter(x => x.discrepancy).length} discrepancies.`);
})().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
