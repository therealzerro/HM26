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
const DROP = '#2bffcc', VERIFY = '#34c759';

export const CHIP_LABELS: Record<string, { text: string; accent: string }> = {
  allday_pro:     { text: 'ALL-DAY',             accent: DROP },
  allday_free:    { text: 'ALL-DAY',             accent: DROP },
  midday_pro:     { text: 'MIDDAY',              accent: DROP },
  evening_pro:    { text: 'EVENING',             accent: DROP },
  verify:         { text: "YESTERDAY'S RESULTS", accent: VERIFY },
  allday_public:  { text: 'THE FULL BOARD',      accent: DROP },
  midday_public:  { text: 'THE FULL BOARD',      accent: DROP },
  evening_public: { text: 'THE FULL BOARD',      accent: DROP },
};
