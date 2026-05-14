#!/usr/bin/env tsx
/**
 * cli.ts — Backtest harness entry point.
 *
 * Usage:
 *   npm run backtest:report -- --days 60
 *   npm run backtest:replay -- --days 30 --config default
 *   npm run backtest:replay -- --days 30 --config default,destroyed,legacy
 *   npm run backtest:replay -- --days 30 --config default,destroyed,legacy --mode balanced
 */

import { runReport } from './report.js';
import { computeSlateAsOf } from './replay.js';
import { fetchDrawResults, computeBaseline, computeRailMatchedBaseline } from './score.js';
import { scorePicksVsResults } from './score.js';
import { writeReportCSV, printReportSummary, writeReplayCSV, printReplaySummary } from './output.js';
import { CONFIGS } from './configs.js';
import type { HitResult, Scope } from './types.js';

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

// ── Mode A: report ────────────────────────────────────────────────────────────

async function modeReport(args: Record<string, string>) {
  const days = parseInt(args.days ?? '60', 10);
  console.log(`[backtest] Report mode — last ${days} days`);
  const rows = await runReport(days);
  if (rows.length === 0) {
    console.warn('[backtest] No snapshot rows found. Check .env.backtest credentials and that slate_snapshots has data.');
    return;
  }
  printReportSummary(rows);
  const csvPath = writeReportCSV(rows);
  console.log(`[backtest] CSV written: ${csvPath}`);
}

// ── Mode B: replay ────────────────────────────────────────────────────────────

async function modeReplay(args: Record<string, string>) {
  const days     = parseInt(args.days ?? '30', 10);
  const configArg = args.config ?? 'default';
  const modeArg  = args.mode ?? 'balanced';
  const configFile = args['config-file'];

  let configNames: string[];
  let configs: Record<string, typeof CONFIGS['default']>;

  if (configFile) {
    const { readFileSync } = await import('fs');
    const custom = JSON.parse(readFileSync(configFile, 'utf8'));
    configs = custom;
    configNames = Object.keys(custom);
  } else {
    configNames = configArg.split(',').map(s => s.trim());
    configs = {};
    for (const name of configNames) {
      if (!CONFIGS[name]) {
        console.error(`[backtest] Unknown config: "${name}". Available: ${Object.keys(CONFIGS).join(', ')}`);
        process.exit(1);
      }
      configs[name] = CONFIGS[name];
    }
  }

  const modes = modeArg === 'all'
    ? [...MODES]
    : [(modeArg as typeof MODES[number])];

  const dates = dateRange(days, args['end-date']);
  console.log(`[backtest] Replay mode — ${days} days, configs: [${configNames.join(', ')}], modes: [${modes.join(', ')}]`);
  console.log(`[backtest] Dates: ${dates[0]} → ${dates[dates.length - 1]}`);

  const allHits: HitResult[] = [];
  let processed = 0;
  const total = dates.length * SCOPES.length * configNames.length * modes.length;

  for (const date of dates) {
    const results = await fetchDrawResults(date);
    if (results.length === 0) continue; // no draw data for this date — skip

    // Baseline depends only on (date, scope, pickCount=6) — compute once per
    // scope and reuse across configs/modes.
    const baselineByScope: Record<Scope, ReturnType<typeof computeBaseline>> = {
      midday:  computeBaseline(results, 'midday'),
      evening: computeBaseline(results, 'evening'),
      allday:  computeBaseline(results, 'allday'),
    };

    for (const scope of SCOPES) {
      for (const configName of configNames) {
        for (const mode of modes) {
          try {
            const picks = await computeSlateAsOf(date, scope, configs[configName], mode);
            const hit = scorePicksVsResults(
              picks.map(p => ({ combo: p.combo, comboSet: p.comboSet })),
              results,
              scope,
            );
            const baseline = baselineByScope[scope];
            // Rail-matched baseline differs PER PICK SET — must compute per config/mode.
            const pickMix = { singles: 0, doubles: 0, triples: 0 };
            for (const p of picks) pickMix[p.multiplicity]++;
            const railBaseline = computeRailMatchedBaseline(results, scope, pickMix);
            allHits.push({
              date, scope, configName, mode,
              picks,
              hitsBox: hit.hitsBox,
              hitsStraight: hit.hitsStraight,
              totalHits: hit.totalHits,
              hittingCombos: hit.hittingCombos,
              hittingJurisdictions: hit.hittingJurisdictions,
              baselinePerPickHitProb: baseline.perPickHitProb,
              baselineExpectedPickHits: baseline.expectedPickHits,
              baselineSlateHitProb: baseline.slateHitProb,
              resultsInScope: baseline.resultsInScope,
              railMatchedExpectedPickHits: railBaseline.expectedPickHits,
              railMatchedSlateHitProb: railBaseline.slateHitProb,
            });
            processed++;
            if (processed % 10 === 0) {
              process.stdout.write(`\r[backtest] Progress: ${processed}/${total} slates replayed…`);
            }
          } catch (err) {
            const msg = String(err instanceof Error ? err.message : err);
            console.warn(`\n[backtest] WARN: ${date} ${scope} ${configName} ${mode}: ${msg}`);
          }
        }
      }
    }
  }

  console.log(`\n[backtest] Replay complete: ${allHits.length} slates`);
  printReplaySummary(allHits, configNames);
  const csvPath = writeReplayCSV(allHits);
  console.log(`[backtest] CSV written: ${csvPath}`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const [,, command, ...rest] = process.argv;
const args = parseArgs(rest);

if (command === 'report') {
  modeReport(args).catch(err => { console.error('[backtest] Fatal:', err); process.exit(1); });
} else if (command === 'replay') {
  modeReplay(args).catch(err => { console.error('[backtest] Fatal:', err); process.exit(1); });
} else {
  console.error('[backtest] Unknown command. Use: report | replay');
  console.error('  npm run backtest:report -- --days 60');
  console.error('  npm run backtest:replay -- --days 30 --config default,destroyed,legacy');
  process.exit(1);
}
