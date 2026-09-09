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

// MKT-77 (2026-09-09, content agent work order) — FREE SESSION REELS AS CTA CUTS.
// midday_free / evening_free are the lowest-information posts in the daily nine
// (digits covered by design), so their only honest job is conversion, and a
// ~34s walk through a board the member cannot read does not serve it. The CTA
// cut: HOOK_DUR covered hook card → CTA_BOARD_DUR covered board (the body's
// static grid still ONLY — the modals are dropped) → the 6.5s CTA endcard.
// ~55% furniture is CORRECT for a CTA cut (the 38–44% band governs information
// reels). Escape hatch: `--classic-cut` on the assembler restores the full
// anatomy. ⛔ SOCIAL-13: allday_free is PURE VALUE and is NOT a CTA kind — the
// assembler additionally refuses the cut on any non-redacted body.
export const CTA_CUT_KINDS: readonly string[] = ['midday_free', 'evening_free'];
/** Covered-board hold. ≤ the body's 10.0s grid still (constants/reelPanels
 *  GRID_DUR) so only the still is ever shown. Sized so the pt2 voice's last
 *  word lands inside the voice window: window = CTA_BOARD_DUR + CTA_VO_LEAD,
 *  overlap allowance +1.1s (assembler) → 9.8s of VO at 7.5s; pt2 last words
 *  measured 9.30s (midday) / 9.18s (evening) on 2026-09-09. */
export const CTA_BOARD_DUR = 7.5;
/** The voice enters this many seconds BEFORE the board dissolve completes —
 *  i.e. 0.8s into the (silent) hook card, over the words it is saying. Slate
 *  reels use INTRO_VO_LEAD=0.4 behind a 6s intro; the card is 2.0s and mute. */
export const CTA_VO_LEAD = 1.2;
/** Which carrier audio the CTA cut voices. Ruling pending (content agent):
 *   pt2   — the continuation ALONE ("Them digits are sittin' under that cover…"
 *           / "That cover comes off at sunup…"): the gap-selling copy, and it
 *           matches the covered board on screen. Default.
 *   part1 — part 1 alone (scope announcement; references the modals the cut
 *           drops — a mismatched read).
 *   bed   — no voice; the endcard's hum bed under the board.
 *  Override per run: --cta-voice=pt2|part1|bed. */
export type CtaVoice = 'pt2' | 'part1' | 'bed';
export const CTA_VOICE_DEFAULT: CtaVoice = 'pt2';
/** Last-word timestamps of the pt2 files (faster-whisper small, 2026-09-09)
 *  + the measurement date. reel:check FAILS if a pt2 was re-delivered after
 *  the measurement (carrier re-deliveries are a standing failure class). */
export const CTA_PT2_LAST_WORD: Record<string, { file: string; lastWord: number; measuredAt: string }> = {
  midday_free:  { file: 'midday_free_carrier_pt2.mp4',  lastWord: 9.30, measuredAt: '2026-09-09' },
  evening_free: { file: 'evening_free_carrier_pt2.mp4', lastWord: 9.18, measuredAt: '2026-09-09' },
};
/** Hook-card copy, DELIVERED tier 2 (content agent, 2026-09-09). Linted at
 *  tier 2 fail-closed by the renderer. */
export const CTA_HOOK_COPY = {
  eyebrow: 'COVERED UNTIL TOMORROW',
  big: ['PRO IS READING', 'THESE DIGITS NOW'] as const,
  sub: 'BEFORE THE DRAW · 40+ STATES & PROVINCES',
};
