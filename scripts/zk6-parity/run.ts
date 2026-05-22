/**
 * run.ts — ZK6 parity harness.
 *
 * For each (scenario × scope):
 *   1. DELETE sandbox partition (clean slate)
 *   2. Run engines/zk6.ts in-process → capture returned snapshot + DB rows
 *   3. DELETE again
 *   4. POST to compute-slate-zk6 edge fn → capture returned JSON + DB rows
 *   5. Diff snapshot return + 4 tables
 *
 * Sandbox slate_dates: 2099-01-01 (today), 2099-01-02 (past-date), 2099-01-03 (DST-adjacent).
 * Always 'balanced' weightsKey.
 *
 * Flags:
 *   --dry-run       run sanity checks only, no writes
 *   --cleanup-only  emit + execute cleanup SQL only
 *   --scope=X       limit to one scope (debug)
 *   --scenario=N    limit to one scenario A|B|C (debug)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

import { captureAll, deletePartition, countSandboxRows, type Capture } from './capture.js';
import { diffCaptures, type Diff } from './diff.js';
import { invokeLocal, invokeEdge, pingEdge } from './invoke.js';

interface Scenario {
  id: 'A' | 'B' | 'C';
  label: string;
  slateDate: string;
}

const SCENARIOS: Scenario[] = [
  { id: 'A', label: 'today',          slateDate: '2099-01-01' },
  { id: 'B', label: 'past-date',      slateDate: '2099-01-02' },
  { id: 'C', label: 'DST-adjacent',   slateDate: '2099-01-03' },
];

const SCOPES = ['midday', 'evening', 'allday'] as const;
type Scope = (typeof SCOPES)[number];

interface CellResult {
  scenario: Scenario['id'];
  scope: Scope;
  status: 'PASS' | 'FAIL' | 'ERROR';
  snapshotDiffs: Diff[];
  tableDiffs: Record<string, Diff[]>;
  liveSnapshot?: any;
  edgeSnapshot?: any;
  liveCapture?: Capture;
  edgeCapture?: Capture;
  error?: string;
}

interface RunLog {
  startedAt: string;
  completedAt: string;
  sandboxDates: string[];
  results: CellResult[];
}

function nowIso(): string { return new Date().toISOString(); }

function logCleanupSQL(dates: string[]): void {
  console.log('\n────── Cleanup SQL ──────');
  for (const t of ['adaptive_tracking', 'daily_intelligence', 'engine_runs', 'slate_snapshots']) {
    console.log(`DELETE FROM ${t} WHERE slate_date IN (${dates.map(d => `'${d}'`).join(',')});`);
  }
  console.log('─────────────────────────\n');
}

async function executeCleanup(dates: string[]): Promise<void> {
  for (const d of dates) {
    for (const s of SCOPES) await deletePartition(d, s);
  }
  console.log(`[cleanup] Deleted all sandbox rows for ${dates.join(', ')}`);
}

async function sanityChecks(args: { dryRun: boolean }): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  // 1. Today is not a sandbox date
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (SCENARIOS.some(s => s.slateDate === today)) {
    reasons.push(`Today (${today}) collides with a sandbox slate_date — refusing to start.`);
  }

  // 2. Edge fn reachable
  const reachable = await pingEdge();
  if (!reachable) reasons.push('Edge function compute-slate-zk6 did not respond to OPTIONS ping.');

  // 3. .env.backtest service-role key — svc.ts throws on load if missing,
  // so we don't need a separate check here (would have already crashed).

  // 4. Sandbox tables empty (leftover from prior run)
  const counts = await countSandboxRows(SCENARIOS.map(s => s.slateDate));
  for (const [date, tables] of Object.entries(counts)) {
    const dirty = Object.entries(tables).filter(([, n]) => n > 0);
    if (dirty.length > 0) {
      reasons.push(`Sandbox date ${date} has leftover rows: ${dirty.map(([t, n]) => `${t}=${n}`).join(', ')}. Run --cleanup-only first.`);
    }
  }

  if (args.dryRun) {
    console.log('\n[dry-run] Sanity check results:');
    if (reasons.length === 0) {
      console.log('  ✓ Today is not a sandbox date');
      console.log('  ✓ Edge fn responding to OPTIONS ping');
      console.log('  ✓ .env.backtest credentials loaded');
      console.log('  ✓ Sandbox tables empty (clean to start)');
    } else {
      console.log('  ✗ Sanity check failures (would refuse to start):');
      for (const r of reasons) console.log(`     - ${r}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

async function runCell(scenario: Scenario, scope: Scope): Promise<CellResult> {
  const result: CellResult = {
    scenario: scenario.id, scope,
    status: 'PASS', snapshotDiffs: [], tableDiffs: {},
  };
  try {
    // 1. clean
    await deletePartition(scenario.slateDate, scope);
    // 2. local
    const liveSnapshot = await invokeLocal({ scope, targetDate: scenario.slateDate });
    const liveCapture = await captureAll(scenario.slateDate, scope);
    // 3. clean
    await deletePartition(scenario.slateDate, scope);
    // 4. edge
    const edgeSnapshot = await invokeEdge({ scope, targetDate: scenario.slateDate });
    const edgeCapture = await captureAll(scenario.slateDate, scope);
    // 5. diff
    const { snapshotDiffs, tableDiffs } = diffCaptures(liveCapture, edgeCapture);

    // Snapshot-return diff (the value the function returns to its caller)
    const { diffSnapshot } = await import('./diff.js');
    const returnDiffs = diffSnapshot(liveSnapshot, edgeSnapshot);

    result.snapshotDiffs = [...returnDiffs, ...snapshotDiffs];
    result.tableDiffs = tableDiffs;
    result.liveSnapshot = liveSnapshot;
    result.edgeSnapshot = edgeSnapshot;
    result.liveCapture = liveCapture;
    result.edgeCapture = edgeCapture;
    const totalDiffs =
      result.snapshotDiffs.length +
      Object.values(result.tableDiffs).reduce((s, d) => s + d.length, 0);
    result.status = totalDiffs === 0 ? 'PASS' : 'FAIL';
  } catch (e: any) {
    result.status = 'ERROR';
    result.error = String(e?.message ?? e);
  }
  return result;
}

function renderSummary(results: CellResult[]): void {
  console.log('\nSUMMARY');
  console.log('-------');
  for (const sc of SCENARIOS) {
    const row = SCOPES.map(scope => {
      const cell = results.find(r => r.scenario === sc.id && r.scope === scope);
      const status = cell?.status ?? '—';
      return `${scope.padEnd(7)} ${status.padEnd(5)}`;
    }).join('  ');
    console.log(`Scenario ${sc.id} (${sc.label.padEnd(14)}) ${row}`);
  }
}

function renderFailures(results: CellResult[]): void {
  const failed = results.filter(r => r.status !== 'PASS');
  if (failed.length === 0) {
    console.log('\nAll cells PASS — engine paths produce identical output across all scenarios/scopes.');
    return;
  }
  console.log('\nFAILURES (field-level)');
  console.log('----------------------');
  for (const cell of failed) {
    console.log(`\nScenario ${cell.scenario} / ${cell.scope} / ${cell.status}`);
    if (cell.error) { console.log(`  ERROR: ${cell.error}`); continue; }
    for (const d of cell.snapshotDiffs) {
      const delta = d.delta != null ? ` (Δ ${d.delta.toExponential(3)})` : '';
      console.log(`  ${d.path}: live=${JSON.stringify(d.live)} edge=${JSON.stringify(d.edge)}${delta}`);
    }
    for (const [tbl, diffs] of Object.entries(cell.tableDiffs)) {
      for (const d of diffs) {
        const delta = d.delta != null ? ` (Δ ${d.delta.toExponential(3)})` : '';
        console.log(`  ${d.path}: live=${JSON.stringify(d.live)} edge=${JSON.stringify(d.edge)}${delta}`);
      }
    }
  }
}

function writeRunLog(log: RunLog): string {
  const runsDir = pathResolve(process.cwd(), 'scripts/zk6-parity/runs');
  mkdirSync(runsDir, { recursive: true });
  const ts = log.startedAt.replace(/[:.]/g, '-');
  const file = pathResolve(runsDir, `${ts}.json`);
  writeFileSync(file, JSON.stringify(log, null, 2));
  return file;
}

function parseArgs(argv: string[]): {
  dryRun: boolean; cleanupOnly: boolean;
  scopeFilter?: Scope; scenarioFilter?: 'A'|'B'|'C';
} {
  const out: any = { dryRun: false, cleanupOnly: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--cleanup-only') out.cleanupOnly = true;
    else if (a.startsWith('--scope=')) out.scopeFilter = a.slice('--scope='.length);
    else if (a.startsWith('--scenario=')) out.scenarioFilter = a.slice('--scenario='.length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dates = SCENARIOS.map(s => s.slateDate);

  console.log('ZK6 PARITY HARNESS');
  console.log('==================');
  console.log(`Sandbox slate_dates: ${dates.join(', ')}`);
  console.log(`Mode: ${args.cleanupOnly ? 'cleanup-only' : args.dryRun ? 'dry-run' : 'full'}`);

  if (args.cleanupOnly) {
    logCleanupSQL(dates);
    await executeCleanup(dates);
    return;
  }

  const sanity = await sanityChecks({ dryRun: args.dryRun });
  if (!sanity.ok) {
    console.error('\n[FATAL] Sanity checks failed:');
    for (const r of sanity.reasons) console.error(`  - ${r}`);
    process.exit(args.dryRun ? 0 : 2);
  }

  if (args.dryRun) {
    console.log('\n[dry-run] All sanity checks passed. Real run would now execute:');
    let n = 0;
    for (const sc of SCENARIOS) for (const scope of SCOPES) {
      if (args.scenarioFilter && sc.id !== args.scenarioFilter) continue;
      if (args.scopeFilter && scope !== args.scopeFilter) continue;
      console.log(`  ${++n}. Scenario ${sc.id} (${sc.label}) / ${scope} → slate_date=${sc.slateDate}`);
    }
    console.log(`\n[dry-run] ${n} cells would run. No writes made.`);
    logCleanupSQL(dates);
    return;
  }

  const startedAt = nowIso();
  const results: CellResult[] = [];
  let cellNum = 0;
  const total =
    (args.scenarioFilter ? 1 : SCENARIOS.length) *
    (args.scopeFilter ? 1 : SCOPES.length);
  for (const sc of SCENARIOS) {
    if (args.scenarioFilter && sc.id !== args.scenarioFilter) continue;
    for (const scope of SCOPES) {
      if (args.scopeFilter && scope !== args.scopeFilter) continue;
      console.log(`\n[${++cellNum}/${total}] Scenario ${sc.id} (${sc.label}) / ${scope}`);
      const r = await runCell(sc, scope);
      console.log(`        → ${r.status}` +
        (r.status !== 'PASS' ? ` (${r.snapshotDiffs.length + Object.values(r.tableDiffs).reduce((s, d) => s + d.length, 0)} diffs)` : ''));
      results.push(r);
    }
  }
  const completedAt = nowIso();

  renderSummary(results);
  renderFailures(results);

  const log: RunLog = { startedAt, completedAt, sandboxDates: dates, results };
  const file = writeRunLog(log);
  console.log(`\n[log] Wrote full capture to: ${file}`);

  logCleanupSQL(dates);
  console.log('Run cleanup automatically: npm run zk6:parity -- --cleanup-only');

  process.exit(results.some(r => r.status !== 'PASS') ? 1 : 0);
}

main().catch(err => {
  console.error('[FATAL]', err?.stack ?? err);
  process.exit(2);
});
