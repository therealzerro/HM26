#!/usr/bin/env tsx
/**
 * generate-proposal.ts — Weight Proposal Generator
 *
 * Scheduled weekly (Sunday 5 AM ET) per the Weight Proposal System work
 * order. Runs analysis + 5 gates, writes either a proposal or a blocked-
 * proposal row to audit_logs. NEVER modifies app_config (the apply step
 * is operator-driven via ProposalReviewView + lib/applyWeightUpdate.ts).
 *
 * Pipeline:
 *   1. Load adaptive_tracking outcomes (last 30 days, balanced mode)
 *   2. Load current production weights from app_config (per-scope-respecting)
 *   3. Compute proposed weights via scripts/intel-tuning/fit.ts::fitWeights
 *   4. Run 5 gates:
 *      G1 sample size      — refuse if N < 500 AT rows in window
 *      G2 AUC improvement  — refuse if proposed indicator AUC - current < 0.02
 *      G3 historical backtest — refuse if ANY scope regresses on slate hit rate
 *      G4 divergence check — informational; flag if K6 changes >50%
 *      G5 per-scope respect — structural; apply_ops target per-scope keys when
 *                             present, never overwrite per-scope by writing global
 *   5. If G1-G3 pass: POST audit_logs row action='weight_proposal_generated'
 *      with apply_ops, revert_ops, all_gate_results, expires_at = now + 7 days
 *   6. If any of G1-G3 fail: POST 'weight_proposal_blocked' with reason
 *
 * Usage:
 *   npm run autotune:propose             # scheduled run
 *   npm run autotune:propose -- --manual # operator-triggered, same output
 *   npm run autotune:propose -- --dry    # don't write audit_logs, just print
 */

import { dbGet } from '../backtest/data.js';
import { fitWeights, loadIntelligence } from './fit.js';
import { computeSlateAsOf } from '../backtest/replay.js';
import { scorePicksVsResults, fetchDrawResults } from '../backtest/score.js';
import { CONFIGS } from '../backtest/configs.js';
import type { EngineConfig, Scope, WeightSet } from '../backtest/types.js';

const SB_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

const SAMPLE_SIZE_MIN = 500;
const AUC_DELTA_MIN = 0.02;
const DIVERGENCE_FLAG_THRESHOLD = 0.5; // 50% of K6 changed
const LOOKBACK_DAYS = 30;
const PROPOSAL_EXPIRY_DAYS = 7;

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      args[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) i++;
    }
  }
  return args;
}

function dateRange(days: number, endDate?: string): string[] {
  const dates: string[] = [];
  const anchor = endDate ? new Date(endDate + 'T00:00:00Z') : new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

interface ProductionWeights {
  global: { balanced: WeightSet; conservative: WeightSet; aggressive: WeightSet };
  byScope: Partial<Record<Scope, { balanced?: WeightSet; conservative?: WeightSet; aggressive?: WeightSet }>>;
  rawByKey: Record<string, string>;
}

async function loadProductionWeights(): Promise<ProductionWeights> {
  const keys: string[] = [
    'engine_weights_balanced', 'engine_weights_conservative', 'engine_weights_aggressive',
    ...SCOPES.flatMap(s => [
      `engine_weights_balanced_${s}`,
      `engine_weights_conservative_${s}`,
      `engine_weights_aggressive_${s}`,
    ]),
  ];
  const path = `/app_config?key=in.(${keys.join(',')})&select=key,value`;
  const rows = await dbGet<{ key: string; value: string }[]>(path);
  const rawByKey: Record<string, string> = {};
  if (Array.isArray(rows)) for (const r of rows) rawByKey[r.key] = r.value;

  const pct2dec = (v: number) => v > 1 ? v / 100 : v;
  const parseWs = (raw: string | undefined): WeightSet | null => {
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return {
        BOX:    pct2dec(parsed.BOX    ?? parsed.box    ?? 0),
        PBURST: pct2dec(parsed.PBURST ?? parsed.pburst ?? 0),
        CO:     pct2dec(parsed.CO     ?? parsed.co     ?? 0),
        DGC:    pct2dec(parsed.DGC    ?? parsed.dgc    ?? 0.10),
      };
    } catch { return null; }
  };

  const defaultB: WeightSet = { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 };
  const defaultC: WeightSet = { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 };
  const defaultA: WeightSet = { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 };

  const global = {
    balanced:     parseWs(rawByKey['engine_weights_balanced'])     ?? defaultB,
    conservative: parseWs(rawByKey['engine_weights_conservative']) ?? defaultC,
    aggressive:   parseWs(rawByKey['engine_weights_aggressive'])   ?? defaultA,
  };

  const byScope: ProductionWeights['byScope'] = {};
  for (const s of SCOPES) {
    const ws: { balanced?: WeightSet; conservative?: WeightSet; aggressive?: WeightSet } = {};
    const b = parseWs(rawByKey[`engine_weights_balanced_${s}`]);
    const c = parseWs(rawByKey[`engine_weights_conservative_${s}`]);
    const a = parseWs(rawByKey[`engine_weights_aggressive_${s}`]);
    if (b) ws.balanced = b;
    if (c) ws.conservative = c;
    if (a) ws.aggressive = a;
    if (Object.keys(ws).length > 0) byScope[s] = ws;
  }

  return { global, byScope, rawByKey };
}

interface GateResult { name: string; passed: boolean; reason: string; details: any }

async function gateSampleSize(): Promise<GateResult> {
  // G1-GATE-01 (2026-06-06): prior query lacked a matched_state filter and
  // mixed primary rows (with result_at as the labeling signal) with secondary
  // hit rows (where hit_box.eq.true is structurally always true). Returned
  // ~99% hits / 0% misses — a degenerate dataset that would make downstream
  // AUC fitting return 0.5 immediately. Pairs with HIT-DET-01 (now stamps
  // result_at on missed K6 primaries) and PROP-01 (same fix in the screen
  // proxy). Filter result_at IS NOT NULL, then dedupe (slate_hash, rank,
  // combo) so a hit pick that landed in 3 jurisdictions counts once.
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceStr = since.toISOString().split('T')[0];
  const path = `/adaptive_tracking?slate_date=gte.${sinceStr}&mode=eq.balanced&rank=gte.1&rank=lte.6&result_at=not.is.null&select=slate_hash,rank,combo&limit=10000`;
  const rows = await dbGet<{ slate_hash: string; rank: number; combo: string }[]>(path);
  const uniquePicks = new Set((Array.isArray(rows) ? rows : []).map(r => `${r.slate_hash}|${r.rank}|${r.combo}`));
  const n = uniquePicks.size;
  return {
    name: 'G1_sample_size',
    passed: n >= SAMPLE_SIZE_MIN,
    reason: `n=${n} adaptive_tracking outcomes in last ${LOOKBACK_DAYS}d (threshold ${SAMPLE_SIZE_MIN})`,
    details: { n, threshold: SAMPLE_SIZE_MIN, lookback_days: LOOKBACK_DAYS },
  };
}

function indicatorAUC(rows: { signal_box: number; signal_pburst: number; signal_co: number; signal_dgc: number; hit: boolean }[], w: WeightSet): number {
  const samples = rows.map(r => ({
    score: w.BOX * r.signal_box + w.PBURST * r.signal_pburst + w.CO * r.signal_co + w.DGC * r.signal_dgc,
    positive: r.hit,
  }));
  samples.sort((a, b) => a.score - b.score);
  let nPos = 0, nNeg = 0, posRankSum = 0;
  let i = 0;
  while (i < samples.length) {
    let j = i;
    while (j < samples.length && samples[j].score === samples[i].score) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      if (samples[k].positive) { nPos++; posRankSum += avgRank; } else nNeg++;
    }
    i = j;
  }
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (posRankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

async function gateAucImprovement(prod: ProductionWeights, proposedBalanced: WeightSet): Promise<GateResult> {
  const since = new Date(); since.setDate(since.getDate() - LOOKBACK_DAYS);
  const start = since.toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];
  const di = await loadIntelligence({ startDate: start, endDate: end });
  // NULL signals → 0 (matches engine's zero-default for missing signal data).
  // Filtering rows that require ALL signals non-null would drop nearly every
  // row since signal_dgc is often NULL in daily_intelligence. Need at least
  // ONE non-null signal per row to score meaningfully.
  const useable = di.filter(r =>
    typeof r.signal_box === 'number' || typeof r.signal_pburst === 'number' ||
    typeof r.signal_co === 'number'  || typeof r.signal_dgc === 'number'
  ).map(r => ({
    signal_box:    typeof r.signal_box    === 'number' ? r.signal_box    : 0,
    signal_pburst: typeof r.signal_pburst === 'number' ? r.signal_pburst : 0,
    signal_co:     typeof r.signal_co     === 'number' ? r.signal_co     : 0,
    signal_dgc:    typeof r.signal_dgc    === 'number' ? r.signal_dgc    : 0,
    hit: !!(r.hit_box || r.hit_straight),
  }));

  const currentAuc = indicatorAUC(useable, prod.global.balanced);
  const proposedAuc = indicatorAUC(useable, proposedBalanced);
  const delta = proposedAuc - currentAuc;
  return {
    name: 'G2_auc_improvement',
    passed: delta >= AUC_DELTA_MIN,
    reason: `current AUC ${currentAuc.toFixed(4)}, proposed AUC ${proposedAuc.toFixed(4)}, delta ${delta >= 0 ? '+' : ''}${delta.toFixed(4)} (threshold +${AUC_DELTA_MIN.toFixed(4)})`,
    details: { currentAuc, proposedAuc, delta, threshold: AUC_DELTA_MIN, n: useable.length },
  };
}

async function gateHistoricalBacktest(currentCfg: EngineConfig, proposedCfg: EngineConfig): Promise<GateResult> {
  const dates = dateRange(LOOKBACK_DAYS);
  type Tally = { slates: number; hits: number };
  const init = (): Record<Scope, Tally> => ({ midday: { slates: 0, hits: 0 }, evening: { slates: 0, hits: 0 }, allday: { slates: 0, hits: 0 } });
  const currentTally = init();
  const proposedTally = init();

  for (const date of dates) {
    const results = await fetchDrawResults(date);
    if (results.length === 0) continue;
    for (const scope of SCOPES) {
      try {
        const cPicks = await computeSlateAsOf(date, scope, currentCfg, 'balanced');
        const cHit = scorePicksVsResults(cPicks.map(p => ({ combo: p.combo, comboSet: p.comboSet })), results, scope);
        currentTally[scope].slates++;
        if (cHit.totalHits > 0) currentTally[scope].hits++;

        const pPicks = await computeSlateAsOf(date, scope, proposedCfg, 'balanced');
        const pHit = scorePicksVsResults(pPicks.map(p => ({ combo: p.combo, comboSet: p.comboSet })), results, scope);
        proposedTally[scope].slates++;
        if (pHit.totalHits > 0) proposedTally[scope].hits++;
      } catch (e) {
        console.warn(`[gen-proposal] G3 ${date} ${scope}: ${String(e).slice(0, 120)}`);
      }
    }
  }

  const scopeResults = SCOPES.map(s => {
    const cr = currentTally[s].slates > 0 ? currentTally[s].hits / currentTally[s].slates : 0;
    const pr = proposedTally[s].slates > 0 ? proposedTally[s].hits / proposedTally[s].slates : 0;
    return { scope: s, currentRate: cr, proposedRate: pr, delta: pr - cr, n_current: currentTally[s].slates, n_proposed: proposedTally[s].slates };
  });
  const anyRegression = scopeResults.some(r => r.delta < 0);

  return {
    name: 'G3_historical_backtest',
    passed: !anyRegression,
    reason: anyRegression
      ? `regression on scope(s): ${scopeResults.filter(r => r.delta < 0).map(r => `${r.scope} ${(r.delta * 100).toFixed(1)}pp`).join(', ')}`
      : `all scopes ≥ current — ${scopeResults.map(r => `${r.scope} ${(r.delta * 100 >= 0 ? '+' : '') + (r.delta * 100).toFixed(1)}pp`).join(', ')}`,
    details: { scopeResults },
  };
}

async function gateDivergence(currentCfg: EngineConfig, proposedCfg: EngineConfig): Promise<GateResult> {
  const today = new Date().toISOString().split('T')[0];
  const perScope: { scope: Scope; picksChanged: number; picksUnchanged: number; divergencePct: number }[] = [];
  for (const scope of SCOPES) {
    try {
      const c = await computeSlateAsOf(today, scope, currentCfg, 'balanced');
      const p = await computeSlateAsOf(today, scope, proposedCfg, 'balanced');
      const cSet = new Set(c.map(x => x.combo));
      const pSet = new Set(p.map(x => x.combo));
      let unchanged = 0;
      for (const combo of Array.from(cSet)) if (pSet.has(combo)) unchanged++;
      const changed = Math.max(c.length, p.length) - unchanged;
      const total = Math.max(c.length, p.length, 1);
      perScope.push({ scope, picksChanged: changed, picksUnchanged: unchanged, divergencePct: changed / total });
    } catch (e) {
      console.warn(`[gen-proposal] G4 ${scope}: ${String(e).slice(0, 120)}`);
    }
  }
  const maxDivergence = perScope.reduce((m, x) => Math.max(m, x.divergencePct), 0);
  return {
    name: 'G4_divergence',
    passed: true,
    reason: `max divergence ${(maxDivergence * 100).toFixed(0)}% across scopes (flag threshold ${(DIVERGENCE_FLAG_THRESHOLD * 100).toFixed(0)}%)${maxDivergence > DIVERGENCE_FLAG_THRESHOLD ? ' — high-divergence proposal' : ''}`,
    details: { perScope, maxDivergence, flag_threshold: DIVERGENCE_FLAG_THRESHOLD, is_high_divergence: maxDivergence > DIVERGENCE_FLAG_THRESHOLD },
  };
}

function gatePerScopeRespect(
  prod: ProductionWeights,
  proposed: WeightSet,
): GateResult & { apply_ops: { key: string; value: any }[]; revert_ops: { key: string; value: any }[] } {
  const apply_ops: { key: string; value: any }[] = [];
  const revert_ops: { key: string; value: any }[] = [];

  const scopesWithBalancedOverride = SCOPES.filter(s => prod.byScope[s]?.balanced);
  const allScopesHaveOverride = scopesWithBalancedOverride.length === SCOPES.length;
  const noScopeHasOverride = scopesWithBalancedOverride.length === 0;

  const toPercentObj = (w: WeightSet) => ({
    BOX: +(w.BOX * 100).toFixed(2),
    PBURST: +(w.PBURST * 100).toFixed(2),
    CO: +(w.CO * 100).toFixed(2),
    DGC: +(w.DGC * 100).toFixed(2),
  });
  const toPercentObjFromExisting = (raw: string | undefined): any | null => {
    if (!raw) return null;
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  };

  const keyMappings: { proposedKey: string; isPerScope: boolean; scope?: Scope }[] = [];

  if (noScopeHasOverride) {
    const key = 'engine_weights_balanced';
    apply_ops.push({ key, value: toPercentObj(proposed) });
    const prior = toPercentObjFromExisting(prod.rawByKey[key]) ?? toPercentObj(prod.global.balanced);
    revert_ops.push({ key, value: prior });
    keyMappings.push({ proposedKey: key, isPerScope: false });
  } else {
    for (const s of scopesWithBalancedOverride) {
      const key = `engine_weights_balanced_${s}`;
      apply_ops.push({ key, value: toPercentObj(proposed) });
      const prior = toPercentObjFromExisting(prod.rawByKey[key]) ?? toPercentObj(prod.byScope[s]!.balanced!);
      revert_ops.push({ key, value: prior });
      keyMappings.push({ proposedKey: key, isPerScope: true, scope: s });
    }
  }

  return {
    name: 'G5_per_scope_respect',
    passed: true,
    reason: noScopeHasOverride
      ? `no per-scope overrides exist; will update global engine_weights_balanced`
      : `per-scope overrides exist for ${scopesWithBalancedOverride.join(', ')}; will update per-scope keys ONLY (global left untouched)`,
    details: { keyMappings, scopes_with_override: scopesWithBalancedOverride, all_overridden: allScopesHaveOverride, none_overridden: noScopeHasOverride },
    apply_ops,
    revert_ops,
  };
}

function buildEngineConfig(prod: ProductionWeights, proposedBalanced?: WeightSet): EngineConfig {
  const baseline = CONFIGS.intel_weights_midday_only_floor70;
  const cfg: EngineConfig = JSON.parse(JSON.stringify(baseline));
  cfg.presets.balanced     = prod.global.balanced;
  cfg.presets.conservative = prod.global.conservative;
  cfg.presets.aggressive   = prod.global.aggressive;
  cfg.presetByScope = {};
  for (const s of SCOPES) {
    const sc = prod.byScope[s];
    if (!sc) continue;
    cfg.presetByScope[s] = {
      balanced:     sc.balanced     ?? prod.global.balanced,
      conservative: sc.conservative ?? prod.global.conservative,
      aggressive:   sc.aggressive   ?? prod.global.aggressive,
    };
  }
  if (proposedBalanced) {
    cfg.presets.balanced = proposedBalanced;
    if (cfg.presetByScope) {
      for (const s of (Object.keys(cfg.presetByScope) as Scope[])) {
        if (cfg.presetByScope[s]) cfg.presetByScope[s]!.balanced = proposedBalanced;
      }
    }
  }
  return cfg;
}

async function writeAuditLog(action: string, target: string, payload_meta: any): Promise<string> {
  const url = `${SB_URL}/rest/v1/audit_logs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SVC_KEY,
      'Authorization': 'Bearer ' + SVC_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ actor_id: 'autotune', action, target, payload_meta }),
  });
  if (!res.ok) throw new Error(`writeAuditLog ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.id ?? '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dry = args.dry === 'true';
  const manual = args.manual === 'true';

  if (!SB_URL || !SVC_KEY) {
    console.error('[gen-proposal] Missing SUPABASE_URL or service key in env');
    process.exit(1);
  }

  console.log(`[gen-proposal] Mode: ${dry ? 'DRY-RUN (no audit_logs write)' : manual ? 'MANUAL (will write)' : 'SCHEDULED (will write)'}`);
  console.log(`[gen-proposal] Lookback: ${LOOKBACK_DAYS} days`);

  const prod = await loadProductionWeights();
  console.log('[gen-proposal] Production weights loaded.');
  console.log('  global.balanced:', JSON.stringify(prod.global.balanced));
  for (const s of SCOPES) {
    if (prod.byScope[s]) console.log(`  byScope.${s}:`, JSON.stringify(prod.byScope[s]));
  }

  const since = new Date(); since.setDate(since.getDate() - LOOKBACK_DAYS);
  const start = since.toISOString().split('T')[0];
  const end = new Date().toISOString().split('T')[0];
  const di = await loadIntelligence({ startDate: start, endDate: end });
  const fit = fitWeights(di);
  const proposedBalanced: WeightSet = {
    BOX: fit.weights.BOX, PBURST: fit.weights.PBURST, CO: fit.weights.CO, DGC: fit.weights.DGC,
  };
  console.log('[gen-proposal] Proposed balanced weights:', JSON.stringify(proposedBalanced));
  console.log(`[gen-proposal] Per-signal AUC:`, JSON.stringify(fit.auc));

  const allResults: GateResult[] = [];

  console.log('[gen-proposal] G1 sample size…');
  const g1 = await gateSampleSize();
  allResults.push(g1);
  console.log(`  → ${g1.passed ? '✓' : '✗'} ${g1.reason}`);

  console.log('[gen-proposal] G2 AUC improvement…');
  const g2 = await gateAucImprovement(prod, proposedBalanced);
  allResults.push(g2);
  console.log(`  → ${g2.passed ? '✓' : '✗'} ${g2.reason}`);

  let g3: GateResult | null = null;
  let g4: GateResult | null = null;
  let g5: ReturnType<typeof gatePerScopeRespect> | null = null;

  if (g1.passed && g2.passed) {
    const currentCfg = buildEngineConfig(prod);
    const proposedCfg = buildEngineConfig(prod, proposedBalanced);

    console.log('[gen-proposal] G3 historical backtest (this takes 30-60s)…');
    g3 = await gateHistoricalBacktest(currentCfg, proposedCfg);
    allResults.push(g3);
    console.log(`  → ${g3.passed ? '✓' : '✗'} ${g3.reason}`);

    console.log('[gen-proposal] G4 divergence (informational)…');
    g4 = await gateDivergence(currentCfg, proposedCfg);
    allResults.push(g4);
    console.log(`  → ${g4.reason}`);
  } else {
    console.log('[gen-proposal] Skipping G3/G4 (G1 or G2 blocked).');
  }

  console.log('[gen-proposal] G5 per-scope respect (structural)…');
  g5 = gatePerScopeRespect(prod, proposedBalanced);
  allResults.push(g5);
  console.log(`  → ${g5.reason}`);

  const blockedBy = allResults.find(r => !r.passed);
  const expires_at = new Date(Date.now() + PROPOSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  if (blockedBy) {
    console.log(`\n[gen-proposal] BLOCKED by ${blockedBy.name}: ${blockedBy.reason}`);
    if (dry) {
      console.log('[gen-proposal] DRY-RUN — would have written weight_proposal_blocked audit log');
      return;
    }
    const id = await writeAuditLog('weight_proposal_blocked', 'autotune', {
      reason: blockedBy.reason,
      gate_that_blocked: blockedBy.name,
      all_gate_results: allResults,
      proposed_weights: { balanced: proposedBalanced },
      current_weights: { global: prod.global, byScope: prod.byScope },
      auc: fit.auc,
      lookback_days: LOOKBACK_DAYS,
    });
    console.log(`[gen-proposal] Wrote weight_proposal_blocked audit log id=${id}`);
    return;
  }

  console.log('\n[gen-proposal] All gates PASSED — generating proposal');
  if (dry) {
    console.log('[gen-proposal] DRY-RUN — would have written weight_proposal_generated audit log');
    console.log('  apply_ops:', JSON.stringify(g5!.apply_ops, null, 2));
    console.log('  revert_ops:', JSON.stringify(g5!.revert_ops, null, 2));
    console.log('  expires_at:', expires_at);
    return;
  }

  const id = await writeAuditLog('weight_proposal_generated', 'autotune', {
    proposed_weights: { balanced: proposedBalanced },
    current_weights: { global: prod.global, byScope: prod.byScope },
    all_gate_results: allResults,
    apply_ops: g5!.apply_ops,
    revert_ops: g5!.revert_ops,
    expires_at,
    auc: fit.auc,
    lookback_days: LOOKBACK_DAYS,
    generator_version: 'v1',
  });
  console.log(`[gen-proposal] Wrote weight_proposal_generated audit log id=${id}`);
  console.log(`[gen-proposal] Proposal expires at ${expires_at}`);
  console.log(`[gen-proposal] Operator review via admin UI ProposalReviewView`);
}

main().catch(err => {
  console.error('[gen-proposal] Fatal:', err);
  process.exit(1);
});
