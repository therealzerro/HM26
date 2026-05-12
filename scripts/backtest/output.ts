/**
 * output.ts — CSV writer and console summary formatter.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ReportRow, HitResult } from './types.js';

const OUTPUT_DIR = join(process.cwd(), 'scripts', 'backtest', 'output');

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function isoTs(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ── Wilson confidence interval (95%) ─────────────────────────────────────────

function wilsonCI(hits: number, trials: number): { lo: number; hi: number } {
  if (trials === 0) return { lo: 0, hi: 0 };
  const z = 1.96;
  const p = hits / trials;
  const denom = 1 + z * z / trials;
  const centre = (p + z * z / (2 * trials)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials))) / denom;
  return {
    lo: Math.max(0, centre - margin),
    hi: Math.min(1, centre + margin),
  };
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function ci(hits: number, trials: number): string {
  const { lo, hi } = wilsonCI(hits, trials);
  return `[${pct(lo)}–${pct(hi)}]`;
}

// ── Report (Mode A) ───────────────────────────────────────────────────────────

export function writeReportCSV(rows: ReportRow[]): string {
  ensureOutputDir();
  const ts = isoTs();
  const path = join(OUTPUT_DIR, `report-${ts}.csv`);
  const header = 'date,scope,mode,snapshot_id,pick_count,hits_box,hits_straight,total_hits,source';
  const lines = rows.map(r =>
    [r.date, r.scope, r.mode, r.snapshotId, r.pickCount, r.hitsBox, r.hitsStraight, r.totalHits, r.source].join(','),
  );
  writeFileSync(path, [header, ...lines].join('\n') + '\n');
  return path;
}

// Boundary constants (ET-based)
const DESTROYED_START = '2026-05-09';
const CODE_CHANGE     = '2026-05-11';

// slateHit: binary "did ≥1 pick hit" — used for the primary hit rate (always 0–100%)
function slateHitCount(rows: ReportRow[]): number {
  return rows.filter(r => r.totalHits > 0).length;
}

function hitRateLine(rows: ReportRow[]): string {
  const n = rows.length;
  if (n === 0) return 'N/A (n=0)';
  const hit = slateHitCount(rows);
  const avg = rows.reduce((s, r) => s + r.totalHits, 0) / n;
  return `${pct(hit / n)} ${ci(hit, n)} (n=${n}, avg picks/slate: ${avg.toFixed(2)})`;
}

export function printReportSummary(rows: ReportRow[]): void {
  const total = rows.length;
  const totalPickHits = rows.reduce((s, r) => s + r.totalHits, 0);
  const slatesHit = slateHitCount(rows);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  BACKTEST REPORT — Historical Snapshot Hit Rate Analysis');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Dates covered: ${rows[0]?.date ?? '?'} → ${rows[rows.length - 1]?.date ?? '?'}`);
  console.log(`Snapshots analysed: ${total}  Slates with ≥1 hit: ${slatesHit}  Total pick hits: ${totalPickHits}`);
  console.log(`Overall slate hit rate: ${pct(total > 0 ? slatesHit / total : 0)} ${ci(slatesHit, total)}\n`);

  // Before vs after config destruction (2026-05-09)
  const beforeDestroy = rows.filter(r => r.date < DESTROYED_START);
  const afterDestroy  = rows.filter(r => r.date >= DESTROYED_START && r.date < CODE_CHANGE);
  const afterCode     = rows.filter(r => r.date >= CODE_CHANGE);

  console.log('── By period ───────────────────────────────────────────────');
  console.log(`  Before 2026-05-09 (pre-destruction):  ${hitRateLine(beforeDestroy)}`);
  console.log(`  2026-05-09–10 (destroyed config):     ${hitRateLine(afterDestroy)}`);
  console.log(`  2026-05-11+ (code changes era):       ${hitRateLine(afterCode)}\n`);

  // By scope
  console.log('── By scope ────────────────────────────────────────────────');
  for (const scope of ['midday', 'evening', 'allday']) {
    const s = rows.filter(r => r.scope === scope);
    console.log(`  ${scope.padEnd(8)}: ${hitRateLine(s)}`);
  }

  // By source
  const sources = [...new Set(rows.map(r => r.source))];
  if (sources.some(s => s !== 'unknown')) {
    console.log('\n── By source (live vs edge) ────────────────────────────────');
    for (const src of sources) {
      const s = rows.filter(r => r.source === src);
      console.log(`  ${src.padEnd(10)}: ${hitRateLine(s)}`);
    }
  }

  // Weekly breakdown
  console.log('\n── Weekly hit rate ─────────────────────────────────────────');
  const byWeek = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const d = new Date(r.date + 'T12:00:00');
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    const week = d.toISOString().split('T')[0];
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(r);
  }
  for (const [week, wRows] of [...byWeek.entries()].sort()) {
    const hit = slateHitCount(wRows);
    console.log(`  Week of ${week}: ${pct(hit / wRows.length)} ${ci(hit, wRows.length)} (n=${wRows.length})`);
  }
  console.log();
}

// ── Replay (Mode B) ───────────────────────────────────────────────────────────

export function writeReplayCSV(hits: HitResult[]): string {
  ensureOutputDir();
  const ts = isoTs();
  const path = join(OUTPUT_DIR, `replay-${ts}.csv`);
  const header = 'date,scope,config_name,mode,pick_1,pick_2,pick_3,pick_4,pick_5,pick_6,hits_box,hits_straight,total_hits,hitting_combos,hitting_jurisdictions';
  const lines = hits.map(r => {
    const picks = r.picks.map(p => p.combo).slice(0, 6);
    while (picks.length < 6) picks.push('');
    return [
      r.date, r.scope, r.configName, r.mode,
      ...picks,
      r.hitsBox, r.hitsStraight, r.totalHits,
      r.hittingCombos.join('|'),
      r.hittingJurisdictions.join('|'),
    ].join(',');
  });
  writeFileSync(path, [header, ...lines].join('\n') + '\n');
  return path;
}

export function printReplaySummary(hits: HitResult[], configNames: string[]): void {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  BACKTEST REPLAY — Engine Re-run Hit Rate Comparison');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const configName of configNames) {
    const rows = hits.filter(r => r.configName === configName);
    const totalPickHits = rows.reduce((s, r) => s + r.totalHits, 0);
    const slatesHit = rows.filter(r => r.totalHits > 0).length;
    console.log(`── Config: ${configName} ─────────────────────────────────────`);
    console.log(`  Overall: ${pct(rows.length > 0 ? slatesHit / rows.length : 0)} ${ci(slatesHit, rows.length)} (n=${rows.length} slates, ${totalPickHits} pick-hits)`);
    for (const scope of ['midday', 'evening', 'allday']) {
      const s = rows.filter(r => r.scope === scope);
      const hit = s.filter(r => r.totalHits > 0).length;
      console.log(`  ${scope.padEnd(8)}: ${pct(s.length > 0 ? hit / s.length : 0)} ${ci(hit, s.length)} (n=${s.length})`);
    }
    console.log();
  }

  // Side-by-side comparison (slate hit rate)
  if (configNames.length > 1) {
    console.log('── Side-by-side (slate hit rate = % slates with ≥1 hit) ────');
    const col = 12;
    const header = 'Scope'.padEnd(10) + configNames.map(c => c.padEnd(col)).join('');
    console.log('  ' + header);
    for (const scope of ['midday', 'evening', 'allday', 'ALL']) {
      const line = scope.padEnd(10) +
        configNames.map(cn => {
          const s = hits.filter(r => r.configName === cn && (scope === 'ALL' || r.scope === scope));
          const hit = s.filter(r => r.totalHits > 0).length;
          return (s.length > 0 ? pct(hit / s.length) : 'N/A').padEnd(col);
        }).join('');
      console.log('  ' + line);
    }
    console.log();
  }
}
