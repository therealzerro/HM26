#!/usr/bin/env tsx
/**
 * diag-doubles.ts — Doubles allocation diagnostic
 *
 * Parked finding from 2026-05-18 admin-dashboard cross-cut analysis:
 *   • Over the last 14 days, 0% of midday and allday K6 slates contain ANY
 *     doubles. Evening had 1 double across 57 picks.
 *   • Yet `k6_doubles_max=2` allows up to 2 doubles per slate.
 *   • The 8 doubles that DID get picked across all scopes / 30 days all hit
 *     (100% sample hit rate, n=8).
 *
 * Hypothesis trifurcation:
 *   H1 — Engine scoring ranks doubles too low (BOX frequency penalty: doubles
 *        draw ~50% as often as singles, so frequency-weighted BOX scoring
 *        suppresses them below the indicator cutoff that singles dominate).
 *   H2 — Energy floor `minEnergyThreshold=70` filters most doubles after
 *        scoring (energy is a percentile rank — doubles cluster at lower
 *        percentiles if H1 is true).
 *   H3 — Multiplicity rails are working as intended (the cap is a CEILING not
 *        a floor; doubles are simply outscored by singles every day and never
 *        bubble into the top-6 unless multiplicity priors boost them).
 *
 * This diagnostic operates in two modes:
 *
 * MODE A — DATA-ONLY (this script today):
 *   Reads from adaptive_tracking + slate_snapshots. Answers:
 *     • Per scope, per day, slate composition: how many doubles / singles?
 *     • When doubles ARE picked, their rank-position distribution
 *     • Hit rate by multiplicity, per scope
 *     • Daily trend: is the doubles count rising/falling over the window?
 *   Cannot answer WHICH stage of the engine funnel rejects doubles —
 *   adaptive_tracking only holds the 6 picks that survived all 6 passes.
 *
 * MODE B — ENGINE-INSTRUMENTED (TODO, see comments at end):
 *   Requires adding an optional `diagnosticSink` callback to `tryAdd` in
 *   engines/zk6.ts that emits per-pick reject reasons. Then this script
 *   re-runs computeSlateAsOf with the sink wired up and produces a true
 *   funnel: scored universe → energy floor → cooldown → pair-rep-cap →
 *   multiplicity cap → final K6. Requires ZK6 stability sign-off
 *   (CLAUDE.md rule) so it's gated behind a separate ENH ticket.
 *
 * RESPECT PER-SCOPE: each of midday/evening/allday ingests a SEPARATE
 * combined-jurisdiction history slice. Every metric in this diagnostic is
 * reported per scope; no cross-scope aggregation. See
 * [[feedback-scopes-separate-data]].
 *
 * Usage:
 *   npm run backtest:diag-doubles -- --days 30
 *   npm run backtest:diag-doubles -- --days 14 --mode balanced
 */

import { dbGet } from './data.js';
import type { Scope } from './types.js';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];
const MODES = ['balanced', 'conservative', 'aggressive'] as const;

// ── Argument parsing ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1] ?? 'true';
      i++;
    }
  }
  return args;
}

// ── Multiplicity classifier — matches engineCore.multiplicityOf ────────────────

function multiplicityOf(combo: string): 'singles' | 'doubles' | 'triples' {
  const uniq = new Set(combo.split('')).size;
  if (uniq === 1) return 'triples';
  if (uniq === 2) return 'doubles';
  return 'singles';
}

// ── Data shape from adaptive_tracking ─────────────────────────────────────────

interface AtRow {
  slate_date: string;
  scope: string;
  mode: string;
  slate_hash: string | null;
  rank: number | null;
  combo: string | null;
  hit_box: boolean | null;
  hit_straight: boolean | null;
  matched_state: string | null;
  energy_score: number | null;
  signal_box: number | null;
  signal_pburst: number | null;
  signal_co: number | null;
  signal_burst: number | null;
}

async function fetchAtRows(days: number, mode: string): Promise<AtRow[]> {
  // 1 row per K6 pick × slate_hash × mode (primary rows have matched_state IS NULL
  // pre-detection, populated post-detection; multi-state secondaries inserted by
  // run-hit-detection BUG-150). We want EVERY primary row to compute slate
  // composition correctly — filter to rank BETWEEN 1 AND 6 and dedupe by
  // (slate_hash, rank, combo) to collapse multi-state secondaries into one row
  // per pick.
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const rows = await dbGet<AtRow[]>(
    `/adaptive_tracking?select=slate_date,scope,mode,slate_hash,rank,combo,hit_box,hit_straight,matched_state,energy_score,signal_box,signal_pburst,signal_co,signal_burst&slate_date=gte.${sinceStr}&mode=eq.${encodeURIComponent(mode)}&rank=gte.1&rank=lte.6&order=slate_date.desc,scope,slate_hash,rank&limit=10000`,
  );
  if (!Array.isArray(rows)) return [];

  // Dedupe to one row per (slate_hash, rank, combo). Multi-state secondaries
  // share the same primary but differ on matched_state — for composition we
  // only want the primary (matched_state IS NULL OR first-seen).
  const seen = new Set<string>();
  const out: AtRow[] = [];
  for (const r of rows) {
    if (!r.slate_hash || r.rank == null || !r.combo) continue;
    const k = `${r.slate_hash}|${r.rank}|${r.combo}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ── Per-scope analyses (RESPECT [[feedback-scopes-separate-data]]) ────────────

interface SlateComposition {
  scope: Scope;
  slates: number;
  totalPicks: number;
  singlesPicks: number;
  doublesPicks: number;
  triplesPicks: number;
  slatesWithAnyDouble: number;
  pctSlatesWithDouble: number;
  meanDoublesPerSlate: number;
}

function computeSlateComposition(rows: AtRow[], scope: Scope): SlateComposition {
  const scoped = rows.filter(r => r.scope === scope);
  const bySlate = new Map<string, AtRow[]>();
  for (const r of scoped) {
    if (!r.slate_hash) continue;
    const arr = bySlate.get(r.slate_hash) ?? [];
    arr.push(r);
    bySlate.set(r.slate_hash, arr);
  }
  let singles = 0, doubles = 0, triples = 0;
  let slatesWithAnyDouble = 0;
  for (const picks of bySlate.values()) {
    let dInSlate = 0;
    for (const p of picks) {
      if (!p.combo) continue;
      const mult = multiplicityOf(p.combo);
      if (mult === 'singles') singles++;
      else if (mult === 'doubles') { doubles++; dInSlate++; }
      else triples++;
    }
    if (dInSlate > 0) slatesWithAnyDouble++;
  }
  const slates = bySlate.size;
  const totalPicks = singles + doubles + triples;
  return {
    scope, slates, totalPicks,
    singlesPicks: singles, doublesPicks: doubles, triplesPicks: triples,
    slatesWithAnyDouble,
    pctSlatesWithDouble: slates > 0 ? (100 * slatesWithAnyDouble) / slates : 0,
    meanDoublesPerSlate: slates > 0 ? doubles / slates : 0,
  };
}

interface MultiplicityHitRate {
  scope: Scope;
  singles: { picks: number; hits: number; pct: number };
  doubles: { picks: number; hits: number; pct: number };
  triples: { picks: number; hits: number; pct: number };
}

function computeHitRateByMultiplicity(rows: AtRow[], scope: Scope): MultiplicityHitRate {
  const scoped = rows.filter(r => r.scope === scope);
  const buckets = { singles: { picks: 0, hits: 0 }, doubles: { picks: 0, hits: 0 }, triples: { picks: 0, hits: 0 } };
  for (const r of scoped) {
    if (!r.combo) continue;
    const mult = multiplicityOf(r.combo);
    buckets[mult].picks++;
    if (r.hit_box || r.hit_straight) buckets[mult].hits++;
  }
  const pct = (b: { picks: number; hits: number }) => (b.picks > 0 ? (100 * b.hits) / b.picks : 0);
  return {
    scope,
    singles: { ...buckets.singles, pct: pct(buckets.singles) },
    doubles: { ...buckets.doubles, pct: pct(buckets.doubles) },
    triples: { ...buckets.triples, pct: pct(buckets.triples) },
  };
}

interface DoublesRankDistribution {
  scope: Scope;
  doublePicksByRank: Record<number, number>;
  meanRank: number | null;
}

function computeDoublesRankDistribution(rows: AtRow[], scope: Scope): DoublesRankDistribution {
  const scoped = rows.filter(r => r.scope === scope && r.combo && multiplicityOf(r.combo) === 'doubles');
  const byRank: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let sum = 0, n = 0;
  for (const r of scoped) {
    if (r.rank == null) continue;
    byRank[r.rank] = (byRank[r.rank] ?? 0) + 1;
    sum += r.rank; n++;
  }
  return { scope, doublePicksByRank: byRank, meanRank: n > 0 ? sum / n : null };
}

// ── Output ────────────────────────────────────────────────────────────────────

function printReport(
  days: number,
  mode: string,
  composition: SlateComposition[],
  hitRates: MultiplicityHitRate[],
  rankDists: DoublesRankDistribution[],
) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  DOUBLES ALLOCATION DIAGNOSTIC — last ${days} days, mode=${mode}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Data source: adaptive_tracking (post-cleanup 2026-05-18)');
  console.log('  Scoped per-feedback: each scope ingests separate input data');
  console.log('  Mode: A (data-only). Mode B (engine funnel) is TODO.\n');

  console.log('── A. Slate composition (per scope) ─────────────────────────');
  console.log('   scope    slates  totPicks  singles  doubles  triples  %slates-with-dbl  mean-dbl/slate');
  for (const c of composition) {
    console.log(`   ${c.scope.padEnd(8)} ${String(c.slates).padStart(6)} ${String(c.totalPicks).padStart(9)} ${String(c.singlesPicks).padStart(8)} ${String(c.doublesPicks).padStart(8)} ${String(c.triplesPicks).padStart(8)} ${(c.pctSlatesWithDouble.toFixed(1) + '%').padStart(17)} ${c.meanDoublesPerSlate.toFixed(2).padStart(15)}`);
  }

  console.log('\n── B. Hit rate by multiplicity (per scope) ──────────────────');
  console.log('   scope    singles (n)        doubles (n)        triples (n)');
  for (const h of hitRates) {
    const s = `${h.singles.pct.toFixed(1)}% (${h.singles.picks})`;
    const d = `${h.doubles.pct.toFixed(1)}% (${h.doubles.picks})`;
    const t = `${h.triples.pct.toFixed(1)}% (${h.triples.picks})`;
    console.log(`   ${h.scope.padEnd(8)} ${s.padEnd(18)} ${d.padEnd(18)} ${t.padEnd(18)}`);
  }

  console.log('\n── C. Doubles rank distribution (when picked) ───────────────');
  console.log('   scope    r1  r2  r3  r4  r5  r6   mean');
  for (const r of rankDists) {
    const cells = [1,2,3,4,5,6].map(k => String(r.doublePicksByRank[k] ?? 0).padStart(3));
    const meanS = r.meanRank == null ? '  - ' : r.meanRank.toFixed(2).padStart(4);
    console.log(`   ${r.scope.padEnd(8)} ${cells.join('  ')}   ${meanS}`);
  }

  console.log('\n── Interpretation hints ─────────────────────────────────────');
  console.log('   • If %slates-with-dbl is ~0 across all scopes, doubles are');
  console.log('     never selected — H1 (scoring suppresses) or H2 (energy floor');
  console.log('     filters) is in play. MODE B funnel is needed to distinguish.');
  console.log('   • If doubles hit-rate is higher than singles\' but doubles are');
  console.log('     rarely picked, the engine is under-weighting them — boosting');
  console.log('     the multiplicity prior or relaxing energy floor for doubles');
  console.log('     is a candidate (backtest before shipping).');
  console.log('   • If doubles mean-rank is consistently ≥5, they only enter K6');
  console.log('     after rail-relaxation passes — they\'re not earning a top spot');
  console.log('     on signal alone. Investigate per-scope multiplicity priors');
  console.log('     (engineCore.MULTIPLICITY_PRIORS).\n');
}

// ── TODO: MODE B — engine funnel instrumentation ─────────────────────────────
//
// To answer WHERE doubles get filtered (vs just THAT they don't survive), the
// engine needs to emit per-pick reject reasons. Sketch:
//
//   // In engines/zk6.ts::tryAdd, add an optional sink param:
//   const tryAdd = (idx, relax..., sink?: (reason: string, combo: string) => void): boolean => {
//     const combo = universe[idx];
//     if (selectedComboSets.has(normKey)) { sink?.('dupe', combo); return false; }
//     if (todayHitComboSets.has(normKey)) { sink?.('today-hit-block', combo); return false; }
//     // ... etc for each filter
//   }
//
//   // Then in this script, instantiate the engine with sink wired to a counter
//   // per (scope, multiplicity, reject_reason). Tally over 30 days.
//
// Per CLAUDE.md "ZK6 engine must be fully stable before any work on ZK30" —
// this change is non-functional (zero behavior change when sink is undefined)
// but still needs user sign-off before touching engines/zk6.ts. File a separate
// ENH ticket once Mode A surfaces enough motivation to justify the engine edit.

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = parseInt(args.days ?? '30', 10);
  const mode = (MODES as readonly string[]).includes(args.mode ?? '')
    ? (args.mode as string)
    : 'balanced';

  console.log(`[diag-doubles] Fetching adaptive_tracking — last ${days} days, mode=${mode}`);
  const rows = await fetchAtRows(days, mode);
  console.log(`[diag-doubles] ${rows.length} deduplicated primary-pick rows across all scopes`);

  if (rows.length === 0) {
    console.warn('[diag-doubles] No data. Check .env.backtest credentials.');
    process.exit(1);
  }

  const composition = SCOPES.map(s => computeSlateComposition(rows, s));
  const hitRates    = SCOPES.map(s => computeHitRateByMultiplicity(rows, s));
  const rankDists   = SCOPES.map(s => computeDoublesRankDistribution(rows, s));

  printReport(days, mode, composition, hitRates, rankDists);
}

main().catch(e => {
  console.error('[diag-doubles] Fatal:', e);
  process.exit(1);
});
