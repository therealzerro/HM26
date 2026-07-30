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
