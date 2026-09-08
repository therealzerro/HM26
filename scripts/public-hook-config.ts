// MKT-66 — public cold-open timing, shared by the hook renderer and the
// assembler. Kept in its own module so the assembler can import the numbers
// without executing render-public-hook.ts's CLI body.
export const HOOK_DUR = 2.0;        // card on screen (seconds) before the board dissolve begins
export const HOOK_DISSOLVE = 0.4;   // card → board first frame

// MKT-75 (2026-09-08, content agent ruling) — verify_public COLD OPEN, HELD.
// Built during the 9/9→9/23 bundle window, goes live on this date so its effect
// reads in isolation against two weeks of clean baseline (the ruling's reason:
// it changes THE CONTENT on the stronger public cut, a different variable class
// from the six page-side bundle items). Before this date the verify assembler
// keeps the MKT-40 classic open unless `--cold-open` forces a PREVIEW build
// (suffixed output, never published). `--classic-open` restores the old open
// after the flip. This is a recorded switch date, not a scheduler (OPS-01).
export const VERIFY_PUBLIC_COLD_OPEN_FROM = '20260924';
