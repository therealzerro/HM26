// MKT-90 (2026-10-16, operator: "the pro reels need to explicitly represent
// that they can only be seen daily by being a member of the facebook pro
// group … some days i do post pro midday and evening boards in the free group.
// so i want the pro boards/reels to creatively distinguish this"; narrowed the
// same evening: "i dont want more reels, just the midday and evening reels and
// coffee mode to explicitly state that it is the Pro boards with branding") —
//
//                         THE PRO ROOM SEAL
//
// One device, one colour, two kinds. VIOLET is new in the fleet and belongs
// to the Pro room alone: cyan is the drop, gold is a DRAWN straight, ember is
// the triple — a viewer learns the fourth colour the way they learned the
// other three. The seal rides the two boards that are the Pro room's alone —
// midday_pro and evening_pro. allday_pro is NOT sealed: its body is the very
// file allday_free posts in full (SOCIAL-13), so branding it "Pro board"
// would be false.
//
// Four surfaces, all on the existing cut (no new kind, no new command):
//   · coffee-mode body (the capture itself): a violet brand line on the
//     notation strip — "HITMASTER ZK6 PRO · MEMBERS' BOARD" — on the FULL
//     session capture only (scripts/reel-notation.ts; never on a redacted or
//     public capture, where the strip does not exist)
//   · intro chip (frame one = the thumbnail): PRO ROOM · MIDDAY, violet
//   · stinger headline: MIDDAY · MEMBERS' BOARD
//   · body stamp, whole body: PRO ROOM ONLY · EVERY MORNING, violet
//   · caption, last line: the room's line below
// Wherever the file lands — the Pro room, or the free room on a day the
// operator loans it — the pixels say whose board it is and where it lives
// daily. In the Pro room it is identity, not a sale: no price, no upgrade
// word, no first-access phrase (tier-4 lint, MKT-82 F4, fail-closed on the
// stamp and in the unit test).
//
// Live from PRO_ROOM_FROM (recorded switch date, not a scheduler — OPS-01,
// the MKT-75/80 pattern). Before it `--pro-seal` = PREVIEW build (suffixed,
// never published); after it `--classic-pro` = escape hatch for the stamp.
import { lintCaption } from '../lib/social/brandLint';

export const PRO_ROOM_FROM = '20261017';
export const VIOLET = '#c084fc';
/** The two kinds the seal applies to. */
export const SEALED_KINDS: readonly string[] = ['midday_pro', 'evening_pro'];
export const isSealedKind = (kind: string): boolean => SEALED_KINDS.includes(kind);

/** Body stamp eyebrow on every sealed Pro cut (tier 4 — never commercial). */
export const PRO_ROOM_STAMP_EYEBROW = 'PRO ROOM ONLY · EVERY MORNING';
/** Brand line on the coffee-mode notation strip (tier 4). */
export const PRO_BOARD_BRAND_LINE = "HITMASTER ZK6 PRO · MEMBERS' BOARD";
/** Trailing line on every sealed Pro caption (tier 4). */
export const PRO_ROOM_CAPTION_LINE = "Members' board. It's posted in the Pro room every morning, and only there.";

/** Fail-closed lint for the seal strings at tier 4. Called by the stamp
 *  renderer, the body renderer and reel:check; a string that cannot pass does
 *  not render (the MKT-80 rule). */
export function lintProRoomStrings(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const check = (s: string, label: string) => {
    const bad = lintCaption(s, 4).violations.filter(v => v.blocking);
    if (bad.length) problems.push(`${label} (tier 4): ${bad.map(v => `${v.term} [${v.rule}]`).join(', ')}`);
    if (/\d{3}/.test(s)) problems.push(`${label}: carries a 3-digit run`);
  };
  check(PRO_ROOM_STAMP_EYEBROW, 'seal eyebrow');
  check(PRO_BOARD_BRAND_LINE, 'coffee-mode brand line');
  check(PRO_ROOM_CAPTION_LINE, 'Pro caption line');
  return { ok: problems.length === 0, problems };
}
