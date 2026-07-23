#!/usr/bin/env tsx
/**
 * backfill-di.ts — faithfully reconstruct and persist a missed day's
 * daily_intelligence top-30 (the documented ENG-BACKFILL-01 fast-follow).
 *
 * Reproduces the edge fn's DI write (compute-slate-zk6 index.ts ~1320-1424)
 * from a single as-of compute:
 *   - top-30 by finalScore, PRE-RAIL, permutation-level (no set dedup), with
 *     the today-hit hard block — rank 1..30, on_slate = combo ∈ same-compute K6.
 *   - K6 picks outside the top-30 appended as ranks 31+ (on_slate=true).
 *   - hit-bearing combos not otherwise placed appended as hit-orphan rows.
 *   - hit stamps recovered from adaptive_tracking (the BUG-139 strategy:
 *     AT is the canonical hit log and survives regens), straight > box on
 *     multi-state collapse. No re-run of hit detection is needed.
 *
 * ANCHOR GUARD (BUG-163): the as-of compute has run-to-run jitter from
 * non-unique pagination ordering. The K6 of the compute that builds the DI
 * rows MUST reproduce the STORED slate_snapshots comboSet sequence for the
 * date+scope exactly, else on_slate/extras would desync from the published
 * slate. The script retries the compute up to --attempts (default 4) times
 * until it anchors, and refuses the scope otherwise.
 *
 * PARITY (--parity): build rows for a date that PRODUCTION already wrote and
 * field-diff against stored daily_intelligence, writing nothing. Run this on
 * the freshest prod DI dates before the first --apply.
 *
 * SAFETY: dry-run by default. --apply DELETEs (slate_date, scope, mode) then
 * INSERTs, mirroring the edge fn's delete-all-then-insert (BUG-139).
 *
 * Usage:
 *   npm run backfill:di -- --date 2026-07-11                    # dry-run
 *   npm run backfill:di -- --date 2026-07-11 --apply
 *   npm run backfill:di -- --date 2026-07-10 --parity           # read-only diff vs prod
 *   npm run backfill:di -- --date 2026-07-11 --scope midday --apply
 */

import { dbGet } from '../backtest/data.js';
import { computeSlateAsOf } from '../backtest/replay.js';
import { loadBackfillConfig } from './loadConfig.js';
import { sbPost, sbDelete } from './write.js';
import type { ReplayPick, Scope } from '../backtest/types.js';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];
const MODE = 'balanced';
const FLOAT_TOL = 1e-6;

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { a[key] = next; i++; } else { a[key] = 'true'; }
    }
  }
  return a;
}

// ── Shared with backfill-slate.ts (kept in lockstep; see ENG-STALE-01 / PERSCOPE-02) ──

function applyNewRotationRules(cfg: any): void {
  cfg.excludeYesterdayHits = true;
  cfg.recentHitBlockDaysByScope = { midday: 1, evening: 3, allday: 3 };
  cfg.slateStalenessThresholdByScope = { midday: 0, evening: 2, allday: 2 };
}

async function fetchRecentSlateSets(scope: Scope, date: string, n: number): Promise<string[][]> {
  const rows = await dbGet<any[]>(
    `/slate_snapshots?scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&mode=neq.zk30&slate_date=lt.${date}&select=slate_date,top_k_boxes_json,top_k_straights_json,updated_at_et&order=slate_date.desc,updated_at_et.desc&limit=20`,
  );
  const byDate = new Map<string, string[]>();
  if (Array.isArray(rows)) for (const r of rows) {
    if (byDate.has(r.slate_date)) continue;
    const sets = Array.isArray(r.top_k_boxes_json) && r.top_k_boxes_json.length
      ? r.top_k_boxes_json.map(String)
      : (Array.isArray(r.top_k_straights_json) ? r.top_k_straights_json.map((p: any) => String(p?.comboSet ?? '')).filter(Boolean) : []);
    if (sets.length) byDate.set(r.slate_date, sets);
  }
  return [...byDate.values()].slice(0, n);
}

async function storedSlateSets(scope: Scope, date: string): Promise<string[]> {
  const rows = await dbGet<any[]>(
    `/slate_snapshots?slate_date=eq.${date}&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&mode=neq.zk30&select=top_k_boxes_json&order=updated_at_et.desc&limit=1`,
  );
  return Array.isArray(rows) && rows[0]?.top_k_boxes_json ? rows[0].top_k_boxes_json.map(String) : [];
}

// ── Hit recovery from adaptive_tracking (mirrors edge fn hitsByCombo) ──

interface HitStamp {
  hit_box: boolean; hit_straight: boolean;
  hit_state: string | null; hit_session: string | null; hit_result: string | null;
}

async function fetchHitsByCombo(date: string, scope: Scope): Promise<Map<string, HitStamp>> {
  const at = await dbGet<any[]>(
    `/adaptive_tracking?slate_date=eq.${date}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${MODE}&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo,hit_box,hit_straight,matched_state,matched_session,actual_result&limit=200`,
  );
  const m = new Map<string, HitStamp>();
  if (Array.isArray(at)) for (const r of at) {
    if (!r.combo) continue;
    const existing = m.get(r.combo);
    if (!existing || (r.hit_straight && !existing.hit_straight)) {
      m.set(r.combo, {
        hit_box: !!r.hit_box, hit_straight: !!r.hit_straight,
        hit_state: r.matched_state ?? null, hit_session: r.matched_session ?? null,
        hit_result: r.actual_result ?? null,
      });
    }
  }
  return m;
}

// ── Row builder (mirrors edge fn top30Rows / extraK6Rows / hitOrphanRows) ──

function comboSetOf(combo: string): string {
  return `{${combo.split('').sort().join(',')}}`;
}

function buildDiRows(date: string, scope: Scope, k6: ReplayPick[], top30: ReplayPick[], hits: Map<string, HitStamp>) {
  const k6Combos = new Set(k6.map(x => x.combo));
  const top30Combos = new Set(top30.map(p => p.combo));
  const stamp = (combo: string): HitStamp =>
    hits.get(combo) ?? { hit_box: false, hit_straight: false, hit_state: null, hit_session: null, hit_result: null };

  const pickRow = (p: ReplayPick, rank: number, onSlate: boolean) => ({
    slate_date: date, scope, mode: MODE, rank,
    combo: p.combo, combo_set: p.comboSet, multiplicity: p.multiplicity, top_pair: p.topPair,
    signal_box: p.signals!.BOX, signal_pburst: p.signals!.PBURST, signal_co: p.signals!.CO, signal_dgc: p.signals!.DGC ?? 0,
    energy_score: p.energy,
    draws_since: p.drawsSince ?? null, times_drawn: p.timesDrawn ?? 0, best_order: p.bestOrder ?? p.combo,
    on_slate: onSlate,
    ...stamp(p.combo),
  });

  const top30Rows = top30.map((p, i) => pickRow(p, i + 1, k6Combos.has(p.combo)));
  const extraK6Rows = k6.filter(x => !top30Combos.has(x.combo)).map((x, i) => pickRow(x, 30 + i + 1, true));

  const placed = new Set([...top30Combos, ...k6Combos]);
  const k6ExtraEndRank = 30 + extraK6Rows.length;
  const hitOrphanRows = [...hits.entries()]
    .filter(([combo]) => !placed.has(combo))
    .map(([combo, h], i) => ({
      slate_date: date, scope, mode: MODE, rank: k6ExtraEndRank + i + 1,
      combo, combo_set: comboSetOf(combo), multiplicity: null, top_pair: null,
      signal_box: 0, signal_pburst: 0, signal_co: 0, signal_dgc: 0,
      energy_score: 0,
      draws_since: null, times_drawn: 0, best_order: combo,
      on_slate: false,
      hit_box: h.hit_box, hit_straight: h.hit_straight,
      hit_state: h.hit_state, hit_session: h.hit_session, hit_result: h.hit_result,
    }));

  return [...top30Rows, ...extraK6Rows, ...hitOrphanRows];
}

// ── Anchored compute: retry until K6 reproduces the stored snapshot (BUG-163) ──

async function anchoredCompute(date: string, scope: Scope, attempts: number):
  Promise<{ k6: ReplayPick[]; top30: ReplayPick[] } | null> {
  const stored = await storedSlateSets(scope, date);
  if (stored.length === 0) {
    console.error(`  ${scope}: no stored slate_snapshots for ${date} — backfill the slate first (npm run backfill:slate).`);
    return null;
  }
  const cfg = await loadBackfillConfig(scope);
  applyNewRotationRules(cfg);
  const recentSlateSets = await fetchRecentSlateSets(scope, date, 2);
  for (let i = 1; i <= attempts; i++) {
    const top30: ReplayPick[] = [];
    const k6 = await computeSlateAsOf(date, scope, cfg, MODE, { asOfBoxPressure: true, emitRich: true, outTop30: top30, recentSlateSets });
    const computed = k6.map(p => p.comboSet);
    const anchored = stored.length === computed.length && stored.every((c, j) => c === computed[j]);
    if (anchored) {
      if (i > 1) console.log(`  ${scope}: anchored on attempt ${i}`);
      return { k6, top30 };
    }
    console.log(`  ${scope}: attempt ${i}/${attempts} did not reproduce the stored slate (BUG-163 jitter) — retrying`);
  }
  console.error(`  ${scope}: ❌ compute never anchored to the stored slate after ${attempts} attempts — refusing (on_slate would desync).`);
  return null;
}

// ── Parity diff vs stored prod DI rows ──

function diffRows(built: any[], stored: any[]): string[] {
  const problems: string[] = [];
  if (built.length !== stored.length) problems.push(`row count: built ${built.length} vs stored ${stored.length}`);
  const n = Math.min(built.length, stored.length);
  const KEYS_EXACT = ['rank', 'combo', 'combo_set', 'multiplicity', 'top_pair', 'on_slate', 'best_order', 'draws_since', 'times_drawn', 'hit_box', 'hit_straight', 'hit_state', 'hit_session', 'hit_result'];
  const KEYS_FLOAT = ['signal_box', 'signal_pburst', 'signal_co', 'signal_dgc', 'energy_score'];
  for (let i = 0; i < n; i++) {
    for (const k of KEYS_EXACT) {
      if ((built[i][k] ?? null) !== (stored[i][k] ?? null)) {
        problems.push(`rank ${stored[i].rank} ${k}: built ${JSON.stringify(built[i][k] ?? null)} vs stored ${JSON.stringify(stored[i][k] ?? null)}`);
      }
    }
    for (const k of KEYS_FLOAT) {
      const b = Number(built[i][k] ?? 0), s = Number(stored[i][k] ?? 0);
      if (Math.abs(b - s) > FLOAT_TOL) problems.push(`rank ${stored[i].rank} ${k}: built ${b} vs stored ${s}`);
    }
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('[backfill-di] --date YYYY-MM-DD is required.');
    process.exit(1);
  }
  const apply = args.apply === 'true';
  const parity = args.parity === 'true';
  const attempts = parseInt(args.attempts ?? '4', 10);
  const scopes = args.scope && args.scope !== 'true' ? [args.scope as Scope] : SCOPES;

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  BACKFILL DAILY_INTELLIGENCE — date ${date}, scopes [${scopes.join(', ')}]`);
  console.log(`  Mode: ${parity ? '🔍 PARITY (read-only diff vs stored prod rows)' : apply ? '🔴 APPLY (writes to production)' : '🟢 DRY-RUN (no writes)'}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  let okScopes = 0, wroteRows = 0;
  for (const scope of scopes) {
    const res = await anchoredCompute(date, scope, attempts);
    if (!res) continue;
    const hits = await fetchHitsByCombo(date, scope);
    const rows = buildDiRows(date, scope, res.k6, res.top30, hits);
    const extras = rows.filter(r => r.rank > 30 && r.on_slate).length;
    const orphans = rows.filter(r => r.rank > 30 && !r.on_slate).length;
    const onSlate = rows.filter(r => r.on_slate).length;
    const stamped = rows.filter(r => r.hit_box || r.hit_straight).length;
    console.log(`\n  ── ${scope} ──  ${rows.length} rows (top30 + ${extras} K6-extras + ${orphans} hit-orphans), on_slate ${onSlate}, hit-stamped ${stamped}`);

    if (parity) {
      const stored = await dbGet<any[]>(
        `/daily_intelligence?slate_date=eq.${date}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${MODE}&order=rank.asc&limit=200`,
      );
      const problems = diffRows(rows, Array.isArray(stored) ? stored : []);
      if (problems.length === 0) {
        console.log(`     ✅ EXACT — all ${rows.length} rows match stored production DI field-for-field`);
        okScopes++;
      } else {
        console.log(`     ❌ ${problems.length} field diff(s):`);
        for (const p of problems.slice(0, 12)) console.log(`        ${p}`);
        if (problems.length > 12) console.log(`        … ${problems.length - 12} more`);
      }
      continue;
    }

    if (!apply) {
      console.log(`     [dry-run] would DELETE daily_intelligence (${date}, ${scope}, ${MODE}) then INSERT ${rows.length} rows`);
      okScopes++;
      continue;
    }

    await sbDelete(`/daily_intelligence?slate_date=eq.${date}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${MODE}`);
    await sbPost('/daily_intelligence', rows, 'return=minimal');
    wroteRows += rows.length;
    okScopes++;
    console.log(`     ✅ wrote ${rows.length} daily_intelligence rows`);
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  if (parity) console.log(`  PARITY: ${okScopes}/${scopes.length} scopes exact.`);
  else if (apply) console.log(`  DONE — wrote ${wroteRows} rows across ${okScopes}/${scopes.length} scope(s).`);
  else console.log(`  DRY-RUN complete (${okScopes}/${scopes.length} scopes buildable). Re-run with --apply to write.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
  if (okScopes !== scopes.length) process.exit(1);
}

main().catch(err => { console.error('[backfill-di] Fatal:', err); process.exit(1); });
