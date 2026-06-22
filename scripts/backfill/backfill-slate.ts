#!/usr/bin/env tsx
/**
 * backfill-slate.ts — faithfully reconstruct and persist a MISSED day's slate.
 *
 * The daily workflow is the only trigger for slate generation; when it doesn't
 * run (missed import, skipped morning), that day gets no snapshot, the consumer
 * surfaces render empty, and hit detection has nothing to score — a silent hole
 * in the chain. This script closes that hole AFTER the fact, the only correct way:
 *
 *   1. Reconstruct the slate AS-OF the missed date with NO forward-leak
 *      (computeSlateAsOf + asOfBoxPressure), using LIVE app_config — proven to
 *      reproduce production pick-for-pick by `npm run backfill:parity`.
 *   2. Write slate_snapshots + adaptive_tracking in the exact production shape,
 *      stamped slate_date = the missed date, marked _source:'backfill' for audit.
 *   3. Trigger run-hit-detection for the date so the recovered slate gets scored.
 *
 * IT CANNOT INVENT DRAW RESULTS. If histories has no rows for the date (and the
 * day before, which the slate needs as input), the script refuses — import the
 * draws first.
 *
 * SAFETY: dry-run by default (prints what it would write). Pass --apply to write.
 * The parity gate must pass (recompute a recent real snapshot and match it) or
 * the writer aborts — pass --skip-parity only with --force.
 *
 * Usage:
 *   npm run backfill:slate -- --date 2026-06-20                 # dry-run, all scopes
 *   npm run backfill:slate -- --date 2026-06-20 --apply         # WRITE
 *   npm run backfill:slate -- --date 2026-06-20 --scope midday --apply
 *   npm run backfill:slate -- --date 2026-06-20 --apply --no-hit-detect
 */

import { dbGet } from '../backtest/data.js';
import { computeSlateAsOf } from '../backtest/replay.js';
import { computeSlateHash, H_ALL } from '../../lib/engineCore.js';
import { loadBackfillConfig } from './loadConfig.js';
import { sbPost, sbPatch, sbDelete, invokeFunction } from './write.js';
import type { ReplayPick, Scope } from '../backtest/types.js';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];
const MODE = 'balanced';

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

function tagForPosition(pos: number): 'overdue' | 'strong' | 'depth' {
  if (pos === 1) return 'overdue';
  if (pos <= 3) return 'strong';
  return 'depth';
}

function q75(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length * 0.75)] ?? 0;
}

function prevDay(date: string): string {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

async function histCount(date: string): Promise<number> {
  const rows = await dbGet<any[]>(`/histories?date_et=eq.${date}&select=session&limit=200`);
  return Array.isArray(rows) ? rows.length : 0;
}

/**
 * ENG-STALE-01: the last N canonical prior slates (comboSet arrays) for a scope,
 * strictly before `date` — feeds the staleness block in the as-of engine. Canonical =
 * latest snapshot per slate_date. Order-independent downstream (the engine intersects).
 */
async function fetchRecentSlateSets(scope: Scope, date: string, n: number): Promise<string[][]> {
  const rows = await dbGet<any[]>(
    `/slate_snapshots?scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&mode=neq.zk30&slate_date=lt.${date}&select=slate_date,top_k_boxes_json,top_k_straights_json,updated_at_et&order=slate_date.desc,updated_at_et.desc&limit=20`,
  );
  const byDate = new Map<string, string[]>();
  if (Array.isArray(rows)) for (const r of rows) {
    if (byDate.has(r.slate_date)) continue; // first per date = latest (updated_at desc)
    const sets = Array.isArray(r.top_k_boxes_json) && r.top_k_boxes_json.length
      ? r.top_k_boxes_json.map(String)
      : (Array.isArray(r.top_k_straights_json) ? r.top_k_straights_json.map((p: any) => String(p?.comboSet ?? '')).filter(Boolean) : []);
    if (sets.length) byDate.set(r.slate_date, sets);
  }
  return [...byDate.values()].slice(0, n);
}

/**
 * The parity gate proves the ENGINE+CONFIG faithfully reconstruct production
 * TODAY, so it validates against the FRESHEST real snapshot (least datasets-drift)
 * — NOT a day adjacent to an old backfill target. asOfBoxPressure corrects combos
 * that drew on the reference day; the only residual is prod's own ds_raw staleness
 * on days 4+ back, which says nothing about whether the engine is faithful now.
 */
async function freshestSnapshotDate(excludeDate: string): Promise<string | null> {
  const rows = await dbGet<{ slate_date: string }[]>(
    `/slate_snapshots?deleted_at=is.null&mode=neq.zk30&slate_date=neq.${excludeDate}&select=slate_date&order=slate_date.desc&limit=1`,
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0].slate_date : null;
}

/** Recompute a recent real snapshot and confirm membership+rank match. */
async function parityGate(refDate: string): Promise<boolean> {
  console.log(`\n[backfill] PARITY GATE — recomputing ${refDate} (a real production snapshot) to confirm fidelity…`);
  let okScopes = 0, total = 0;
  for (const scope of SCOPES) {
    const snap = await dbGet<{ top_k_boxes_json: string[] | null }[]>(
      `/slate_snapshots?slate_date=eq.${refDate}&scope=eq.${scope}&deleted_at=is.null&mode=neq.zk30&select=top_k_boxes_json&order=updated_at_et.desc&limit=1`,
    );
    const stored = Array.isArray(snap) && snap[0]?.top_k_boxes_json ? snap[0].top_k_boxes_json.map(String) : [];
    if (stored.length === 0) continue;
    total++;
    const cfg = await loadBackfillConfig(scope);
    const picks = await computeSlateAsOf(refDate, scope, cfg, MODE, { asOfBoxPressure: true });
    const computed = picks.map(p => p.comboSet);
    const exact = stored.length === computed.length && stored.every((c, i) => c === computed[i]);
    console.log(`  ${scope.padEnd(8)} ${exact ? '✅ exact' : '❌ differs'}`);
    if (exact) okScopes++;
  }
  const pass = total > 0 && okScopes === total;
  console.log(`[backfill] parity: ${okScopes}/${total} scopes exact → ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function buildSnapshotPayload(date: string, scope: Scope, picks: ReplayPick[], weights: any, hash: string, nowIso: string) {
  const horizonsPresent: Record<string, unknown> = {};
  for (const h of H_ALL) horizonsPresent[h] = true;
  const topKStraights = picks.map((p, idx) => ({
    combo: p.combo, comboSet: p.comboSet,
    signals: p.signals, multiplicity: p.multiplicity, topPair: p.topPair,
    energy: p.energy, temperature: p.energy, rank: idx + 1,
    bestOrder: p.bestOrder, confidence: 100,
    drawsSince: p.drawsSince ?? null, timesDrawn: p.timesDrawn ?? 0, dsRaw: p.dsRaw ?? 0,
    lastSeen: null, tag: tagForPosition(idx + 1),
    topJurisdictions: [], recentStateHits14d: 0,
  }));
  const componentsJson = picks.map(p => ({
    combo: p.combo, components: p.signals, temperature: p.energy,
    multiplicity: p.multiplicity, topPair: p.topPair, indicator: p.indicator, energy: p.energy,
  }));
  return {
    scope,
    horizons_present_json: {
      ...horizonsPresent, _engineVersion: 'backfill-v1', _mode: MODE,
      _source: 'backfill', _backfill: true, _backfilledAt: nowIso,
    },
    weights_json: { ...weights, _mode: MODE },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: picks.map(p => p.comboSet),
    components_json: componentsJson,
    updated_at_et: nowIso, slate_date: date,
    snapshot_hash: hash, hash, admin_published: true,
  };
}

function buildAtRows(date: string, scope: Scope, k6: ReplayPick[], top30: ReplayPick[], hash: string) {
  const boxQ75    = q75(top30.map(p => p.signals!.BOX));
  const pburstQ75 = q75(top30.map(p => p.signals!.PBURST));
  const coQ75     = q75(top30.map(p => p.signals!.CO));
  const dgcQ75    = q75(top30.map(p => p.signals!.DGC ?? 0));
  return k6.map((x, idx) => {
    const bs = x.signals!.BOX, ps = x.signals!.PBURST, cs = x.signals!.CO, ds = x.signals!.DGC;
    const dominant =
      bs >= ps && bs >= cs && bs >= ds ? 'BOX' :
      ps >= cs && ps >= ds              ? 'PBURST' :
      cs >= ds                          ? 'CO' : 'DGC';
    return {
      slate_date: date, scope, slate_hash: hash,
      rank: idx + 1, combo: x.combo, combo_set: x.comboSet,
      signal_box: bs, signal_pburst: ps, signal_co: cs, signal_burst: ds,
      energy_score: x.energy, mode: MODE,
      box_top_quartile: bs >= boxQ75, pburst_top_quartile: ps >= pburstQ75,
      co_top_quartile: cs >= coQ75, burst_top_quartile: ds >= dgcQ75,
      dominant_signal: dominant,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('[backfill] --date YYYY-MM-DD is required.');
    process.exit(1);
  }
  const apply = args.apply === 'true';
  const force = args.force === 'true';
  const skipParity = args['skip-parity'] === 'true';
  const noHitDetect = args['no-hit-detect'] === 'true';
  const scopes = args.scope && args.scope !== 'true' ? [args.scope as Scope] : SCOPES;
  const nowIso = new Date().toISOString();

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  BACKFILL SLATE — date ${date}, scopes [${scopes.join(', ')}]`);
  console.log(`  Mode: ${apply ? '🔴 APPLY (writes to production)' : '🟢 DRY-RUN (no writes)'}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  // ── Pre-flight: the engine reconstructs the slate but cannot invent draws.
  const inputDay = prevDay(date);
  const [inputRows, dayRows] = await Promise.all([histCount(inputDay), histCount(date)]);
  console.log(`\n[backfill] pre-flight:`);
  console.log(`  histories rows for input day ${inputDay}: ${inputRows}`);
  console.log(`  histories rows for target day ${date}:   ${dayRows}`);
  if (inputRows === 0) {
    console.error(`\n❌ No histories for ${inputDay} — the ${date} slate needs the prior day's draws as input.`);
    console.error(`   Import ${inputDay} (and earlier missing days, oldest first) before backfilling ${date}.`);
    process.exit(1);
  }
  if (dayRows === 0) {
    console.warn(`\n⚠️  No histories for ${date} itself — the slate can be reconstructed, but hit detection`);
    console.warn(`   will find nothing to score until ${date}'s draws are imported. Proceeding with slate only.`);
  }

  // ── Parity gate.
  if (!skipParity) {
    const ref = await freshestSnapshotDate(date);
    if (!ref) {
      console.warn('[backfill] No prior snapshot to run the parity gate against; skipping gate.');
    } else {
      const pass = await parityGate(ref);
      if (!pass && !force) {
        console.error('\n❌ Parity gate FAILED. Refusing to write. Re-run with --force to override (not recommended),');
        console.error('   or investigate config drift via: npm run backfill:parity -- --date ' + ref);
        process.exit(1);
      }
      if (!pass && force) console.warn('\n⚠️  Parity gate failed but --force set — proceeding anyway.');
    }
  } else if (!force) {
    console.error('[backfill] --skip-parity requires --force.');
    process.exit(1);
  }

  // ── Per-scope reconstruct + write.
  let wroteSnapshots = 0, wroteAtRows = 0;
  for (const scope of scopes) {
    const cfg = await loadBackfillConfig(scope);
    // ENG-BLOCK-PERSCOPE-02 + ENG-STALE-01 (2026-06-22): the new per-scope rotation rules
    // are hardcoded in the production edge fn (not app_config), so overlay them here so a
    // regenerated past slate matches what the NEW engine produces. midday is a no-op
    // (block stays 1, staleness off). The parity gate above still validates the BASE
    // scoring engine against the (old-logic) stored reference; these are deterministic
    // rotation overlays applied on top of a parity-confirmed base.
    cfg.excludeYesterdayHits = true;
    cfg.recentHitBlockDaysByScope = { midday: 1, evening: 3, allday: 3 };
    cfg.slateStalenessThresholdByScope = { midday: 0, evening: 2, allday: 2 };
    const recentSlateSets = await fetchRecentSlateSets(scope, date, 2);
    const top30: ReplayPick[] = [];
    const k6 = await computeSlateAsOf(date, scope, cfg, MODE, { asOfBoxPressure: true, emitRich: true, outTop30: top30, recentSlateSets });
    if (k6.length === 0) { console.warn(`  ${scope}: engine returned 0 picks, skipping`); continue; }

    const hash = computeSlateHash(scope, MODE, k6.map(p => p.combo), { ...Object.fromEntries(H_ALL.map(h => [h, true])) });
    const snapshot = buildSnapshotPayload(date, scope, k6, cfg.presets.balanced, hash, nowIso);
    const atRows = buildAtRows(date, scope, k6, top30, hash);

    console.log(`\n  ── ${scope} ──  hash=${hash}`);
    console.log(`     picks: ${k6.map((p, i) => `${i + 1}.${p.comboSet}(ds${p.drawsSince})`).join('  ')}`);

    if (!apply) {
      console.log(`     [dry-run] would soft-delete prior ${scope} snapshot for ${date}, insert 1 snapshot + ${atRows.length} adaptive_tracking rows`);
      continue;
    }

    // Soft-delete prior snapshot for this scope+date (matches edge fn), then insert.
    await sbPatch(`/slate_snapshots?scope=eq.${encodeURIComponent(scope)}&slate_date=eq.${date}&deleted_at=is.null`, { deleted_at: nowIso });
    await sbPost('/slate_snapshots', snapshot, 'return=minimal');
    wroteSnapshots++;
    console.log(`     ✅ wrote slate_snapshots row (slate_date=${date}, _source=backfill)`);

    // Regen hygiene: a regenerated slate gets a NEW content hash, so adaptive_tracking
    // rows from a PRIOR generation for this scope+date would orphan (their snapshot is
    // soft-deleted but the AT rows persist → double-counted in metrics). Delete them,
    // scoped to THIS date+scope+other-hash — a content hash legitimately recurs on other
    // dates (e.g. allday 4D04C4DC across 6/19–6/21), so never delete by hash alone.
    await sbDelete(`/adaptive_tracking?slate_date=eq.${date}&scope=eq.${encodeURIComponent(scope)}&slate_hash=neq.${hash}`);

    // adaptive_tracking — idempotent on (slate_hash, mode, slate_date) primary
    // rows. slate_date MUST be part of the key: snapshot_hash is content-based
    // (combos+scope+mode+horizons, excludes the date per ENG-04), so two dates
    // with an identical slate share a hash. Keying on hash alone made the second
    // date's AT write get skipped against the first date's rows — observed on
    // 6/20 allday (identical picks to 6/19 → 0 tracking rows, allday unscored).
    const existing = await dbGet<any[]>(`/adaptive_tracking?slate_hash=eq.${encodeURIComponent(hash)}&mode=eq.${MODE}&slate_date=eq.${date}&matched_state=is.null&select=id&limit=1`);
    if (Array.isArray(existing) && existing.length > 0) {
      console.log('     ↪ adaptive_tracking primary rows already exist for this hash+date, skipping');
    } else {
      await sbPost('/adaptive_tracking', atRows, 'return=minimal');
      wroteAtRows += atRows.length;
      console.log(`     ✅ wrote ${atRows.length} adaptive_tracking rows`);
    }
  }

  // ── Hit detection for the recovered date.
  if (apply && !noHitDetect && dayRows > 0) {
    console.log(`\n[backfill] triggering run-hit-detection for ${date}…`);
    try {
      const res = await invokeFunction('run-hit-detection', { date });
      console.log('[backfill] hit detection:', JSON.stringify(res));
    } catch (e) {
      console.warn('[backfill] hit-detection trigger failed (non-fatal — run it from the workflow):', String(e));
    }
  } else if (apply && !noHitDetect && dayRows === 0) {
    console.log(`\n[backfill] skipping hit detection — no ${date} draws to score yet. Re-run hit detection after importing them.`);
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  if (apply) {
    console.log(`  DONE — wrote ${wroteSnapshots} snapshot(s), ${wroteAtRows} adaptive_tracking row(s).`);
    console.log(`  daily_intelligence top-30 is the documented fast-follow (needs its own parity gate).`);
  } else {
    console.log(`  DRY-RUN complete. Re-run with --apply to write.`);
  }
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch(err => { console.error('[backfill] Fatal:', err); process.exit(1); });
