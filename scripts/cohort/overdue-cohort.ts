/**
 * overdue-cohort.ts — COHORT-01 (2026-06-10)
 *
 * Standing falsification harness for the operator's overdue-reversion thesis:
 * "combos at the top of the pooled H01Y draws-since list (red/blue zone)
 * cannot stay there long, so overdue-ness should be bettable."
 *
 * Every run reconstructs, for each evaluation day, the pooled overdue ranking
 * across all jurisdictions (singles box sets only, like the Lottery Post
 * combinations view) using ONLY draws before that day, then measures whether
 * the most-overdue cohorts hit at a higher rate that day than uniform chance
 * predicts. A per-jurisdiction lens runs alongside it, since a real ticket
 * pays per state. The evaluation window grows automatically as draws
 * accumulate — re-run after imports and the verdict updates itself.
 *
 * 2026-06-10 baseline (eval 2026-05-01 → 06-09, via SQL prototype): pooled
 * red 38.5% / blue 33.3% / rest 35.6% vs uniform 35.2% — flat, no gradient.
 *
 * Coverage guard: histories before 2026-04-01 is a single jurisdiction at
 * ~2 draws/day (the pool jumps to 38-39 jurisdictions in April). Draws-since
 * computed across that cliff is meaningless, so COVERAGE_START is pinned and
 * the first WARMUP_DAYS only seed last-seen state.
 *
 * READ-ONLY against Supabase. Writes nothing to the DB. With --log, appends
 * a dated summary block to docs/overdue_cohort_log.md so runs accumulate
 * into a track record.
 *
 * Run: npm run cohort:overdue            (print only)
 *      npm run cohort:overdue -- --log   (print + append to the log)
 */

import { appendFileSync } from 'node:fs';
import { dbGet } from '../backtest/data.js';

const COVERAGE_START = '2026-04-01'; // do not move earlier — coverage cliff
const WARMUP_DAYS = 21;
const SINGLES_SETS = 120; // C(10,3) distinct 3-digit box sets
const LOG_PATH = 'docs/overdue_cohort_log.md';

interface Draw { date: string; jur: string; cs: string }

function isSingles(cs: string): boolean {
  const d = cs.replace(/[{}]/g, '').split(',');
  return d.length === 3 && d[0] !== d[1] && d[1] !== d[2];
}

async function fetchDraws(): Promise<Draw[]> {
  const all: Draw[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const page = await dbGet<any[]>(
      `/histories?select=date_et,jurisdiction,comboset_sorted` +
      `&date_et=gte.${COVERAGE_START}&order=date_et.asc` +
      `&limit=${pageSize}&offset=${offset}`,
    );
    const rows = Array.isArray(page) ? page : [];
    for (const r of rows) {
      if (typeof r?.date_et !== 'string' || typeof r?.comboset_sorted !== 'string') continue;
      if (!isSingles(r.comboset_sorted)) continue;
      all.push({ date: r.date_et, jur: String(r.jurisdiction ?? '?'), cs: r.comboset_sorted });
    }
    if (rows.length < pageSize) break;
  }
  return all;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

interface Bucket { name: string; n: number; hits: number; exp: number; varSum: number; daysSum: number }

const mkBuckets = (names: string[]): Bucket[] =>
  names.map((name) => ({ name, n: 0, hits: 0, exp: 0, varSum: 0, daysSum: 0 }));

function record(b: Bucket, hit: boolean, p: number, daysSince: number) {
  b.n += 1;
  if (hit) b.hits += 1;
  b.exp += p;
  b.varSum += p * (1 - p);
  b.daysSum += daysSince;
}

function bucketTable(buckets: Bucket[]): string {
  const lines = [
    '| Cohort | Set-days | Avg days overdue | Hits | Observed | Expected (uniform) | z |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const b of buckets) {
    if (b.n === 0) continue;
    const obs = (100 * b.hits) / b.n;
    const expPct = (100 * b.exp) / b.n;
    const z = b.varSum > 0 ? (b.hits - b.exp) / Math.sqrt(b.varSum) : 0;
    lines.push(
      `| ${b.name} | ${b.n} | ${(b.daysSum / b.n).toFixed(1)} | ${b.hits} ` +
      `| ${obs.toFixed(2)}% | ${expPct.toFixed(2)}% | ${z.toFixed(2)} |`,
    );
  }
  return lines.join('\n');
}

function run(draws: Draw[]) {
  const lastDate = draws[draws.length - 1].date;
  const evalStart = addDays(COVERAGE_START, WARMUP_DAYS);
  const days = dateRange(evalStart, lastDate);

  // Per-day indexes (pooled and per-jurisdiction)
  const pooledSets = new Map<string, Set<string>>();   // date -> sets drawn
  const pooledCount = new Map<string, number>();        // date -> singles draw count
  const jurSets = new Map<string, Set<string>>();       // date|jur -> sets drawn
  const jurCount = new Map<string, number>();           // date|jur -> singles draw count
  for (const { date, jur, cs } of draws) {
    if (!pooledSets.has(date)) pooledSets.set(date, new Set());
    pooledSets.get(date)!.add(cs);
    pooledCount.set(date, (pooledCount.get(date) ?? 0) + 1);
    const k = `${date}|${jur}`;
    if (!jurSets.has(k)) jurSets.set(k, new Set());
    jurSets.get(k)!.add(cs);
    jurCount.set(k, (jurCount.get(k) ?? 0) + 1);
  }
  const jurisdictions = [...new Set(draws.map((d) => d.jur))].sort();

  // Walk days in order, maintaining last-seen state from PRIOR days only.
  const pooledLast = new Map<string, string>();                 // cs -> date
  const jurLast = new Map<string, Map<string, string>>();       // jur -> cs -> date
  for (const j of jurisdictions) jurLast.set(j, new Map());
  const seed = dateRange(COVERAGE_START, addDays(evalStart, -1));
  for (const d of seed) {
    for (const cs of pooledSets.get(d) ?? []) pooledLast.set(cs, d);
    for (const j of jurisdictions) {
      for (const cs of jurSets.get(`${d}|${j}`) ?? []) jurLast.get(j)!.set(cs, d);
    }
  }

  const pooled = mkBuckets(['red (top 2 overdue)', 'blue (rank 3-8)', 'next 22 (9-30)', 'rest']);
  const perState = mkBuckets(['red (state top 2)', 'blue (state 3-8)', 'rest']);
  const dayMs = 86_400_000;
  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / dayMs);

  for (const d of days) {
    // Pooled: rank all previously-seen sets by days-since, descending.
    const pHit = 1 - Math.pow((SINGLES_SETS - 1) / SINGLES_SETS, pooledCount.get(d) ?? 0);
    const ranked = [...pooledLast.entries()]
      .map(([cs, seen]) => ({ cs, daysSince: daysBetween(seen, d) }))
      .sort((a, b) => b.daysSince - a.daysSince || a.cs.localeCompare(b.cs));
    const drawnToday = pooledSets.get(d) ?? new Set<string>();
    ranked.forEach((r, i) => {
      const b = i < 2 ? pooled[0] : i < 8 ? pooled[1] : i < 30 ? pooled[2] : pooled[3];
      record(b, drawnToday.has(r.cs), pHit, r.daysSince);
    });

    // Per-state: same walk inside each jurisdiction.
    for (const j of jurisdictions) {
      const last = jurLast.get(j)!;
      if (last.size === 0) continue;
      const pj = 1 - Math.pow((SINGLES_SETS - 1) / SINGLES_SETS, jurCount.get(`${d}|${j}`) ?? 0);
      const rankedJ = [...last.entries()]
        .map(([cs, seen]) => ({ cs, daysSince: daysBetween(seen, d) }))
        .sort((a, b) => b.daysSince - a.daysSince || a.cs.localeCompare(b.cs));
      const drawnJ = jurSets.get(`${d}|${j}`) ?? new Set<string>();
      rankedJ.forEach((r, i) => {
        const b = i < 2 ? perState[0] : i < 8 ? perState[1] : perState[2];
        record(b, drawnJ.has(r.cs), pj, r.daysSince);
      });
    }

    // Roll last-seen forward AFTER scoring the day (no leakage).
    for (const cs of drawnToday) pooledLast.set(cs, d);
    for (const j of jurisdictions) {
      for (const cs of jurSets.get(`${d}|${j}`) ?? []) jurLast.get(j)!.set(cs, d);
    }
  }

  // Live red/blue zone as of the day after the last import (the operator's screenshot view).
  const today = addDays(lastDate, 1);
  let cum = 0;
  const cumByDate = new Map<string, number>(); // draws strictly after each date
  for (const d of dateRange(COVERAGE_START, lastDate).reverse()) {
    cumByDate.set(d, cum);
    cum += pooledCount.get(d) ?? 0;
  }
  const live = [...pooledLast.entries()]
    .map(([cs, seen]) => ({
      cs,
      daysSince: daysBetween(seen, today),
      drawsSince: cumByDate.get(seen) ?? 0,
      lastSeen: seen,
    }))
    .sort((a, b) => b.daysSince - a.daysSince || a.cs.localeCompare(b.cs))
    .slice(0, 8);

  return { evalStart, lastDate, nDays: days.length, pooled, perState, live };
}

async function main() {
  const writeLog = process.argv.includes('--log');
  const draws = await fetchDraws();
  if (draws.length === 0) {
    console.error('[cohort] No singles draws found — check .env.backtest credentials.');
    process.exit(1);
  }
  const r = run(draws);

  const report = [
    `## Overdue cohort run — ${new Date().toISOString().slice(0, 10)}`,
    ``,
    `Eval window ${r.evalStart} → ${r.lastDate} (${r.nDays} days, ${draws.length} pooled singles draws).`,
    `Expected = day-matched uniform chance, P(set hits) = 1 - (119/120)^(singles draws that day).`,
    ``,
    `### Pooled (all jurisdictions — the H01Y screenshot view)`,
    ``,
    bucketTable(r.pooled),
    ``,
    `### Per-jurisdiction (what a single-state ticket experiences)`,
    ``,
    bucketTable(r.perState),
    ``,
    `### Live red/blue zone (most overdue right now, pooled)`,
    ``,
    `| Set | Last seen | Days since | Draws since |`,
    `|---|---|---|---|`,
    ...r.live.map((l) => `| ${l.cs} | ${l.lastSeen} | ${l.daysSince} | ${l.drawsSince} |`),
    ``,
    `Reading: the thesis predicts red/blue observed > expected with a coherent`,
    `red > blue > rest gradient that persists as the window grows. Flat or`,
    `sign-flipping buckets = uniformity holding. z beyond ±2.5 sustained across`,
    `runs is the bar worth acting on (harness noise note: single-window z`,
    `excursions die routinely — see MASTER_AUDIT COHORT-01).`,
    ``,
  ].join('\n');

  console.log(report);
  if (writeLog) {
    appendFileSync(LOG_PATH, `\n${report}\n---\n`);
    console.log(`[cohort] Appended to ${LOG_PATH}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
