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
/** Which carrier audio the CTA cut voices:
 *   pt2   — the classic continuation ALONE ("Them digits are sittin' under
 *           that cover…" / "That cover comes off at sunup…"): gap-selling
 *           copy that matches the covered board. Verified + serving 9/10.
 *   cta   — MKT-78 (2026-09-09): the PURPOSE-WRITTEN CTA voice
 *           (<kind>_carrier_cta.mp4). Written AGAINST the cut, not adapted
 *           to it: it names only what is on screen (a board, six signals,
 *           covered digits) — the incumbent part 1's "every reason behind
 *           them showing" describes the MODALS this cut drops. No price
 *           spoken (pricing lives on the endcard, in config). ⚠ THIS IS WHY
 *           IT EXISTS — do not "restore" the pt2 copy for consistency.
 *   part1 — part 1 alone (scope announcement; mismatched read).
 *   bed   — no voice; the endcard's hum bed under the board.
 *  Override per run: --cta-voice=pt2|cta|part1|bed. The default flips to
 *  'cta' only after the operator's ear on the ASSEMBLED cut (MKT-78 §12). */
export type CtaVoice = 'pt2' | 'cta' | 'part1' | 'bed';
export const CTA_VOICE_DEFAULT: CtaVoice = 'pt2';
/** Measured voice files per kind and voice option: last-word timestamp
 *  (faster-whisper small, word timestamps) + the measurement date.
 *  reel:check FAILS if a registered file's mtime is later than its
 *  measurement (re-deliveries are a standing failure class), or if
 *  lastWord + 0.3s fade exceeds the voice budget
 *  (CTA_BOARD_DUR + CTA_VO_LEAD + 1.1). The assembler ABORTS on an
 *  unmeasured voice selection. Supersedes CTA_PT2_LAST_WORD (MKT-77). */
export interface CtaVoiceFile { file: string; lastWord: number; measuredAt: string }
export const CTA_VOICE_FILES: Record<string, Partial<Record<'pt2' | 'cta', CtaVoiceFile>>> = {
  midday_free: {
    pt2: { file: 'midday_free_carrier_pt2.mp4', lastWord: 9.30, measuredAt: '2026-09-09' },
    // MKT-78 serving file = delivered master, tail GATED to digital silence
    // from 9.72s (master kept as *_master_20260909.mp4). Whisper last word
    // 9.46s; energy end (−35 dBFS) 9.57s.
    cta: { file: 'midday_free_carrier_cta.mp4', lastWord: 9.46, measuredAt: '2026-09-09' },
  },
  evening_free: {
    pt2: { file: 'evening_free_carrier_pt2.mp4', lastWord: 9.18, measuredAt: '2026-09-09' },
    // MKT-78: the delivered master's last word was 9.58s — OVER the 9.5s
    // acceptance by 80 ms — so the PRE-AGREED cut applied: LINE ONE
    // ("Board's up. Six signals, ranked.") removed entirely (start 3.00s),
    // tail gated from 6.82s, padded to 10.005s. Last word now 6.60s (re-measured on the serving file).
    cta: { file: 'evening_free_carrier_cta.mp4', lastWord: 6.60, measuredAt: '2026-09-09' },
  },
};
/** @deprecated MKT-78 — kept as a view for any reader; use CTA_VOICE_FILES. */
export const CTA_PT2_LAST_WORD: Record<string, CtaVoiceFile> =
  Object.fromEntries(Object.entries(CTA_VOICE_FILES).map(([k, v]) => [k, v.pt2!]));
/** Hook-card copy, DELIVERED tier 2 (content agent, 2026-09-09). Linted at
 *  tier 2 fail-closed by the renderer. */
export const CTA_HOOK_COPY = {
  eyebrow: 'COVERED UNTIL TOMORROW',
  big: ['PRO IS READING', 'THESE DIGITS NOW'] as const,
  sub: 'BEFORE THE DRAW · 40+ STATES & PROVINCES',
};
