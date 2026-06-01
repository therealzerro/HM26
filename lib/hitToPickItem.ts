/**
 * hitRowToPickItem — build a PickItem from an adaptive_tracking-derived hit
 * row so the same PickDetailModal can be opened from any hit surface (Results
 * screen, Verified Track Record, etc.).
 *
 * PickItem fields not present in adaptive_tracking (timesDrawn, drawsSince,
 * lastSeen, topPair, multiplicity) are left undefined; the modal already
 * renders them as "—" / derives from combo digits, so degradation is safe.
 *
 * `locked` is forced false: a hit is proof the user's slate worked, and the
 * hit was already publicly visible on the surface they tapped. Hiding it
 * behind a paywall inside the modal would be regressive.
 */

import type { PickItem } from '@/components/PickCard';

export interface HitToPickInput {
  combo: string;
  combo_set?: string | null;
  scope?: string | null;
  rank?: number | null;
  hit_state?: string | null;
  hit_session?: string | null;
  hit_box?: boolean | null;
  hit_straight?: boolean | null;
  hit_result?: string | null;
  signal_box?: number | null;
  signal_pburst?: number | null;
  signal_co?: number | null;
  signal_dgc?: number | null;
  energy?: number | null;
  slate_date?: string | null;
}

function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

export function hitRowToPickItem(h: HitToPickInput): PickItem {
  const sortedCombo = h.combo ?? '';
  // adaptive_tracking.combo is the sorted-canonical comboSet key (per BUG-155),
  // not the order actually predicted. For a STRAIGHT hit, the engine's
  // bestOrder matched the draw exactly, so hit_result IS that bestOrder.
  // Surfacing the sorted key here would render "019 → 910" on a straight match.
  const orderedCombo = h.hit_straight && h.hit_result ? h.hit_result : sortedCombo;
  return {
    rank: h.rank ?? 1,
    combo: orderedCombo,
    comboSet: h.combo_set ?? toComboSet(sortedCombo),
    bestOrder: orderedCombo,
    energy: typeof h.energy === 'number' ? Math.round(h.energy) : 0,
    signals: {
      BOX:    typeof h.signal_box    === 'number' ? h.signal_box    : 0,
      PBURST: typeof h.signal_pburst === 'number' ? h.signal_pburst : 0,
      CO:     typeof h.signal_co     === 'number' ? h.signal_co     : 0,
      DGC:    typeof h.signal_dgc    === 'number' ? h.signal_dgc    : 0,
    },
    locked: false,
    hitType: h.hit_straight ? 'straight' : (h.hit_box ? 'box' : undefined),
    hitState: h.hit_state ?? undefined,
    hitSession: h.hit_session ?? undefined,
    hitResult: h.hit_result ?? undefined,
    snapshotScope: h.scope ?? undefined,
  };
}
