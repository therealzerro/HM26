// MKT-66 — public cold-open timing, shared by the hook renderer and the
// assembler. Kept in its own module so the assembler can import the numbers
// without executing render-public-hook.ts's CLI body.
export const HOOK_DUR = 2.0;        // card on screen (seconds) before the board dissolve begins
export const HOOK_DISSOLVE = 0.4;   // card → board first frame
