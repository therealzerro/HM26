#!/usr/bin/env tsx
/**
 * detect-gaps.ts — surface missing slate days so a miss is never silent.
 *
 * Walks every date from the earliest recent activity up to today and reports, per
 * day, whether each scope has a slate_snapshot and whether the day's draws are in
 * histories. A "gap" is a day that has draws (or a neighbour does) but no slate —
 * exactly the hole the backfill writer fills. Output is human-readable AND a
 * machine block (--json) the Daily Workflow can consume to auto-backfill.
 *
 * READ-ONLY.
 *
 * Usage:
 *   npm run backfill:gaps                 # last 10 days
 *   npm run backfill:gaps -- --days 21
 *   npm run backfill:gaps -- --json       # emit JSON for the workflow
 */

import { dbGet } from '../backtest/data.js';
import type { Scope } from '../backtest/types.js';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { a[argv[i].slice(2)] = next; i++; } else { a[argv[i].slice(2)] = 'true'; }
    }
  }
  return a;
}

function todayET(): string {
  // ET is UTC-4/5; for a date-only gap scan, UTC date is close enough and the
  // workflow reconciles the exact day. Use UTC date.
  return new Date().toISOString().split('T')[0];
}

function daysBack(n: number): string[] {
  const out: string[] = [];
  const anchor = new Date(todayET() + 'T00:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anchor); d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = parseInt(args.days ?? '10', 10);
  const asJson = args.json === 'true';
  const dates = daysBack(days);
  const from = dates[0];

  // One query each for snapshots + histories across the window.
  const snaps = await dbGet<{ slate_date: string; scope: string }[]>(
    `/slate_snapshots?deleted_at=is.null&mode=neq.zk30&slate_date=gte.${from}&select=slate_date,scope&limit=2000`,
  );
  const hist = await dbGet<{ date_et: string }[]>(
    `/histories?date_et=gte.${from}&select=date_et&limit=5000`,
  );

  const snapByDate = new Map<string, Set<string>>();
  for (const r of Array.isArray(snaps) ? snaps : []) {
    if (!snapByDate.has(r.slate_date)) snapByDate.set(r.slate_date, new Set());
    snapByDate.get(r.slate_date)!.add(r.scope);
  }
  const histDays = new Set((Array.isArray(hist) ? hist : []).map(r => r.date_et));

  interface DayStatus { date: string; scopesWithSlate: string[]; missingScopes: string[]; hasDraws: boolean; isGap: boolean; }
  const statuses: DayStatus[] = dates.map(date => {
    const have = snapByDate.get(date) ?? new Set<string>();
    const missing = SCOPES.filter(s => !have.has(s));
    const hasDraws = histDays.has(date);
    // A gap = at least one scope missing a slate. Worth flagging regardless of
    // draws (the slate itself un-breaks surfaces); draws only gate hit detection.
    const isGap = missing.length > 0;
    return { date, scopesWithSlate: [...have], missingScopes: missing, hasDraws, isGap };
  });

  const gaps = statuses.filter(s => s.isGap);

  if (asJson) {
    console.log(JSON.stringify({
      window: { from, to: dates[dates.length - 1] },
      gaps: gaps.map(g => ({ date: g.date, missingScopes: g.missingScopes, hasDraws: g.hasDraws })),
    }, null, 2));
    return;
  }

  console.log(`\n── SLATE GAP SCAN — ${from} → ${dates[dates.length - 1]} ──\n`);
  for (const s of statuses) {
    const slateMark = s.missingScopes.length === 0 ? '✅ all 3' : `⚠️  missing: ${s.missingScopes.join(',')}`;
    const drawMark = s.hasDraws ? 'draws✓' : 'draws✗';
    console.log(`  ${s.date}  ${slateMark.padEnd(28)} ${drawMark}`);
  }
  console.log('');
  if (gaps.length === 0) {
    console.log('  ✅ No gaps — every day in the window has all three scope slates.');
  } else {
    console.log(`  ⚠️  ${gaps.length} day(s) with missing slates. Backfill oldest-first (each day needs the prior day imported):`);
    for (const g of gaps) {
      const draws = g.hasDraws ? '' : '  (import this day\'s draws too, for hit detection)';
      console.log(`     npm run backfill:slate -- --date ${g.date} --apply${draws}`);
    }
  }
  console.log('');
}

main().catch(err => { console.error('[backfill:gaps] Fatal:', err); process.exit(1); });
