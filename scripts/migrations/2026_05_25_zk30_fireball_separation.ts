#!/usr/bin/env tsx
/**
 * 2026_05_25_zk30_fireball_separation.ts
 *
 * One-shot migration for ARCH-08 (ZK30 Fireball Separation Principle).
 *
 * Pre-ARCH-08 behavior: run-hit-detection-zk30 collapsed fireball matches
 * into pick.hitType when no natural hit fired. This script:
 *
 *   1. Walks every active slate_snapshots_zk30 row. For each pick whose
 *      hitType is 'fireball_straight' or 'fireball_box', moves the value
 *      to fireballHitType and nulls hitType. Every pick gets fireballHitType
 *      set to either the moved value or null (schema consistency).
 *
 *   2. Cleans daily_intelligence_zk30 rows where hit_state/session/result/
 *      fireball were populated from a fireball-primary match (i.e. natural
 *      flags both false). ARCH-08 contract: those columns are NATURAL only;
 *      so nulls them out. Fireball flag columns + AT detail rows remain.
 *
 * Idempotent: re-runs find no work because (a) snapshot picks already have
 * fireballHitType set after the first pass, and (b) DI rows already cleaned
 * pass the same filter as 0-row.
 *
 * Auth: .env.backtest (service-role REST). Same pattern as other scripts/.
 *
 * Run:
 *   npx tsx scripts/migrations/2026_05_25_zk30_fireball_separation.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.backtest' });

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SVC_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.backtest');
  process.exit(1);
}

const svcHeaders = (extra: Record<string, string> = {}) => ({
  'apikey':        SVC_KEY!,
  'Authorization': 'Bearer ' + SVC_KEY!,
  'Content-Type':  'application/json',
  ...extra,
});

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

async function sbPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'PATCH',
    headers: svcHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

interface SnapshotRow {
  id: string;
  slate_date: string;
  top_k_straights_json: any[] | string | null;
}

// daily_intelligence_zk30 has no hit_state column (single-jurisdiction
// table). Per-match detail lives in matched_session/result/fireball.
interface DIRow {
  id: string;
  matched_session: string | null;
  matched_result: string | null;
  matched_fireball: string | null;
}

async function main() {
  console.log('[zk30-fireball-separation] starting migration…\n');

  // ── 1. Snapshot picks: move fireball hitType → fireballHitType ─────────
  const snapshots = await sbGet<SnapshotRow[]>(
    '/rest/v1/slate_snapshots_zk30?deleted_at=is.null&select=id,slate_date,top_k_straights_json&limit=1000',
  );

  let snapshotsTouched = 0;
  let picksMoved = 0;
  let picksTagged = 0; // got a fresh fireballHitType=null

  for (const snap of snapshots ?? []) {
    let picks: any[] = [];
    try {
      picks = typeof snap.top_k_straights_json === 'string'
        ? JSON.parse(snap.top_k_straights_json)
        : (snap.top_k_straights_json ?? []);
    } catch { continue; }
    if (!Array.isArray(picks) || picks.length === 0) continue;

    let changed = false;
    for (const pick of picks) {
      // Skip picks already migrated — fireballHitType key present means a
      // prior run touched this snapshot.
      if ('fireballHitType' in pick) continue;

      if (pick.hitType === 'fireball_straight' || pick.hitType === 'fireball_box') {
        pick.fireballHitType = pick.hitType;
        pick.hitType = null;
        // Wipe the detail fields populated from the fireball-primary match
        // — ARCH-08 reserves these for natural primary. Detail still lives
        // in the AT row; UI will re-fetch from there.
        pick.hitSession = null;
        pick.hitDate = null;
        pick.hitResult = null;
        pick.hitFireball = null;
        picksMoved++;
        changed = true;
      } else {
        // Always add the fireballHitType field for schema consistency.
        // Down-stream renderers branch on null vs string, so a missing key
        // is a foot-gun the migration cleanly avoids.
        pick.fireballHitType = null;
        picksTagged++;
        changed = true;
      }
    }

    if (changed) {
      await sbPatch(
        `/rest/v1/slate_snapshots_zk30?id=eq.${snap.id}`,
        { top_k_straights_json: picks },
      );
      snapshotsTouched++;
    }
  }

  // ── 2. DI rows: null out matched_* where natural flags are both false
  // but those columns were set (i.e. fireball-primary leaked in pre-ARCH-08).
  const diRows = await sbGet<DIRow[]>(
    '/rest/v1/daily_intelligence_zk30?hit_straight=eq.false&hit_box=eq.false' +
    '&matched_session=not.is.null&select=id,matched_session,matched_result,matched_fireball&limit=1000',
  );

  let diRowsCleaned = 0;
  for (const row of diRows ?? []) {
    await sbPatch(
      `/rest/v1/daily_intelligence_zk30?id=eq.${row.id}`,
      {
        matched_session: null,
        matched_result: null,
        matched_fireball: null,
      },
    );
    diRowsCleaned++;
  }

  console.log('Migration complete:');
  console.log(`  Snapshots touched:    ${snapshotsTouched}`);
  console.log(`  Picks moved (fb):     ${picksMoved}`);
  console.log(`  Picks tagged (null):  ${picksTagged}`);
  console.log(`  DI rows cleaned:      ${diRowsCleaned}`);
  console.log('\nRe-run safety: idempotent. Re-runs find no work.');
}

main().catch(e => {
  console.error('[zk30-fireball-separation] FAILED:', e);
  process.exit(1);
});
