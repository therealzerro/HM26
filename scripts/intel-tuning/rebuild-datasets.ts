#!/usr/bin/env tsx
/**
 * rebuild-datasets.ts — Rebuild datasets_box.ds_raw + times_drawn from histories.
 *
 * Why this exists: importDaily (hooks/useDataIngestion.tsx) was incrementing
 * ds_raw by +1 daily without using the CSV's explicit DrawsSince column, so
 * values drifted hundreds of days off from reality. This script recomputes
 * ground truth directly from `histories` for each (scope, horizon, box-set)
 * triplet and writes corrected values back via service-role REST.
 *
 * DEFAULT: dry-run (prints diff, writes nothing). Pass --apply to write.
 *
 * Usage:
 *   npm run rebuild:datasets                       # dry-run, all scopes/horizons
 *   npm run rebuild:datasets -- --scope midday    # one scope
 *   npm run rebuild:datasets -- --apply           # WRITE to production
 */

import { dbGet } from '../backtest/data.js';
import { toComboSet } from '../../lib/engineCore.js';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !KEY) { console.error('Missing .env.backtest creds'); process.exit(1); }

const HORIZONS_DAYS: Record<string, number> = {
  H01Y: 365, H02Y: 730, H03Y: 1095, H04Y: 1460, H05Y: 1825,
  H06Y: 2190, H07Y: 2555, H08Y: 2920, H09Y: 3285, H10Y: 3650,
};
const HORIZONS = Object.keys(HORIZONS_DAYS);
const SCOPES = ['midday', 'evening', 'allday'] as const;

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true'; if (a[argv[i].slice(2)] !== 'true') i++; }
  }
  return a;
}

async function fetchHistoriesForScope(scope: string, sinceDate: string): Promise<{ result_digits: string; date_et: string; session: string }[]> {
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  // Paginate to avoid 1000-row PostgREST default cap
  const rows: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const chunk = await dbGet<any[]>(
      `/histories?date_et=gte.${sinceDate}${sessionClause}&select=result_digits,date_et,session&order=date_et.desc&limit=${PAGE}&offset=${from}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchExistingDataset(scope: string, horizon: string): Promise<Map<string, { ds_raw: number; times_drawn: number; id: string }>> {
  const rows = await dbGet<any[]>(
    `/datasets_box?class_id=eq.1&scope=eq.${scope}&horizon_label=eq.${horizon}&deleted_at=is.null&jurisdiction=is.null&select=id,key,ds_raw,times_drawn&limit=5000`,
  );
  const m = new Map<string, { ds_raw: number; times_drawn: number; id: string }>();
  if (Array.isArray(rows)) for (const r of rows) m.set(r.key, { ds_raw: r.ds_raw, times_drawn: r.times_drawn, id: r.id });
  return m;
}

function daysBetween(today: Date, dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

interface Diff {
  scope: string; horizon: string; key: string;
  oldDsRaw: number; newDsRaw: number;
  oldTd: number; newTd: number;
}

async function rebuildScopeHorizon(scope: string, horizon: string, todayUtc: Date): Promise<{ diffs: Diff[]; updates: any[] }> {
  const horizonDays = HORIZONS_DAYS[horizon];
  const sinceDate = new Date(todayUtc.getTime() - horizonDays * 86400000).toISOString().split('T')[0];

  const [histories, existing] = await Promise.all([
    fetchHistoriesForScope(scope, sinceDate),
    fetchExistingDataset(scope, horizon),
  ]);

  // Compute the most-recent hit per box-set within the horizon window from histories
  const mostRecentHit = new Map<string, string>();
  for (const row of histories) {
    if (!/^\d{3}$/.test(row.result_digits ?? '')) continue;
    const sorted = row.result_digits.split('').sort().join('');
    const cur = mostRecentHit.get(sorted);
    if (!cur || row.date_et > cur) mostRecentHit.set(sorted, row.date_et);
  }

  // ds_raw correction only. times_drawn left as-is — histories window (~130d)
  // doesn't cover longer horizons and we'd lose long-term frequency data.
  // For ds_raw: if histories shows a recent hit, that's the truth. Otherwise
  // we DON'T touch ds_raw — the stored value (from the original dataset build)
  // is the best we have for combos absent from recent histories.
  const diffs: Diff[] = [];
  const updates: any[] = [];
  for (const [key, ex] of existing) {
    const digits = key.match(/\d/g)?.join('').slice(0, 3) ?? '';
    const sorted = digits.split('').sort().join('');
    const isCanonical = key === sorted;

    if (!isCanonical) continue; // skip permutation rows — they don't hold data

    const recent = mostRecentHit.get(sorted);
    if (!recent) continue; // no recent history → leave stored ds_raw alone

    const newDsRaw = daysBetween(todayUtc, recent);
    if (newDsRaw === ex.ds_raw) continue; // already accurate

    diffs.push({ scope, horizon, key, oldDsRaw: ex.ds_raw, newDsRaw, oldTd: ex.times_drawn, newTd: ex.times_drawn });
    updates.push({ id: ex.id, ds_raw: newDsRaw }); // ONLY ds_raw, NOT times_drawn
  }
  return { diffs, updates };
}

async function applyUpdates(updates: any[]): Promise<{ ok: number; failed: number }> {
  let ok = 0, failed = 0;
  // PATCH by id, 50 per batch
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async u => {
      try {
        const res = await fetch(`${URL}/rest/v1/datasets_box?id=eq.${u.id}`, {
          method: 'PATCH',
          headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ds_raw: u.ds_raw, updated_at: new Date().toISOString() }),
        });
        if (res.ok) ok++; else { failed++; console.warn(`  PATCH failed id=${u.id} status=${res.status}`); }
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
  console.log(`  REBUILD datasets_box.ds_raw + times_drawn FROM histories`);
  console.log(`  Today (UTC) = ${today.toISOString().split('T')[0]}`);
  console.log(`  Mode: ${apply ? '🔴 APPLY (will write to production)' : '🟢 DRY-RUN (no writes)'}`);
  if (scopeFilter) console.log(`  Scope filter: ${scopeFilter}`);
  if (horizonFilter) console.log(`  Horizon filter: ${horizonFilter}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const allDiffs: Diff[] = [];
  for (const scope of SCOPES) {
    if (scopeFilter && scope !== scopeFilter) continue;
    for (const horizon of HORIZONS) {
      if (horizonFilter && horizon !== horizonFilter) continue;
      process.stdout.write(`  ${scope}/${horizon}… `);
      const { diffs, updates } = await rebuildScopeHorizon(scope, horizon, today);
      console.log(`${diffs.length} rows differ`);
      allDiffs.push(...diffs);
      if (apply && updates.length > 0) {
        const { ok, failed } = await applyUpdates(updates);
        console.log(`    applied: ok=${ok} failed=${failed}`);
      }
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Total rows that differ: ${allDiffs.length}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  // show top 10 biggest diffs (largest ds_raw correction)
  const sorted = [...allDiffs].sort((a, b) => Math.abs(b.oldDsRaw - b.newDsRaw) - Math.abs(a.oldDsRaw - a.newDsRaw));
  console.log(`\n── Largest ds_raw corrections (top 15) ──`);
  for (const d of sorted.slice(0, 15)) {
    const delta = d.newDsRaw - d.oldDsRaw;
    console.log(`  ${d.scope.padEnd(8)} ${d.horizon} key=${d.key.padEnd(4)} ds_raw ${d.oldDsRaw} → ${d.newDsRaw} (${delta >= 0 ? '+' : ''}${delta}d), td ${d.oldTd} → ${d.newTd}`);
  }
  if (!apply) console.log(`\n💡 Run again with --apply to write these corrections.`);
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
