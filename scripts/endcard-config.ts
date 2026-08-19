// MKT-10 — endcard variant registry.
//
// An endcard = a text-free MOTION file (generated, 720x1280, audio embedded)
// + three lines of copy rendered natively at 1080x1920 and composited over it.
// Copy therefore stops being an asset: a new variant is an entry here, not a
// regeneration. The Midday/Evening session wave reuses endcard_motion_pro.mp4
// verbatim — same motion, different line 2/3.
//
// Layout is deliberately NOT per-variant: position, type and fade timing are
// brand-fixed, and only the words change.

export interface EndcardVariant {
  /** Text-free motion file in assets/marketing/. */
  motion: string;
  /** Line 1 is always the wordmark; 2 and 3 are the variant's promise. */
  lines: [string, string, string];
  /** Output filename — what the assemblers already read. */
  out: string;
  /** MKT-31 — hex colour for line 3 (verify: gold #FBBF24, the results-desk
   *  accent). Unset = the standard white at .86 opacity. */
  line3Accent?: string;
  /** MKT-31 addendum 2 — per-variant lockup top, OVERRIDING the shared
   *  LOCKUP_TOP band by operator ruling. Verify: 880 — tucked under the
   *  deepest settled bolt across the pro rotation (alt's vault rings reach
   *  y≈827; std 760, lattice 751, steady 604), measured clean on all four
   *  motions from 5.2s (text-opaque) to the 6.5s cut: zone 880-1040 carries
   *  ≤1.3% pixels above L40, max L77 (alt's soft ring glow). Slate kinds
   *  stay on the shared band — it exists so rotating text lands on clean
   *  background WITHOUT per-motion measurement; an override buys its
   *  placement with exactly that measurement, per motion, at build time. */
  lockupTop?: number;
}

export const ENDCARDS: Record<string, EndcardVariant> = {
  allday_pro: {
    motion: 'endcard_motion_pro.mp4',
    lines: ['HITMASTER ZK6', 'FIRST ACCESS. ALWAYS.', 'VERIFIED TOMORROW MORNING'],
    out: 'allday_pro_endcard.mp4',
  },
  allday_free: {
    motion: 'endcard_motion_free.mp4',
    lines: ['HITMASTER ZK6', "TODAY'S FULL DROP — FREE", 'VERIFIED TOMORROW MORNING'],
    out: 'allday_free_endcard.mp4',
  },
  // Verify reuses the pro motion too. Its close is the endcard's FINAL 2.5s, so
  // the lockup must be opaque by (duration − 2.5s) — at 5.2s it clears a 10s
  // motion by 2.3s. Verify never touches endcard AUDIO (its soundtrack is
  // verif_carrier), so the crack/bed contract does not apply to it at all.
  verify: {
    motion: 'endcard_motion_pro.mp4',
    lines: ['HITMASTER ZK6', 'THE RECORD, DRAW BY DRAW', 'CHECK OUR WORK'],
    out: 'verif_endcard.mp4',
    // MKT-31 item 4 — verify-only gold accent on the CTA line.
    line3Accent: '#FBBF24',
    // MKT-41 (2026-07-31): the addendum-2 `lockupTop: 880` tuck is WITHDRAWN
    // on operator report — verify's close read wrong against the fleet. 880
    // was measured against ONE motion's settled bolt, but the endcard ROTATES:
    // across the pro set the bolt bottoms at 604-827, so a fixed tuck lands
    // 130-280px from the mark depending on the day, while every other kind
    // sits at the shared band. Today's cut (alt / vault rings) put the text
    // ~350px above the slate reels' and left the lower half of frame empty.
    // Back on the shared band, which is motion-independent by construction —
    // the property the override spent. verify_public was already 1240, so all
    // nine kinds now close identically.
  },
  // Phase 2 — session wave. Same pro motion file, zero new generations.
  midday_pro: {
    motion: 'endcard_motion_pro.mp4',
    lines: ['HITMASTER ZK6', 'AHEAD OF THE MIDDAY DRAW', 'RECEIPTS IN THE MORNING'],
    out: 'midday_pro_endcard.mp4',
  },
  evening_pro: {
    motion: 'endcard_motion_pro.mp4',
    lines: ['HITMASTER ZK6', 'AHEAD OF THE EVENING DRAW', 'RECEIPTS AT SUNUP'],
    out: 'evening_pro_endcard.mp4',
  },

  // ── MKT-26 — free-group session kinds. COPY SIGNED OFF 2026-07-29. ───────
  //
  // The conversion frame these carry (MKT-13 ruling): the free group sees the
  // BOARD and not the digits, and the digits are what Pro buys. So the close has
  // to name the withholding rather than hide it — a redacted reel that does not
  // say why it is redacted reads as broken, not as a teaser.
  //
  // ⚠ "DIGITS", NOT "NUMBERS", and the correction is load-bearing. The
  // provisional line was `THE BOARD, NOT THE NUMBERS`, which §5 bars: the
  // product noun is signals, always, so *numbers* cannot be used as one. It
  // would have failed the lint sitting next to it. `DIGITS` is the system's own
  // term for the withheld values — same word the captions use.
  //
  // Pricing on the endcard is sanctioned because the free group is tier 2, the
  // only surface where brandLint §6 permits it (public/cross-post and Pro are
  // all barred). These endcards must never be reused on another tier.
  midday_free: {
    motion: 'endcard_motion_free.mp4',
    out: 'midday_free_endcard.mp4',
    lines: ['HITMASTER ZK6', 'DIGITS COVERED HERE', 'FULL SIX IN PRO · $2.49/MO'],
  },
  evening_free: {
    motion: 'endcard_motion_free.mp4',
    out: 'evening_free_endcard.mp4',
    lines: ['HITMASTER ZK6', 'DIGITS COVERED HERE', 'FULL SIX IN PRO · $2.49/MO'],
  },

  // ── MKT-16 — the public kind. FREE-TIER MOTION SET (tierFor ruling in
  // brand-motion.ts: public kinds are free-tier — a pro motion on a public
  // close would carry first-access grammar to strangers). Copy is tier-1
  // discipline, the opposite constraint from the free session cards: NO
  // pricing (brandLint §6 bars it outside tier 2), no session word, no Pro
  // language — the close is the community funnel and nothing else. This
  // endcard must never be reused on a group tier; it undersells them.
  allday_public: {
    motion: 'endcard_motion_free.mp4',
    out: 'allday_public_endcard.mp4',
    lines: ['HITMASTER ZK6', 'THE FULL BOARD IS FREE', 'JOIN THE COMMUNITY'],
  },

  // ── MKT-40 — verify_public: the grading half of the public pair. FREE-TIER
  // motion set (tierFor: public kinds are free-tier). Copy delivered
  // 2026-07-31 (docs/verify_public_copy_delivery_2026-07-31.md), tier-1
  // lint-clean. Line 3 keeps verify's gold — the identity accent, not
  // vocabulary. ⚠ NO lockupTop override: verify's 880 tuck was MEASURED on
  // the PRO motions; the free set FAILS that zone (10% px >L40, max L255 at
  // 5.2-6.4s — measured 2026-07-31 per the addendum-2 standing rule), so
  // verify_public stays on the shared band, which guarantees clean
  // background without per-motion measurement.
  verify_public: {
    motion: 'endcard_motion_free.mp4',
    out: 'verify_public_endcard.mp4',
    lines: ['HITMASTER ZK6', 'PUBLISHED FIRST. CHECKED AFTER.', 'SEE THE FULL RECORD FREE'],
    line3Accent: '#FBBF24',
  },

  // ── MKT-62 — verify_midday: the SAME-DAY MIDDAY VERIFY. FREE-GROUP ONLY
  // (tier 2) by ruling, which is what makes the pricing line legal here and
  // nowhere above it. Line 2 is the argument (true only because of the
  // timestamp pair in the body), line 3 is the ask. Motion is PINNED
  // (FIXED_ENDCARD_MOTION in brand-motion.ts) — never a tier pool. Gold
  // accent: the verify identity carries to the same-day cut.
  verify_midday: {
    motion: 'endcard_motion_sameday.mp4',
    out: 'verify_midday_endcard.mp4',
    lines: ['HITMASTER ZK6', 'POSTED THIS MORNING · GRADED THIS AFTERNOON', 'ZK PRO READS EVERY BOARD FIRST · $2.49/MO'],
    line3Accent: '#FBBF24',
  },
};

// ── Brand-fixed layout ──────────────────────────────────────────────────────
// The text block must sit inside the 1:1 centre crop (crop=1080:1080:0:420
// keeps y 420-1500). The previously BAKED endcards placed line 3 at y~1500-1540
// and the square cutdown sliced it through the letterforms — the defect this
// lane fixes by construction. LOCKUP_TOP + block height stays well clear of
// 1500, and the motion spec reserves y 1152-1498 (60-78% of frame height).
export const LOCKUP_TOP = 1240;
export const CROP_SAFE_BOTTOM = 1500;

/**
 * MKT-44 — PER-MOTION endcard lockup top. Same shape as the stinger's
 * MOTION_LOCKUP (MKT-42) and shipped for the same reason: a single constant
 * measured against one motion cannot be right for a ROTATING set.
 *
 * ⚠ KEYED BY MOTION **FILE**, NOT TAG — deliberately different from the stinger
 * map. Stinger tags are globally unique (one shared set); endcard tags REPEAT
 * across tiers, so `std` is `endcard_motion_pro.mp4` for a pro kind and
 * `endcard_motion_free.mp4` for a free one. Keying by tag would silently apply a
 * pro measurement to a free motion.
 *
 * MEASURED across the text's whole opaque window (5.2s → the 6.5s cut), content
 * bottom vs the shared 1240 — every PRO motion stranded, every FREE motion did
 * not, which is exactly the split the operator reported (evening_pro, midday_pro
 * and verify are three of the four `ENDCARD_KINDS.pro` entries):
 *
 *   PRO   steady  y613 → strand 627px      FREE  free      y966 → 274px  ok
 *         lattice y760 → strand 480px            free_alt  y1000 → 240px ok
 *         std     y770 → strand 470px
 *         alt     y824 → strand 416px
 *
 * Tuck values are content-bottom + ~90px, and each candidate block was measured
 * dark through the same window (worst 1.6% above L40, means L9.6-23.5).
 *
 * ⚠ THIS SUPERSEDES MKT-41's WITHDRAWAL OF VERIFY'S 880 TUCK. That withdrawal
 * was right that a FIXED tuck drifts across a rotating set (130-280px), but it
 * moved verify onto the shared 1240 — a 416-627px strand — making verify
 * consistently broken with the fleet rather than fixing the fleet. Per-motion
 * placement is what the 880 ruling was reaching for; this delivers it.
 *
 * ⚠ A NEW PRO ENDCARD MOTION MUST BE MEASURED AND ADDED HERE. Falling through to
 * 1240 is the defect, not a safe default.
 */
export const ENDCARD_MOTION_LOCKUP: Record<string, number> = {
  // ⛔ EMPTIED 2026-08-01 ON OPERATOR REVIEW — every kind is back on the shared
  // 1240 band. The tucked values (pro 860 · pro_alt 910 · pro_steady 700 ·
  // pro_lattice 850) shipped for roughly an hour and were REJECTED on sight.
  //
  // WHY THEY WERE WRONG, because the measurements were not: the mark really
  // does settle at y613-824 and the text really was 416-627px below it. But
  // "distance from the mark" is the wrong quantity. Driving it to zero pulls
  // the whole mark+text group into the upper ~55% of frame and leaves ~890px of
  // dead space beneath — which is EXACTLY the defect MKT-41 named when it
  // withdrew verify's 880 tuck ("left the lower half of frame empty"). MKT-41
  // was right; MKT-44 overrode it and reproduced the defect it had fixed.
  //
  // The real constraint: the mark is baked into a generated motion and cannot
  // move, so text placement trades "near the mark" against "balanced in frame".
  // The operator's ruling is that FRAME BALANCE WINS and the space between mark
  // and text is the motion's own negative space, not a defect.
  //
  // ⚠ DO NOT RE-ADD ENTRIES FROM A GAP MEASUREMENT ALONE. The mechanism is kept
  // because it is sound — a per-motion override keyed by FILE — but a value
  // belongs here only for a motion whose composition genuinely needs it, judged
  // on the whole frame, not on the gap.
};

/**
 * Lockup fade-in. The All-Day outro is the endcard's FIRST 6.5s, so a 2.0s fade
 * from 4.5s reached full opacity on the reel's LAST FRAME and was never held —
 * the brand card resolved exactly as the reel ended. 0.7s puts it fully opaque
 * at 5.2s, leaving ~1.3s of settled lockup on screen. (Operator caught this
 * before any motion file was generated; motion is cut to keep the text band
 * clear from 4.5s onward.)
 */
export const TEXT_FADE_IN = 4.5;
export const TEXT_FADE_DUR = 0.7;   // fully opaque by 5.2s, held to 6.5s

export const OUT_W = 1080, OUT_H = 1920;
