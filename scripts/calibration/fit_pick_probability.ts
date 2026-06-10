/**
 * fit_pick_probability.ts — CALIB-01 (2026-06-10)
 *
 * Fits a logistic model P(pick hits ≥1 box match) on adjudicated
 * daily_intelligence top-30 rows (post-artifact era, 2026-05-13+).
 *
 * Purpose: decision-layer calibration for the operator's morning brief —
 * turns engine ranks into calibrated probabilities so stake allocation can be
 * EV-based. Does NOT touch pick selection or ordering.
 *
 * Features: scope dummies (evening, midday; allday = reference) + the four
 * normalized signals as stored at slate-gen time. draws_since is deliberately
 * EXCLUDED (ds_raw scale changed at DATA-01 2026-06-03 — era-inconsistent).
 * Multiplicity excluded: top-30 pool is 100% singles in the training window;
 * doubles fall back to scope base rate at apply time.
 *
 * Validation: walk-forward (train ≤ 2026-05-31, test 2026-06-01+). Ship gate:
 * test Brier ≤ trivial baseline (per-scope train-era hit rate). Prints the
 * app_config JSON for `pick_prob_calibration`; the operator/assistant writes
 * it via SQL after review — this script never writes to the DB.
 *
 * Run: npm run calibrate:picks
 */

import { dbGet } from '../backtest/data.js';

interface Row {
  slate_date: string;
  scope: 'midday' | 'evening' | 'allday';
  signal_box: number; signal_pburst: number; signal_co: number; signal_dgc: number;
  hit: boolean;
}

const FEATURES = ['evening', 'midday', 'box', 'pburst', 'co', 'dgc'] as const;
const TRAIN_END = '2026-05-31';
const FROM_DATE = '2026-05-13';

async function fetchRows(): Promise<Row[]> {
  const all: Row[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const page = await dbGet<any[]>(
      `/daily_intelligence?select=slate_date,scope,signal_box,signal_pburst,signal_co,signal_dgc,hit_box,hit_straight` +
      `&mode=eq.balanced&rank=lte.30&multiplicity=not.is.null` +
      `&slate_date=gte.${FROM_DATE}&order=slate_date.asc,scope.asc,rank.asc` +
      `&limit=${pageSize}&offset=${offset}`,
    );
    const rows = Array.isArray(page) ? page : [];
    for (const r of rows) {
      if (typeof r?.slate_date !== 'string') continue;
      all.push({
        slate_date: r.slate_date,
        scope: r.scope,
        signal_box: Number(r.signal_box ?? 0),
        signal_pburst: Number(r.signal_pburst ?? 0),
        signal_co: Number(r.signal_co ?? 0),
        signal_dgc: Number(r.signal_dgc ?? 0),
        hit: !!r.hit_box || !!r.hit_straight,
      });
    }
    if (rows.length < pageSize) break;
  }
  return all;
}

function featurize(r: Row): number[] {
  return [
    r.scope === 'evening' ? 1 : 0,
    r.scope === 'midday' ? 1 : 0,
    r.signal_box, r.signal_pburst, r.signal_co, r.signal_dgc,
  ];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Plain-JS logistic regression: standardized features, gradient descent, L2. */
function fitLogistic(X: number[][], y: number[], lambda = 0.01) {
  const n = X.length, d = X[0].length;
  // Standardize continuous features only (dummies at idx 0,1 stay raw).
  const mean = new Array(d).fill(0), std = new Array(d).fill(1);
  for (let j = 2; j < d; j++) {
    let m = 0; for (let i = 0; i < n; i++) m += X[i][j]; m /= n;
    let v = 0; for (let i = 0; i < n; i++) v += (X[i][j] - m) ** 2; v = Math.sqrt(v / n) || 1;
    mean[j] = m; std[j] = v;
  }
  const Xs = X.map(row => row.map((v, j) => (v - mean[j]) / std[j]));
  let b = 0;
  const w = new Array(d).fill(0);
  const lr = 0.5;
  for (let epoch = 0; epoch < 3000; epoch++) {
    let gb = 0;
    const gw = new Array(d).fill(0);
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * Xs[i][j];
      const err = sigmoid(z) - y[i];
      gb += err;
      for (let j = 0; j < d; j++) gw[j] += err * Xs[i][j];
    }
    b -= lr * (gb / n);
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + lambda * w[j]);
  }
  return { b, w, mean, std };
}

function predict(model: ReturnType<typeof fitLogistic>, x: number[]): number {
  let z = model.b;
  for (let j = 0; j < x.length; j++) z += model.w[j] * ((x[j] - model.mean[j]) / model.std[j]);
  return sigmoid(z);
}

const brier = (p: number[], y: number[]) =>
  p.reduce((s, pi, i) => s + (pi - y[i]) ** 2, 0) / p.length;

async function main() {
  const rows = await fetchRows();
  const train = rows.filter(r => r.slate_date <= TRAIN_END);
  const test  = rows.filter(r => r.slate_date >  TRAIN_END);
  console.log(`[calib] rows=${rows.length} train=${train.length} (≤${TRAIN_END}) test=${test.length}`);

  const Xtr = train.map(featurize), ytr = train.map(r => r.hit ? 1 : 0);
  const Xte = test.map(featurize),  yte = test.map(r => r.hit ? 1 : 0);

  const model = fitLogistic(Xtr, ytr);

  // Trivial baseline: per-scope train-era hit rate.
  const scopeRate: Record<string, number> = {};
  for (const s of ['midday', 'evening', 'allday']) {
    const sub = train.filter(r => r.scope === s);
    scopeRate[s] = sub.length ? sub.filter(r => r.hit).length / sub.length : 0;
  }

  const pTe = Xte.map(x => predict(model, x));
  const pBase = test.map(r => scopeRate[r.scope]);
  const bModel = brier(pTe, yte), bBase = brier(pBase, yte);

  console.log(`\n[calib] TEST Brier — model: ${bModel.toFixed(5)}  trivial(scope-rate): ${bBase.toFixed(5)}  ` +
    (bModel <= bBase ? '✓ model ≤ trivial (SHIPPABLE)' : '✗ model worse than trivial (DO NOT SHIP)'));

  // Reliability table (test): quintiles of predicted prob.
  const order = pTe.map((p, i) => ({ p, y: yte[i] })).sort((a, b) => a.p - b.p);
  console.log('\n[calib] Test reliability (quintiles of predicted P):');
  console.log('  bucket      n    pred%   actual%');
  for (let q = 0; q < 5; q++) {
    const lo = Math.floor(order.length * q / 5), hi = Math.floor(order.length * (q + 1) / 5);
    const seg = order.slice(lo, hi);
    const predAvg = seg.reduce((s, o) => s + o.p, 0) / seg.length;
    const actAvg = seg.reduce((s, o) => s + o.y, 0) / seg.length;
    console.log(`  Q${q + 1}      ${String(seg.length).padStart(5)}   ${(100 * predAvg).toFixed(1).padStart(5)}%  ${(100 * actAvg).toFixed(1).padStart(6)}%`);
  }

  // Per-scope test calibration sanity.
  console.log('\n[calib] Per-scope test: avg predicted vs actual');
  for (const s of ['midday', 'evening', 'allday']) {
    const idx = test.map((r, i) => r.scope === s ? i : -1).filter(i => i >= 0);
    if (idx.length === 0) continue;
    const pa = idx.reduce((sum, i) => sum + pTe[i], 0) / idx.length;
    const aa = idx.reduce((sum, i) => sum + yte[i], 0) / idx.length;
    console.log(`  ${s.padEnd(8)} n=${idx.length}  pred=${(100 * pa).toFixed(1)}%  actual=${(100 * aa).toFixed(1)}%`);
  }

  // Refit on ALL rows for the shipped coefficients (standard practice once
  // the walk-forward gate is judged on the train/test split above).
  const full = fitLogistic(rows.map(featurize), rows.map(r => r.hit ? 1 : 0));
  const payload = {
    version: 'CALIB-01',
    fitted_at: new Date().toISOString(),
    training_window: { from: FROM_DATE, to: rows[rows.length - 1]?.slate_date ?? null, n: rows.length },
    validation: {
      train_end: TRAIN_END, n_test: test.length,
      test_brier_model: Number(bModel.toFixed(5)),
      test_brier_trivial: Number(bBase.toFixed(5)),
    },
    // Apply: z = b + Σ w[f] × ((x[f] − mean[f]) / std[f]); P = 1/(1+e^−z)
    // Features order: [evening, midday, box, pburst, co, dgc].
    // Doubles / off-model picks: fall back to scope base rate (base_rates).
    features: FEATURES,
    b: Number(full.b.toFixed(6)),
    w: full.w.map(v => Number(v.toFixed(6))),
    mean: full.mean.map(v => Number(v.toFixed(6))),
    std: full.std.map(v => Number(v.toFixed(6))),
    base_rates: Object.fromEntries(Object.entries(scopeRate).map(([k, v]) => [k, Number(v.toFixed(4))])),
  };
  console.log('\n[calib] app_config pick_prob_calibration payload:\n' + JSON.stringify(payload));
}

main().catch(e => { console.error('[calib] FAILED:', e); process.exit(1); });
