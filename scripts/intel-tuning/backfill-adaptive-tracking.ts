#!/usr/bin/env tsx
/**
 * backfill-adaptive-tracking.ts — Seed adaptive_tracking primary rows from
 * past N days of slate_snapshots so the Calibration Dashboard has a real
 * dataset to compute AUC/calibration against, without waiting for daily
 * accumulation.
 *
 * Writes one row per K6 pick per snapshot: signals + energy + quartile
 * flags + dominant_signal. If the pick has a hitType annotation, also
 * fills the outcome columns (hit_box, hit_straight, actual_result,
 * matched_state, matched_session). Otherwise outcome columns stay NULL
 * and represent "evaluated miss" — the critical complement to hit rows
 * that previously made the table AUC-incomplete.
 *
 * Idempotent: skips rows that already exist for the same
 * (slate_hash, rank, combo, mode). Safe to re-run.
 *
 * Usage:
 *   npm run backfill:adaptive-tracking            # default: last 30 days
 *   npm run backfill:adaptive-tracking -- --days 60
 *   npm run backfill:adaptive-tracking -- --dry-run
 */

import { dbGet } from '../backtest/data.js';

const URL = process.env.SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !SVC) { console.error('Missing .env.backtest creds'); process.exit(1); }

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

function q75(vals: number[]): number {
  if (vals.length === 0) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.75);
  return idx < sorted.length ? sorted[idx] : sorted[sorted.length - 1];
}

function dominantOf(box: number, pburst: number, co: number, dgc: number): string {
  if (box >= pburst && box >= co && box >= dgc) return 'BOX';
  if (pburst >= co && pburst >= dgc) return 'PBURST';
  if (co >= dgc) return 'CO';
  return 'DGC';
}

async function fetchExisting(slateHash: string, rank: number, combo: string, mode: string): Promise<boolean> {
  const enc = encodeURIComponent;
  const rows = await dbGet<any[]>(
    `/adaptive_tracking?slate_hash=eq.${enc(slateHash)}&rank=eq.${rank}&combo=eq.${enc(combo)}&mode=eq.${enc(mode)}&select=id&limit=1`,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function insertRow(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${URL}/rest/v1/adaptive_tracking`, {
    method: 'POST',
    headers: {
      'apikey': SVC,
      'Authorization': `Bearer ${SVC}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args['dry-run'] === 'true';
  const days = parseInt(args.days ?? '30', 10);
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z');
  const since = new Date(today.getTime() - days * 86400000).toISOString().split('T')[0];

  console.log(`\nbackfill-adaptive-tracking — window: ${since} → today  (${days}d)`);
  console.log(`mode: ${dryRun ? 'DRY RUN' : 'APPLY'}\n`);

  // Verify dominant_signal column exists
  try {
    await dbGet<any[]>(`/adaptive_tracking?select=dominant_signal&limit=1`);
  } catch (e) {
    console.error('Migration check failed. Apply 2026-05-13_adaptive_tracking_dominant_signal.sql first.');
    console.error(String(e));
    process.exit(1);
  }

  const snaps = await dbGet<any[]>(
    `/slate_snapshots?slate_date=gte.${since}&deleted_at=is.null&select=id,scope,slate_date,hash,top_k_straights_json,horizons_present_json&order=slate_date.desc&limit=500`,
  );
  console.log(`${Array.isArray(snaps) ? snaps.length : 0} active snapshots`);

  let seeded = 0, skipped = 0, withOutcome = 0;
  for (const s of (snaps ?? [])) {
    const scope = s.scope;
    const slateHash = s.hash ?? s.id;
    const mode = (s.horizons_present_json ?? {})._mode ?? 'balanced';
    const picks = s.top_k_straights_json ?? [];
    if (!Array.isArray(picks) || picks.length === 0) continue;

    const sig = (p: any, k: 'BOX'|'PBURST'|'CO'|'DGC'): number => {
      const lower = k.toLowerCase();
      return p[lower] ?? p.signals?.[k] ?? 0;
    };
    const boxQ = q75(picks.map((p: any) => sig(p, 'BOX')));
    const pburstQ = q75(picks.map((p: any) => sig(p, 'PBURST')));
    const coQ = q75(picks.map((p: any) => sig(p, 'CO')));
    const dgcQ = q75(picks.map((p: any) => sig(p, 'DGC')));

    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const combo = p.combo;
      if (!combo) continue;
      const rank = p.rank ?? i + 1;
      const exists = await fetchExisting(slateHash, rank, combo, mode);
      if (exists) { skipped++; continue; }

      const bs = sig(p, 'BOX'), ps = sig(p, 'PBURST'), cs = sig(p, 'CO'), ds = sig(p, 'DGC');
      const row: Record<string, unknown> = {
        slate_date: s.slate_date,
        scope, slate_hash: slateHash, rank, combo,
        combo_set: p.comboSet ?? `{${[...combo].sort().join(',')}}`,
        signal_box: bs, signal_pburst: ps, signal_co: cs, signal_dgc: ds,
        energy_score: p.energy ?? p.temperature ?? 0,
        mode,
        box_top_quartile: bs >= boxQ,
        pburst_top_quartile: ps >= pburstQ,
        co_top_quartile: cs >= coQ,
        burst_top_quartile: ps >= pburstQ,
        dominant_signal: dominantOf(bs, ps, cs, ds),
      };
      if (p.hitType) {
        row.hit_box = true;
        row.hit_straight = p.hitType === 'straight';
        row.actual_result = p.hitResult ?? '';
        row.actual_set = `{${[...(p.hitResult ?? '')].sort().join(',')}}`;
        row.matched_state = p.hitState ?? '';
        row.matched_session = p.hitSession ?? '';
        row.result_at = `${s.slate_date}T20:00:00Z`;
        withOutcome++;
      }

      if (dryRun) {
        seeded++;
      } else {
        const ok = await insertRow(row);
        if (ok) seeded++;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  seeded:        ${seeded}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`    of which hit-annotated: ${withOutcome}`);
  console.log(`  skipped (existing): ${skipped}`);
  if (dryRun) console.log(`\nRe-run without --dry-run to apply.`);
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
