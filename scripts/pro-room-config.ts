// MKT-90 (2026-10-16, operator: "the pro reels need to explicitly represent
// that they can only be seen daily by being a member of the facebook pro
// group … some days i do post pro midday and evening boards in the free group.
// so i want the pro boards/reels to creatively distinguish this") —
//
//                 THE PRO ROOM SEAL  ·  THE GUEST PASS
//
// Two devices, one colour. VIOLET is new in the fleet and belongs to the Pro
// room alone: cyan is the drop, gold is a DRAWN straight, ember is the triple
// — a viewer learns the fourth colour the way they learned the other three.
//
// (1) THE SEAL — every Pro cut (allday_pro, midday_pro, evening_pro) carries
//     the room's mark on all three furniture surfaces a scroller actually
//     reads: the intro CHIP (frame one = the thumbnail) says PRO ROOM, the
//     stinger says MEMBERS' BOARD, and the body STAMP rides the whole board
//     and modal segment reading "PRO ROOM ONLY · EVERY MORNING". Wherever the
//     file lands — the Pro room, or the free room on a day the operator loans
//     it — the pixels say whose board it is and where it lives daily. In the
//     Pro room it is identity, not a sale: no price, no upgrade word, no
//     first-access phrase (tier-4 lint, MKT-82 F4, fail-closed on the stamp).
// (2) THE GUEST PASS — the on-demand cut for the loan days
//     (`npm run reel:guest -- --scope=midday|evening`): the SAME full body and
//     the Pro cut's own intro, stinger and voice, but a GUEST PASS stamp, a
//     guest-pass chip, a free-tier close that names the price, and a tier-2
//     caption whose line one is the Pro-group link. It registers as its own
//     kind (midday_guest / evening_guest, audience free) so the Pro row's
//     tier-4 caption is never pasted into the free room by habit. Never in
//     reel:daily; allday has no guest (allday_free already IS the full board,
//     SOCIAL-13).
//
// Live from PRO_ROOM_FROM (recorded switch date, not a scheduler — OPS-01,
// the MKT-75/80 pattern). Before it `--pro-seal` = PREVIEW build (suffixed,
// never published); after it `--classic-pro` = escape hatch. The guest cut
// is not date-gated: it exists only when the operator runs it.
import { lintCaption } from '../lib/social/brandLint';

export const PRO_ROOM_FROM = '20261017';
export const VIOLET = '#c084fc';

/** Body stamp eyebrow on every sealed Pro cut (tier 4 — never commercial). */
export const PRO_ROOM_STAMP_EYEBROW = 'PRO ROOM ONLY · EVERY MORNING';
/** Body stamp eyebrow on the guest cut (tier 2 — the free room). */
export const GUEST_STAMP_EYEBROW = 'GUEST PASS · PRO BOARD · TODAY ONLY';
/** Trailing line on every Pro caption (tier 4). */
export const PRO_ROOM_CAPTION_LINE = "Members' board. It's posted in the Pro room every morning, and only there.";

export const GUEST_KINDS: readonly string[] = ['midday_guest', 'evening_guest'];
export const isGuestKind = (kind: string): boolean => GUEST_KINDS.includes(kind);
/** The guest cut borrows the Pro cut's rotating furniture (intro, stinger,
 *  carrier) — it IS the Pro cut on loan, and the viewer should hear and see
 *  that. Stamp, chip, endcard and caption are the guest's own. */
export const guestFurnitureKind = (kind: string): string => kind.replace(/_guest$/, '_pro');

/** Fail-closed lint for the two eyebrows and the caption line, at their tiers.
 *  Called by the stamp renderer and reel:check; a string that cannot pass does
 *  not render (the MKT-80 rule). */
export function lintProRoomStrings(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const check = (s: string, tier: 1 | 2 | 3 | 4, label: string) => {
    const bad = lintCaption(s, tier).violations.filter(v => v.blocking);
    if (bad.length) problems.push(`${label} (tier ${tier}): ${bad.map(v => `${v.term} [${v.rule}]`).join(', ')}`);
    if (/\d{3}/.test(s)) problems.push(`${label}: carries a 3-digit run`);
  };
  check(PRO_ROOM_STAMP_EYEBROW, 4, 'seal eyebrow');
  check(GUEST_STAMP_EYEBROW, 2, 'guest eyebrow');
  check(PRO_ROOM_CAPTION_LINE, 4, 'Pro caption line');
  return { ok: problems.length === 0, problems };
}
