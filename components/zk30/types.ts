// Shared types for ZK30 UI components. Mirrors the snapshot pick shape
// emitted by engines/zk30.ts + compute-slate-zk30 edge fn, plus the
// hit annotations added by run-hit-detection-zk30.

export interface ZK30PickItem {
  rank: number;
  combo: string;
  comboSet: string;
  bestOrder?: string;
  energy: number;          // 0–100 percentile
  temperature?: number;    // back-compat alias for energy
  multiplicity?: 'singles' | 'doubles' | 'triples';
  topPair?: string;
  signals: { BOX: number; PBURST: number; CO: number; DGC?: number };
  drawsSince?: number | null;
  timesDrawn?: number;
  dsRaw?: number;
  lastSeen?: string | null;
  // Hit annotations (written by run-hit-detection-zk30 after a match).
  // ARCH-08 Fireball Separation: hitType is NATURAL-only, fireballHitType is
  // FIREBALL-only. Both can be populated on a single pick (rare double-prize
  // case). hitSession/Date/Result/Fireball track NATURAL primary only —
  // fireball detail (session/result/digit) lives in adaptive_tracking_zk30
  // per-match rows and is fetched on demand by the detail modal.
  hitType?: 'straight' | 'box' | null;
  fireballHitType?: 'fireball_straight' | 'fireball_box' | null;
  hitSession?: 'Morning' | 'Day' | 'Evening' | 'Night' | string | null;
  hitDate?: string | null;
  hitResult?: string | null;        // 3-digit TX draw
  hitFireball?: string | null;      // 1-digit
}

export type ZK30Snapshot = {
  id: string;
  slate_date: string;
  jurisdiction: string;
  scope: string;
  mode: string;
  engine_version: string;
  snapshot_hash: string;
  updated_at_et: string;
  top_k_straights_json: ZK30PickItem[] | string | null;
  /** Client-side flag — set by useZK30Snapshot when today's slate is
   *  missing and yesterday's is shown. Not a real column. */
  _isStale?: boolean;
};

/** Tile / row border-color encoding — NATURAL primary only per ARCH-08.
 *  Fireball chrome is a separate sub-row, not part of the primary border. */
export function hitBorderColor(
  hitType: ZK30PickItem['hitType'] | undefined,
  fallback: string,
  colors: { success: string; gold: string },
): string {
  switch (hitType) {
    case 'straight':          return colors.gold;
    case 'box':               return colors.success;
    default:                  return fallback;
  }
}

export function hitTypeLabel(t: ZK30PickItem['hitType']): string {
  switch (t) {
    case 'straight': return 'STRAIGHT MATCH';
    case 'box':      return 'BOX MATCH';
    default:         return '';
  }
}

export function fireballHitTypeLabel(t: ZK30PickItem['fireballHitType']): string {
  switch (t) {
    case 'fireball_straight': return 'FIREBALL STRAIGHT';
    case 'fireball_box':      return 'FIREBALL BOX';
    default:                  return '';
  }
}

export function hitTypeGlyph(t: ZK30PickItem['hitType']): string {
  switch (t) {
    case 'straight': return '⭐';
    case 'box':      return '◆';
    default:         return '';
  }
}

/** Energy → 4-tier label + explicit ring color. Single source of truth for the
 *  ZK30 energy palette — both CompactTile's ring and PickCard's heat dot/text
 *  pull from here so the label and color stay synced. Hex colors are intentional
 *  (not theme tokens) because the band split is ZK30-specific and the deep-red
 *  "ON FIRE" hue doesn't exist in the global palette. */
export function energyTier(e: number): {
  label: 'ON FIRE' | 'HOT' | 'BUILDING' | 'COLD';
  color: string;
} {
  if (e >= 95) return { label: 'ON FIRE',  color: '#ff4444' };
  if (e >= 85) return { label: 'HOT',      color: '#ff8800' };
  if (e >= 70) return { label: 'BUILDING', color: '#ffaa00' };
  return         { label: 'COLD',     color: '#64748b' };
}
