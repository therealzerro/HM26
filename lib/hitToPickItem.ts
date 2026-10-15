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
  /** BUG-185 / ENG-AT-POSTED-01: the permutation actually posted on the slate
   *  (adaptive_tracking.posted_order = snapshot pick.bestOrder). `combo` is the
   *  engine enumeration index, never the posted order. */
  posted_order?: string | null;
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

const SESSION_LABELS: Record<string, string> = {
  morning: 'Morning',
  midday:  'Midday',
  evening: 'Evening',
  night:   'Night',
  allday:  'All Day',
};

/**
 * formatHitContext — "6/3 NC Midday" style metadata line for hit stamps.
 * Renders only the parts that exist; returns "" when nothing is available so
 * callers can no-op render.
 */
export function formatHitContext(p: {
  hitDate?: string;
  hitState?: string;
  hitSession?: string;
  snapshotScope?: string;
}): string {
  const parts: string[] = [];
  // M/D (no leading zero) parsed from YYYY-MM-DD
  if (p.hitDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p.hitDate);
    if (m) parts.push(`${Number(m[2])}/${Number(m[3])}`);
  }
  if (p.hitState) parts.push(p.hitState);
  const sess = (p.hitSession ?? p.snapshotScope ?? '').toLowerCase();
  if (sess) parts.push(SESSION_LABELS[sess] ?? (sess.charAt(0).toUpperCase() + sess.slice(1)));
  return parts.join(' ');
}

export function hitRowToPickItem(h: HitToPickInput): PickItem {
  const enumCombo = h.combo ?? '';
  // adaptive_tracking.combo is the engine's 000..999 ENUMERATION INDEX (BUG-155)
  // — it is NOT sorted (10/15 midday carried combo 871 for set {1,7,8}) and it
  // is never the order posted on the slate. For a STRAIGHT hit the posted order
  // equals the draw, so hit_result IS it (BUG-158). For a BOX hit use the
  // posted order (adaptive_tracking.posted_order since ENG-AT-POSTED-01, or a
  // snapshot-resolved value); the enumeration index is the fallback only.
  const orderedCombo = h.hit_straight && h.hit_result ? h.hit_result : (h.posted_order ?? enumCombo);
  return {
    rank: h.rank ?? 1,
    combo: orderedCombo,
    comboSet: h.combo_set ?? toComboSet(enumCombo),
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
    hitDate: h.slate_date ?? undefined,
    snapshotScope: h.scope ?? undefined,
  };
}
