/**
 * engine-parity — ENG-DEEPSCOPE-01 P2 (2026-08-13).
 *
 * Two jobs, both cheap, both about catching engine drift the DAY it happens
 * rather than at the next cold streak:
 *
 *   1. COPY GUARD — the Deno edge functions import engineCore/dateUtils from
 *      supabase/functions/_shared/, which are physical COPIES of lib/. Nothing
 *      else enforces that they stay identical; this does (sha256, hard FAIL).
 *      If a copy must legitimately diverge some day, that divergence should be
 *      loud, deliberate, and recorded — not discovered during an incident.
 *
 *   2. GOLDEN VECTORS — fixed inputs through every pure engineCore function
 *      with frozen expected outputs. A behavior-changing edit to shared signal
 *      math fails here immediately, including the "harmless refactor" class.
 *      Frozen values were captured from the 2026-08-13 code state — the same
 *      state the 8/13 full-stack scope verified line-by-line.
 *
 * Deliberately OUT (recorded in docs/engine_scope_2026-08-13.md §P2): a full
 * client-vs-edge pick-order fixture diff — engines/zk6.ts does not expose its
 * scoring stage as a pure function, and extracting one is a refactor of live
 * selection code that needs its own verification pass. The D1 day-anchor fix
 * plus these vectors cover the drift classes we have actually been bitten by.
 *
 * Usage: npm run engine:parity   (exit 0 = all pass; exit 1 = any failure)
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  toComboSet, sortedPair, multiplicityOf, topPairOf, buildUniverse,
  normalizeBoxKey, normalizePairKey,
  computeDGC, percentileRankOf, maxNorm,
  computeBoxSignalDetailed, buildPressureScaleCtx,
  computePairSignal, blendBoxDsRaw, blendPairAcrossHorizons, bestOrderFor,
  computeWeightedScore, computeAdaptiveWeights, computeSlateHash,
  computeConfidenceScore, buildWarmingMap, buildStateStrengthMap,
  intelligenceRowExtras,
} from '../lib/engineCore';

let failures = 0;
let checks = 0;
const EPS = 1e-9;

function check(name: string, actual: unknown, expected: unknown): void {
  checks++;
  const ok = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) < EPS
    : JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`⛔ ${name}\n   expected ${JSON.stringify(expected)}\n   actual   ${JSON.stringify(actual)}`);
  }
}

// ─── 1. Copy guard ─────────────────────────────────────────────────────────────
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const COPY_PAIRS: [string, string][] = [
  ['lib/engineCore.ts', 'supabase/functions/_shared/engineCore.ts'],
  ['lib/dateUtils.ts',  'supabase/functions/_shared/dateUtils.ts'],
];
for (const [src, copy] of COPY_PAIRS) {
  checks++;
  const a = sha(src), b = sha(copy);
  if (a !== b) {
    failures++;
    console.error(`⛔ COPY DRIFT: ${copy} ≠ ${src}\n   ${a.slice(0, 16)}… vs ${b.slice(0, 16)}…\n   The edge functions run the _shared copy. Re-sync it (cp) or record the divergence deliberately.`);
  } else {
    console.log(`✅ copy guard: ${copy} identical to ${src}`);
  }
}

// ─── 2. Golden vectors ─────────────────────────────────────────────────────────

// Combo utilities — hand-derivable.
check('toComboSet', toComboSet('742'), '{2,4,7}');
check('sortedPair', sortedPair('7', '2'), '27');
check('multiplicityOf singles', multiplicityOf('123'), 'singles');
check('multiplicityOf doubles', multiplicityOf('122'), 'doubles');
check('multiplicityOf triples', multiplicityOf('999'), 'triples');
check('topPairOf', topPairOf('742'), '24');
check('buildUniverse size', buildUniverse().length, 1000);
check('buildUniverse first/last', [buildUniverse()[0], buildUniverse()[999]], ['000', '999']);
check('normalizeBoxKey raw', normalizeBoxKey('742'), '{2,4,7}');
check('normalizeBoxKey set', normalizeBoxKey('{2,4,7}'), '{2,4,7}');
check('normalizePairKey', normalizePairKey('{7,2}'), '27');

// DGC — empty, singleton, perfectly regular, exactly-chaotic (sd = REF).
check('DGC empty', computeDGC([]), 0);
check('DGC singleton', computeDGC([5]), 0.3);
check('DGC regular', computeDGC([0, 10, 20]), 1);
check('DGC sd=ref', computeDGC([0, 10, 40]), 0); // gaps 10/30 → sd 10 → 1 − 10/10

// Normalization.
check('percentileRankOf mid', percentileRankOf(5, [1, 2, 3, 4, 5]), 80);
check('percentileRankOf below', percentileRankOf(0, [1, 2, 3]), 0);
check('percentileRankOf above', percentileRankOf(9, [1, 2, 3]), 100);
check('percentileRankOf empty', percentileRankOf(1, []), 50);
check('maxNorm', maxNorm([0, 2, 4]), [0, 0.5, 1]);
check('maxNorm all-zero', maxNorm([0, 0]), [0, 0]);

// BOX signal — legacy curve branches + both rescale modes.
check('box zero-td', computeBoxSignalDetailed(0, 50, 10, 250), { freq: 0, pressure: 0, box: 0 });
check('box early branch', computeBoxSignalDetailed(5, 50, 10, 250).box, 0.6 * 0.5 + 0.4 * 0.25);
check('box mid branch (frozen 8/13)', computeBoxSignalDetailed(5, 150, 10, 250).box, 0.43333333333333335);
check('box late decay', computeBoxSignalDetailed(5, 350, 10, 250).pressure, 0.5); // 1 − 100/200
check('box cliff guard (pt=100)', computeBoxSignalDetailed(5, 100, 10, 100).pressure, 1.0); // ENG-PRESSURE-CLIFF-01
const ramp = buildPressureScaleCtx('p95ramp', Array.from({ length: 100 }, (_, i) => i + 1));
check('p95ramp p95', ramp?.dsP95, 96);
check('p95ramp pressure', computeBoxSignalDetailed(5, 48, 10, 250, 0.6, 0.4, ramp).pressure, 0.5);
const pct = buildPressureScaleCtx('percentile', [10, 20, 30, 40]);
check('percentile pressure', computeBoxSignalDetailed(5, 30, 10, 250, 0.6, 0.4, pct).pressure, 0.5);
check('legacy ctx is undefined', buildPressureScaleCtx('legacy', [1, 2, 3]), undefined);

// Pair signal — ramp, peak, taper (ENG-PRESSURE-CLIFF-02 shape), floor.
check('pair mid', computePairSignal({ timesDrawn: 5, drawsSince: 91 }, 10), 0.7 * 0.5 + 0.3 * 0.5);
check('pair peak', computePairSignal({ timesDrawn: 10, drawsSince: 182 }, 10), 1.0);
check('pair taper 550', computePairSignal({ timesDrawn: 10, drawsSince: 550 }, 10), 0.7 + 0.3 * 0.5);
check('pair taper end', computePairSignal({ timesDrawn: 10, drawsSince: 600 }, 10), 0.7);
check('pair zero-td', computePairSignal({ timesDrawn: 0, drawsSince: 91 }, 10), 0);

// Horizon blends.
const boxByH = new Map([['H01Y', new Map([['{1,2,3}', 10]])], ['H02Y', new Map([['{1,2,3}', 20]])]]);
check('blendBoxDsRaw', blendBoxDsRaw('{1,2,3}', boxByH, { H01Y: 0.35, H02Y: 0.22 }), 7.9);
const pairTree = new Map([['13', new Map([[2, new Map([['H01Y', 100]])]])], ['12', new Map([[2, new Map([['H01Y', 5]])]])]]);
check('blendPairAcrossHorizons', blendPairAcrossHorizons('13', 2, pairTree as any, { H01Y: 1 }), 100);
check('bestOrderFor (frozen 8/13)', bestOrderFor('123', pairTree as any, { H01Y: 1 }), '132');

// Weighted score — plain, synergy fire, synergy no-fire.
const W = { BOX: 0.5, PBURST: 0.3, CO: 0.15, DGC: 0.05 };
check('score plain', computeWeightedScore(1, 1, 1, 1, W, 0, false, 0.15), 1.0);
check('score synergy fires', computeWeightedScore(1, 1, 0, 0, W, 0, true, 0.15), 0.8 * 1.15);
check('score synergy no-fire', computeWeightedScore(1, 0.5, 0, 0, W, 0, true, 0.15), 0.65);
check('score mult prior', computeWeightedScore(1, 1, 1, 1, W, -0.02, false, 0.15), 0.98);

// Adaptive weights — parity at flat AUC, frozen tilt, sum-to-1 invariant.
const flat = computeAdaptiveWeights(W, { BOX: 0.5, PBURST: 0.5, CO: 0.5, DGC: 0.5 }, 1).weights;
check('adaptive flat = base', flat, W);
const tilt = computeAdaptiveWeights(W, { BOX: 0.6, PBURST: 0.5, CO: 0.5, DGC: 0.5 }, 1).weights;
check('adaptive tilt (frozen 8/13)', tilt, {
  BOX: 0.5238095238095238, PBURST: 0.2857142857142857,
  CO: 0.14285714285714285, DGC: 0.047619047619047616,
});
check('adaptive sums to 1', tilt.BOX + tilt.PBURST + tilt.CO + tilt.DGC, 1.0);

// Slate hash — ENG-04 determinism, frozen value, and input sensitivity.
const HASH_COMBOS = ['123', '456', '789', '012', '345', '678'];
const HASH_HORIZONS = { H01Y: true, H02Y: false };
check('slate hash (frozen 8/13)', computeSlateHash('evening', 'balanced', HASH_COMBOS, HASH_HORIZONS), 'BC917FD');
check('slate hash deterministic',
  computeSlateHash('evening', 'balanced', HASH_COMBOS, HASH_HORIZONS),
  computeSlateHash('evening', 'balanced', HASH_COMBOS, HASH_HORIZONS));
checks++;
if (computeSlateHash('midday', 'balanced', HASH_COMBOS, HASH_HORIZONS) === 'BC917FD') {
  failures++; console.error('⛔ slate hash ignores scope');
}

// Confidence, warming, state strength, DI extras.
check('confidence full', computeConfidenceScore(10, 2200), 1.0);
check('confidence half', computeConfidenceScore(5, 500), 0.5 * 0.6 + 0.5 * 0.4);
check('warming map', [...buildWarmingMap([
  { comboset_sorted: '{1,2,3}', date_et: '2026-08-10' },
  { comboset_sorted: '{1,2,3}', date_et: '2026-08-11' },
  { comboset_sorted: '{4,5,6}', date_et: '2026-08-11' },
]).entries()], [['{1,2,3}', 2], ['{4,5,6}', 1]]);
const ssRows = [
  ...Array.from({ length: 12 }, (_, i) => ({ comboset_sorted: i < 3 ? '{1,2,3}' : `{f,i,l}`, jurisdiction: 'NY', date_et: '2026-08-13' })),
  ...Array.from({ length: 2 }, () => ({ comboset_sorted: '{1,2,3}', jurisdiction: 'RI', date_et: '2026-08-13' })),
];
check('state strength (min-draws gate)', buildStateStrengthMap(ssRows as any, '2026-08-13').get('{1,2,3}'), 0.25);
check('DI extras null-context', intelligenceRowExtras('123', '{1,2,3}', null, null, null),
  { draws_since: null, times_drawn: 0, best_order: '123' });

// ─── Result ────────────────────────────────────────────────────────────────────
console.log(failures === 0
  ? `\n✅ engine parity: ${checks} checks, all pass`
  : `\n⛔ engine parity: ${failures}/${checks} FAILED — shared engine math has drifted from the 8/13 verified state`);
if (failures > 0) process.exit(1);
