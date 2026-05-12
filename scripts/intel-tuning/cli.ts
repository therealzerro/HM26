#!/usr/bin/env tsx
/**
 * intel-tuning/cli.ts — Read-only ENH-C tool.
 *
 * Loads daily_intelligence rows from a date window, fits AUC-based weights
 * per signal, and PROPOSES new weight presets. Never writes to app_config.
 *
 * Usage:
 *   npm run intel:propose -- --start 2026-04-13 --end 2026-05-08
 *   npm run intel:propose -- --start 2026-04-13 --end 2026-05-08 --scope midday
 */

import { loadIntelligence, fitWeights } from './fit.js';

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

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const start = args.start ?? '2026-04-13';
  const end   = args.end   ?? '2026-05-08';
  const scope = args.scope;

  console.log(`[intel-tuning] Loading daily_intelligence ${start} → ${end}…`);
  let rows = await loadIntelligence({ startDate: start, endDate: end });
  if (scope) {
    rows = rows.filter(r => r.scope === scope);
    console.log(`[intel-tuning] Filtered to scope=${scope}: ${rows.length} rows`);
  }
  if (rows.length === 0) {
    console.error('[intel-tuning] No evaluated picks in window. Check date range + hit-detection backfill.');
    process.exit(1);
  }

  const fit = fitWeights(rows);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  INTELLIGENCE-DRIVEN WEIGHT PROPOSAL');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Window:          ${fit.dateRange.start} → ${fit.dateRange.end}`);
  console.log(`  Evaluated picks: ${fit.n.toLocaleString()}`);
  console.log(`  Hits:            ${fit.hitCount.toLocaleString()} (${pct(fit.hitCount / fit.n)})`);
  console.log(`  Misses:          ${fit.missCount.toLocaleString()}`);

  console.log('\n  ── Per-scope hit rate ──');
  for (const [sc, st] of Object.entries(fit.byScope).sort()) {
    console.log(`    ${sc.padEnd(8)}: ${pct(st.rate)} (${st.hits}/${st.n})`);
  }

  console.log('\n  ── Per-signal AUC (higher = more predictive; 0.5 = random) ──');
  for (const [k, v] of Object.entries(fit.auc)) {
    const bar = '▇'.repeat(Math.max(0, Math.round((v - 0.5) * 50)));
    console.log(`    ${k.padEnd(15)}: ${v.toFixed(4)}  ${bar}`);
  }

  console.log('\n  ── Proposed weights (AUC-lift normalized) ──');
  const cur = { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 };
  for (const k of ['BOX', 'PBURST', 'CO', 'DGC'] as const) {
    const proposed = fit.weights[k];
    const current  = cur[k];
    const delta    = proposed - current;
    const arrow    = delta > 0.01 ? '↑' : delta < -0.01 ? '↓' : '·';
    console.log(`    ${k.padEnd(8)}: current ${current.toFixed(3)}  →  proposed ${proposed.toFixed(3)}  ${arrow} ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp`);
  }

  console.log('\n  ── Ready-to-paste backtest config preset ──');
  const w = fit.weights;
  // Aggressive/conservative variants: same shape as default's offsets from balanced.
  const factor = (target: typeof w, mult: { BOX: number; PBURST: number; CO: number; DGC: number }) => {
    const out = { BOX: target.BOX * mult.BOX, PBURST: target.PBURST * mult.PBURST, CO: target.CO * mult.CO, DGC: target.DGC * mult.DGC };
    const sum = out.BOX + out.PBURST + out.CO + out.DGC;
    return { BOX: out.BOX / sum, PBURST: out.PBURST / sum, CO: out.CO / sum, DGC: out.DGC / sum };
  };
  // Conservative: emphasize BOX more (×1.36 like default's 0.675/0.495 ratio).
  const cons = factor(w, { BOX: 1.36, PBURST: 0.5, CO: 0.67, DGC: 1.0 });
  // Aggressive: de-emphasize BOX (×0.82 like default's 0.405/0.495 ratio).
  const aggr = factor(w, { BOX: 0.82, PBURST: 1.17, CO: 1.33, DGC: 1.0 });
  console.log(JSON.stringify({
    intel_tuned: {
      presets: {
        balanced:     { BOX: +w.BOX.toFixed(3),    PBURST: +w.PBURST.toFixed(3),    CO: +w.CO.toFixed(3),    DGC: +w.DGC.toFixed(3) },
        conservative: { BOX: +cons.BOX.toFixed(3), PBURST: +cons.PBURST.toFixed(3), CO: +cons.CO.toFixed(3), DGC: +cons.DGC.toFixed(3) },
        aggressive:   { BOX: +aggr.BOX.toFixed(3), PBURST: +aggr.PBURST.toFixed(3), CO: +aggr.CO.toFixed(3), DGC: +aggr.DGC.toFixed(3) },
      },
      rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
      pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
      synergyOn: false, synergyWeight: 0.15,
    },
  }, null, 2));
  console.log('');
}

main().catch(err => { console.error('[intel-tuning] Fatal:', err); process.exit(1); });
