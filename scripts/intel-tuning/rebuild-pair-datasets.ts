#!/usr/bin/env tsx
/**
 * rebuild-pair-datasets.ts — Rebuild datasets_pair.ds_raw from histories.
 *
 * Parallel to rebuild-datasets.ts (which handles datasets_box). Audited
 * 2026-05-13: 87.5% of midday H01Y pair rows were stale by >=5 days, median
 * 38 days off, max 716. Same drift pattern as BUG-130 (importDaily ds_raw
 * increment-without-anchor).
 *
 * For each (scope, horizon, class_id 2-11, key_pair), recompute the most
 * recent date the pair was "hit" by a draw in the histories window, then
 * PATCH ds_raw where stored value differs. times_drawn NOT touched (same
 * reason as box rebuild — histories window can't reconstruct multi-year
 * frequency aggregates).
 *
 * Pair-class semantics for a draw "abc":
 *   class 2 / 5  → sortedPair(a, b)       front pair (positional, normalized sorted)
 *   class 3 / 6  → sortedPair(b, c)       back pair
 *   class 4 / 7  → sortedPair(a, c)       split pair
 *   class 8      → sortedPair(s0, s1)     front pair from sorted-digit box
 *   class 9      → sortedPair(s1, s2)     back pair from sorted-digit box
 *   class 10     → sortedPair(s0, s2)     split pair from sorted-digit box
 *   class 11     → all three sorted-box pairs (any-position box)
 *
 * DEFAULT: dry-run. Pass --apply to write.
 *
 * Usage:
 *   npm run rebuild:pair-datasets                       # dry-run all
 *   npm run rebuild:pair-datasets -- --scope midday    # one scope
 *   npm run rebuild:pair-datasets -- --apply           # WRITE to production
 */

import { dbGet } from '../backtest/data.js';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !KEY) { console.error('Missing .env.backtest creds'); process.exit(1); }

const HORIZONS_DAYS: Record<string, number> = {
  H01Y: 365, H02Y: 730, H03Y: 1095, H04Y: 1460, H05Y: 1825,
  H06Y: 2190, H07Y: 2555, H08Y: 2920, H09Y: 3285, H10Y: 3650,
};
const HORIZONS = Object.keys(HORIZONS_DAYS);
const SCOPES = ['midday', 'evening', 'allday'] as const;
const CLASSES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      if (a[argv[i].slice(2)] !== 'true') i++;
    }
  }
  return a;
}

function sp(a: string, b: string): string { return a <= b ? a + b : b + a; }

/** All (class_id, pair_key) tuples produced by a single draw "abc". */
function pairsForDraw(digits: string): Array<[number, string]> {
  const a = digits[0], b = digits[1], c = digits[2];
  const s = [...digits].sort();
  const fStraight = sp(a, b);
  const bStraight = sp(b, c);
  const splitStraight = sp(a, c);
  const fBox  = sp(s[0], s[1]);
  const bBox  = sp(s[1], s[2]);
  const splitBox = sp(s[0], s[2]);
  return [
    [2, fStraight], [3, bStraight], [4, splitStraight],
    [5, fStraight], [6, bStraight], [7, splitStraight],
    [8, fBox], [9, bBox], [10, splitBox],
    [11, fBox], [11, bBox], [11, splitBox],
  ];
}

async function fetchHistoriesForScope(scope: string, sinceDate: string): Promise<{ result_digits: string; date_et: string }[]> {
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const rows: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const chunk = await dbGet<any[]>(
      `/histories?date_et=gte.${sinceDate}${sessionClause}&select=result_digits,date_et&order=date_et.desc&limit=${PAGE}&offset=${from}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchExistingPairs(scope: string, horizon: string): Promise<Array<{ id: string; key_pair: string; class_id: number; ds_raw: number }>> {
  const rows = await dbGet<any[]>(
    `/datasets_pair?scope=eq.${scope}&horizon_label=eq.${horizon}&deleted_at=is.null&jurisdiction=is.null&select=id,key_pair,class_id,ds_raw&limit=5000`,
  );
  return Array.isArray(rows) ? rows : [];
}

function daysBetween(today: Date, dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

interface Diff {
  scope: string; horizon: string; class_id: number; key_pair: string;
  oldDs: number; newDs: number;
}

async function rebuildScopeHorizon(scope: string, horizon: string, todayUtc: Date, scopeHistories: { result_digits: string; date_et: string }[]): Promise<{ diffs: Diff[]; updates: Array<{ id: string; ds_raw: number }> }> {
  const horizonDays = HORIZONS_DAYS[horizon];
  const sinceDate = new Date(todayUtc.getTime() - horizonDays * 86400000).toISOString().split('T')[0];
  const inWindow = scopeHistories.filter(r => r.date_et >= sinceDate);

  // Most-recent hit per (class_id, key_pair)
  const mostRecent = new Map<string, string>();
  const keyOf = (cid: number, pk: string) => `${cid}|${pk}`;
  for (const row of inWindow) {
    const rd = row.result_digits;
    if (!rd || !/^\d{3}$/.test(rd)) continue;
    for (const [cid, pk] of pairsForDraw(rd)) {
      const k = keyOf(cid, pk);
      const cur = mostRecent.get(k);
      if (!cur || row.date_et > cur) mostRecent.set(k, row.date_et);
    }
  }

  const existing = await fetchExistingPairs(scope, horizon);
  const diffs: Diff[] = [];
  const updates: Array<{ id: string; ds_raw: number }> = [];
  for (const r of existing) {
    if (!CLASSES.includes(r.class_id)) continue;
    const recent = mostRecent.get(keyOf(r.class_id, r.key_pair));
    if (!recent) continue; // no hit in horizon window → leave stored value alone
    const newDs = daysBetween(todayUtc, recent);
    if (newDs === r.ds_raw) continue;
    diffs.push({ scope, horizon, class_id: r.class_id, key_pair: r.key_pair, oldDs: r.ds_raw, newDs });
    updates.push({ id: r.id, ds_raw: newDs });
  }
  return { diffs, updates };
}

async function applyUpdates(updates: Array<{ id: string; ds_raw: number }>): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async u => {
      try {
        const res = await fetch(`${URL}/rest/v1/datasets_pair?id=eq.${u.id}`, {
          method: 'PATCH',
          headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ds_raw: u.ds_raw, updated_at: new Date().toISOString() }),
        });
        if (res.ok) ok++;
        else { failed++; console.warn(`  PATCH failed id=${u.id} status=${res.status}`); }
      } catch (e) { failed++; console.warn(`  PATCH error id=${u.id}:`, e); }
    }));
  }
  return { ok, failed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === 'true';
  const scopeFilter = args.scope ?? '';
  const horizonFilter = args.horizon ?? '';
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z');

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  REBUILD datasets_pair.ds_raw FROM histories`);
  console.log(`  Today (UTC) = ${today.toISOString().split('T')[0]}`);
  console.log(`  Mode: ${apply ? '🔴 APPLY (will write to production)' : '🟢 DRY-RUN (no writes)'}`);
  if (scopeFilter) console.log(`  Scope filter: ${scopeFilter}`);
  if (horizonFilter) console.log(`  Horizon filter: ${horizonFilter}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Fetch histories ONCE per scope (covers all horizons)
  const scopesToProcess = SCOPES.filter(s => !scopeFilter || s === scopeFilter);
  const histoEarliestDate = new Date(today.getTime() - HORIZONS_DAYS.H10Y * 86400000).toISOString().split('T')[0];
  const historiesByScope = new Map<string, { result_digits: string; date_et: string }[]>();
  for (const scope of scopesToProcess) {
    process.stdout.write(`  fetching ${scope} histories since ${histoEarliestDate}… `);
    const h = await fetchHistoriesForScope(scope, histoEarliestDate);
    historiesByScope.set(scope, h);
    console.log(`${h.length} rows`);
  }
  console.log();

  const allDiffs: Diff[] = [];
  let totalApplied = 0, totalFailed = 0;
  for (const scope of scopesToProcess) {
    const hist = historiesByScope.get(scope) ?? [];
    for (const horizon of HORIZONS) {
      if (horizonFilter && horizon !== horizonFilter) continue;
      process.stdout.write(`  ${scope}/${horizon}… `);
      const { diffs, updates } = await rebuildScopeHorizon(scope, horizon, today, hist);
      console.log(`${diffs.length} rows differ`);
      allDiffs.push(...diffs);
      if (apply && updates.length > 0) {
        const { ok, failed } = await applyUpdates(updates);
        console.log(`    applied: ok=${ok} failed=${failed}`);
        totalApplied += ok;
        totalFailed += failed;
      }
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Total rows that differ: ${allDiffs.length}`);
  if (apply) console.log(`  Total applied: ${totalApplied}  failed: ${totalFailed}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  // Top 15 biggest corrections
  const sorted = [...allDiffs].sort((a, b) => Math.abs(b.oldDs - b.newDs) - Math.abs(a.oldDs - a.newDs));
  console.log(`\n── Largest ds_raw corrections (top 15) ──`);
  for (const d of sorted.slice(0, 15)) {
    const delta = d.newDs - d.oldDs;
    console.log(`  ${d.scope.padEnd(8)} ${d.horizon} class=${String(d.class_id).padStart(2)} pair=${d.key_pair.padEnd(3)} ds ${String(d.oldDs).padStart(5)} → ${String(d.newDs).padStart(4)} (${delta >= 0 ? '+' : ''}${delta}d)`);
  }

  // By class breakdown
  const byClass = new Map<number, number>();
  for (const d of allDiffs) byClass.set(d.class_id, (byClass.get(d.class_id) ?? 0) + 1);
  console.log(`\n── Diffs by class ──`);
  for (const c of CLASSES) console.log(`  class ${c}: ${byClass.get(c) ?? 0} rows`);

  if (!apply) console.log(`\n💡 Run again with --apply to write these corrections.`);
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
