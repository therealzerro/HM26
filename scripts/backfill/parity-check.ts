#!/usr/bin/env tsx
/**
 * parity-check.ts — prove the faithful as-of engine reproduces a real production
 * snapshot BEFORE the backfill writer is ever trusted to write.
 *
 * For a date that already has a production slate_snapshots row, this recomputes
 * the slate via computeSlateAsOf (the leakage-free engine) using LIVE app_config,
 * and compares the resulting comboSets — both as a SET (membership) and in RANK
 * order — against what production actually stored. A clean match means the Node
 * config mirror + as-of engine are a trustworthy stand-in for the edge fn.
 *
 * READ-ONLY. Issues only GET requests. Writes nothing.
 *
 * Usage:
 *   npm run backfill:parity                      # auto-pick the latest snapshot date
 *   npm run backfill:parity -- --date 2026-06-18
 *   npm run backfill:parity -- --date 2026-06-18 --scope midday
 */

import { dbGet } from '../backtest/data.js';
import { computeSlateAsOf } from '../backtest/replay.js';
import { loadBackfillConfig } from './loadConfig.js';
import type { Scope } from '../backtest/types.js';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = argv[i + 1] ?? 'true'; i++; }
  }
  return a;
}

interface SnapshotRow {
  slate_date: string;
  scope: string;
  top_k_boxes_json: string[] | null;
  top_k_straights_json: { combo?: string; comboSet?: string; bestOrder?: string }[] | null;
}

async function latestSnapshotDate(): Promise<string | null> {
  const rows = await dbGet<{ slate_date: string }[]>(
    `/slate_snapshots?deleted_at=is.null&mode=neq.zk30&select=slate_date&order=slate_date.desc&limit=1`,
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0].slate_date : null;
}

async function fetchSnapshot(date: string, scope: Scope): Promise<SnapshotRow | null> {
  const rows = await dbGet<SnapshotRow[]>(
    `/slate_snapshots?slate_date=eq.${date}&scope=eq.${scope}&deleted_at=is.null&mode=neq.zk30` +
    `&select=slate_date,scope,top_k_boxes_json,top_k_straights_json&order=updated_at_et.desc&limit=1`,
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function storedComboSets(row: SnapshotRow): string[] {
  if (Array.isArray(row.top_k_boxes_json) && row.top_k_boxes_json.length > 0) {
    return row.top_k_boxes_json.map(String);
  }
  // Fallback: derive from straights json.
  if (Array.isArray(row.top_k_straights_json)) {
    return row.top_k_straights_json.map(p => String(p.comboSet ?? p.combo ?? '')).filter(Boolean);
  }
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date && args.date !== 'true' ? args.date : await latestSnapshotDate();
  if (!date) { console.error('[parity] No production snapshot found to validate against.'); process.exit(1); }
  const scopes = args.scope && args.scope !== 'true' ? [args.scope as Scope] : SCOPES;

  console.log(`\n[parity] Validating faithful as-of engine against PRODUCTION snapshot — date ${date}`);
  console.log('[parity] (read-only — nothing is written)\n');

  let totalMembership = 0, totalMembershipMatch = 0;
  let totalRank = 0, totalRankMatch = 0;
  let scopesWithSnapshot = 0;

  for (const scope of scopes) {
    const snap = await fetchSnapshot(date, scope);
    if (!snap) { console.log(`  ${scope.padEnd(8)} — no production snapshot for this date/scope, skipping`); continue; }
    scopesWithSnapshot++;

    const stored = storedComboSets(snap);
    const cfg = await loadBackfillConfig(scope);
    const picks = await computeSlateAsOf(date, scope, cfg, 'balanced', { asOfBoxPressure: true });
    const computed = picks.map(p => p.comboSet);

    const storedSet = new Set(stored);
    const computedSet = new Set(computed);
    const inBoth = computed.filter(c => storedSet.has(c)).length;
    const membershipMatch = inBoth === stored.length && stored.length === computed.length;

    // Rank parity: same comboSet at same ordinal.
    const n = Math.min(stored.length, computed.length);
    let rankMatch = 0;
    for (let i = 0; i < n; i++) if (stored[i] === computed[i]) rankMatch++;
    const rankExact = rankMatch === stored.length && stored.length === computed.length;

    totalMembership += stored.length;
    totalMembershipMatch += inBoth;
    totalRank += stored.length;
    totalRankMatch += rankMatch;

    const flag = membershipMatch ? (rankExact ? '✅ EXACT' : '🟡 SET-OK (rank differs)') : '❌ MISMATCH';
    console.log(`  ${scope.padEnd(8)} ${flag}`);
    console.log(`     stored   : ${stored.join(' ')}`);
    console.log(`     computed : ${computed.join(' ')}`);
    console.log(`     membership ${inBoth}/${stored.length}   rank ${rankMatch}/${stored.length}`);
    if (!membershipMatch) {
      const missing = stored.filter(c => !computedSet.has(c));
      const extra = computed.filter(c => !storedSet.has(c));
      if (missing.length) console.log(`     in prod, not computed: ${missing.join(' ')}`);
      if (extra.length)   console.log(`     computed, not in prod: ${extra.join(' ')}`);
    }
    console.log('');
  }

  if (scopesWithSnapshot === 0) { console.error('[parity] No snapshots found for the chosen date.'); process.exit(1); }

  const memPct = totalMembership ? (100 * totalMembershipMatch / totalMembership) : 0;
  const rankPct = totalRank ? (100 * totalRankMatch / totalRank) : 0;
  console.log('── SUMMARY ──────────────────────────────────────────');
  console.log(`  membership parity : ${totalMembershipMatch}/${totalMembership}  (${memPct.toFixed(1)}%)`);
  console.log(`  rank parity       : ${totalRankMatch}/${totalRank}  (${rankPct.toFixed(1)}%)`);
  console.log('');
  if (memPct === 100) {
    console.log('  ✅ Membership 100% — the faithful engine reproduces production picks. Writer is trustworthy.');
  } else if (memPct >= 95) {
    console.log('  🟡 Membership ≥95% — close. Investigate residual (likely block source-B / timesDrawn drift) before trusting writes.');
  } else {
    console.log('  ❌ Membership <95% — DO NOT enable the writer. The config mirror or engine diverges from production.');
  }
}

main().catch(err => { console.error('[parity] Fatal:', err); process.exit(1); });
