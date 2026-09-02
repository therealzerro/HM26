// MKT-22 — intro identity chip copy, per reel kind.
//
// SEPARATE FROM THE RENDERER ON PURPOSE, and the reason is a bug that was
// caught by running it: `render-intro-chip.ts` is a CLI, so its argv parsing
// executes at module load. When the assembler did `import { CHIP_LABELS } from
// './render-intro-chip'`, that import RAN the CLI with the assembler's own
// argv, printed a usage error and exited before a single frame was assembled.
// Config in a `*-config.ts` and executables importing it is the shape every
// other lane here already uses (panel-config, stinger-config, endcard-config,
// carrier-config) — this is why.
//
// ⚠ PUBLIC KINDS TAKE "THE FULL BOARD", NEVER A SESSION WORD. The MKT-15 copy
// brief ruled session vocabulary BLOCKING for public surfaces — slots 6 and 7
// drop the scope tag and slot 8 replaces the stinger headline precisely so that
// ALL-DAY / MIDDAY / EVENING never reach a public cut. A chip is a new way to
// put that vocabulary back on screen, so it is bound by the same ruling and
// encoded here rather than left to the call site.

/** Accents match render-reel-stamp's PURPOSES, so the chip and the stamp on a
 *  given reel agree about what kind of reel it is. */
// MKT-31 item 4: verify's accent is GOLD — it must track the verify stamp
// (render-reel-stamp PURPOSES), which moved to #FBBF24 with the date ribbon.
const DROP = '#2bffcc', VERIFY = '#FBBF24';

/**
 * MKT-35 Phase 3 — the DATED identity chip. The chip carries a second line
 * ("THU · JUL 31" — gold, smaller, letter-spaced) so same-day saves are
 * distinguishable in a camera roll AT THE THUMBNAIL, which is frame one. The
 * assemblers render the chip at FULL OPACITY FROM FRAME ONE (no fade-in) for
 * exactly that reason — a chip that appears at 0.40s is invisible where the
 * operator needs it. Date comes from the assembler's provenance-asserted
 * `stamp` (verify's stamp is yesterday — the receipts' content date — by
 * design), NEVER from the render clock.
 *
 * ⚠ FUTURE AD KINDS ARE EXCLUDED BY DESIGN. An evergreen ad has no day for a
 * date to agree with — stamping one would manufacture the MKT-18 false-claim
 * class (a viewer reads the chip as "this is the board for that date"). Same
 * ruling as MKT-21's stamp suppression for generated bodies. Encoded here so
 * the ad lane inherits the exclusion when it exists, rather than each call
 * site remembering it.
 */
export const datedChipExcluded = (kind: string): boolean =>
  kind === 'ad' || kind.startsWith('ad_');

export const CHIP_LABELS: Record<string, { text: string; accent: string }> = {
  allday_pro:     { text: 'ALL-DAY',             accent: DROP },
  allday_free:    { text: 'ALL-DAY',             accent: DROP },
  midday_pro:     { text: 'MIDDAY',              accent: DROP },
  evening_pro:    { text: 'EVENING',             accent: DROP },
  // MKT-26 free session kinds. Same text as their pro siblings, exactly as
  // `allday_free` mirrors `allday_pro` — the chip names the SCOPE, and session
  // vocabulary is sanctioned at tier 2 (only PUBLIC must drop it, which is what
  // the three `*_public` rows below are for). Missing until 2026-07-29: the
  // assembler's `intro && CHIP_LABELS[kind]` guard yields null for an unlisted
  // kind, so the free cuts assembled with NO chip while their pro siblings
  // carried one — silently, since a null chip is also how a legacy build opts
  // out. A per-kind registry is only as complete as the last kind added to it.
  midday_free:    { text: 'MIDDAY',              accent: DROP },
  evening_free:   { text: 'EVENING',             accent: DROP },
  verify:         { text: "YESTERDAY'S RESULTS", accent: VERIFY },
  // MKT-40: deliberately NOT "YESTERDAY'S RESULTS" — that stays tier-2/4;
  // "results" reads gambling-adjacent to a cold viewer and a classifier, and
  // the chip is the first thing both see. RECORD is the analytics register.
  // Gold accent: the verify identity carries to its public half.
  verify_public:  { text: "YESTERDAY'S RECORD",  accent: VERIFY },
  allday_public:  { text: 'THE FULL BOARD',      accent: DROP },
  midday_public:  { text: 'THE FULL BOARD',      accent: DROP },
  evening_public: { text: 'THE FULL BOARD',      accent: DROP },
  // MKT-62: the same-day midday verify chips TODAY, not yesterday — the inverse
  // of verify's rule, and the reason it cannot inherit verify's chip. Plain
  // language at frame one (there is no stinger on this kind by ruling, so the
  // chip carries the whole identification job).
  // MKT-69: the DRAWS, graded across both morning boards — same string as the
  // ribbon (render-reel-stamp.ts).
  verify_midday:  { text: "TODAY'S MIDDAY DRAWS · GRADED", accent: VERIFY },
};
