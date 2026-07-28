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
    lines: ['HITMASTER ZK6', "YESTERDAY'S RECEIPTS", 'VERIFIED FROM PUBLISHED RESULTS'],
    out: 'verif_endcard.mp4',
  },
  // Phase 2 — session wave. Same pro motion file, zero new generations.
  midday_pro: {
    motion: 'endcard_motion_pro.mp4',
    lines: ['HITMASTER ZK6', 'FIRST ACCESS. ALWAYS.', 'VERIFIED TOMORROW MORNING'],
    out: 'midday_pro_endcard.mp4',
  },
  evening_pro: {
    motion: 'endcard_motion_pro.mp4',
    lines: ['HITMASTER ZK6', 'FIRST ACCESS. ALWAYS.', 'VERIFIED TOMORROW MORNING'],
    out: 'evening_pro_endcard.mp4',
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
