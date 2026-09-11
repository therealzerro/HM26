// MKT-79 — `record_public`: THE DAILY TRACK RECORD REEL. One module for every
// number the renderer, the assembler, the publisher and reel:check share, so
// the anatomy cannot drift between them (the public-hook-config pattern).
//
// WHY THIS KIND EXISTS (content agent work order, 2026-09-11; operator
// required it ready for the 9/12 assembly): the public page's one daily post
// is the covered board — the weakest asset the system makes. verify_public
// was the proof half and goes unposted because a receipts reel with masked
// receipts is unsatisfying. This kind shows proof that needs no masking: the
// last 30 graded days as a strip of tiles, gold on matched days, DIM on the
// misses, and the three structural stats beneath. Cold viewers never saw it.
//
// ⛔ THE DIM TILES ARE THE DESIGN. Unmatched days are rendered on purpose,
// stay visible, are never hidden and never removed. The misses on screen are
// the honesty; a strip with no dim tile is a REJECT (renderer aborts unless
// --allow-all-matched, for the day the record genuinely reads 30 of 30).
// Do not "clean them up".
//
// DISPATCH (ruled, 2026-09-11): BOTH public cuts DAILY — allday_public keeps
// its morning slot, record_public takes the 7pm attention-clock slot
// verify_public was meant to fill. Two public posts/day on a page carrying 13
// hides — risk accepted by the operator with eyes open. verify_public stays
// REGISTERED and leaves the daily schedule. The 9/9→9/23 bundle-window
// confound is ACCEPTED BY THE OPERATOR and recorded (MASTER_AUDIT MKT-79).
//
// ESCAPE HATCH: purely ADDITIVE. Nothing else in the daily run reads this
// module; if this kind aborts, allday_public runs alone exactly as before.
import { HOOK_DUR, HOOK_DISSOLVE } from './public-hook-config';

export const RECORD_KIND = 'record_public';
/** assets/marketing subdirectory for the body, hook, finals. */
export const RECORD_DIR = 'record_reels';

/** The window: 30 COMPLETE graded days ending D−1 (the reel's stamp). The
 *  track-record screen's own 30d window is today−29..today with today joining
 *  the DAYS denominator only once it has a match; the reel needs a fixed
 *  "OF 30" so it takes the 30 complete days instead — SAME computation
 *  (scripts/reel-record-stats.ts mirrors app/track-record.tsx), shifted
 *  window. Recorded in MKT-79 Phase 0 item 1. */
export const RECORD_WINDOW_DAYS = 30;

// ── Anatomy (seconds on the reel timeline) ──────────────────────────────────
//   [0.0–2.0]   hook card (HOOK_DUR), fixed copy, gold
//   [2.0–2.4]   dissolve (HOOK_DISSOLVE) — body frame 0 cloned under it
//   [2.4–2.9]   thirty tiles appear together, DIM; range label above
//   [2.9–5.9]   gold marks land on matched days left→right, ~0.1s apart
//   [5.9–6.9]   count resolves large beneath:  N OF 30 DAYS
//   [6.9–8.4]   secondary stats, gold:  E EXACT-ORDER MATCHES · J STATES & PROVINCES
//   [8.4–9.4]   hold; rightmost tile carries a faint pulse
//   [9.4–9.8]   dissolve into the endcard
//   [9.8–16.3]  endcard, free-tier motion set (6.5s after the dissolve)
export const RECORD_BODY_DUR = 7.4;          // body motion 2.0→9.4
export const RECORD_END_DISSOLVE = 0.4;       // body→endcard dissolve
export const RECORD_CARD = 6.5;               // endcard on screen after the dissolve
/** Body-local beat times (body t=0 is reel 2.0s). */
export const RECORD_BEATS = {
  tilesIn: [0.4, 0.9] as const,      // reel 2.4–2.9
  marksFrom: 0.9,                    // reel 2.9
  markStep: 0.1,                     // one matched day per ~0.1s, left→right
  marksTo: 3.9,                      // reel 5.9 — the last mark must have landed by here
  countIn: [3.9, 4.9] as const,      // reel 5.9–6.9
  statsIn: [4.9, 6.4] as const,      // reel 6.9–8.4
  pulseFrom: 6.4,                    // reel 8.4 — the rightmost tile's faint pulse
} as const;
/** Furniture = hook card + endcard after the dissolve. ~52% — the evidence-
 *  reel number (report, don't judge). */
export const RECORD_TOTAL = +(HOOK_DUR + RECORD_BODY_DUR + RECORD_END_DISSOLVE + RECORD_CARD).toFixed(2); // 16.3
export const RECORD_FURNITURE = +(HOOK_DUR + RECORD_CARD).toFixed(2);
/** Render fps for the body frames (the assembler resamples to 60). */
export const RECORD_RENDER_FPS = 30;

// ── Layout decision (Phase 0 item 4): GRID, not a single-row strip ──────────
// 30 tiles in ONE row at 1080px are ~28px each — ~10px at a ~380px feed
// width, where dim-vs-gold survives only as a colour and a single dim tile
// between gold neighbours is a one-pixel gap. A 10×3 GRID gives ~88px tiles
// (~31px at feed width): the dim tiles read as tiles, and the left→right
// landing order still holds (row by row). Everything sits inside y420–1500.
export const RECORD_GRID = { cols: 10, rows: 3, tile: 88, gap: 12, top: 640 } as const;

// ── Hook card copy (fixed; tier-1 lint fail-closed in render-public-hook) ──
export const RECORD_HOOK_COPY = {
  eyebrow: '40+ STATES & PROVINCES',
  big: ['THE TRACK', 'RECORD'] as const,
  sub: 'LAST 30 DAYS · CHECKED AGAINST OFFICIAL RESULTS',
};

// ── Three-digit assert (Phase 0 item 2) — NON-NEGOTIABLE ───────────────────
// Every stat the body renders (days, of, exact, juris) must be < 100. Days
// caps at 30 by construction; jurisdictions ~45; exact-order tens. A stat
// ≥ 100 aborts the render WITH THE VALUE in the error: a three-digit run on
// a tier-1 surface is the class of defect that takes the page down (Q1).
export const RECORD_STAT_MAX = 99;

// ── Voice ──────────────────────────────────────────────────────────────────
// Default is the hum bed (no voice). The carrier (record_public_carrier.mp4,
// single part, no pt2) registers HERE when it clears its gates: ffprobe · trim
// to speech · last word ≤ RECORD_VOICE_LAST_WORD_MAX · silent tail · tier-1
// transcript lint (no session words, no state names, no result counts) ·
// voice-family check against a serving carrier. ⛔ If it fails any gate the
// reel ships SILENT with the bed — the reel never waits on the voice.
// The scripted line three ("And the misses stay on there.") is timed to land
// at reel 6.9s — as the count resolves and the dim tiles are on screen — so
// the voice enters at reel 0.0 (carrier-local time == reel time). If the body
// timing ever shifts, keep that alignment.
export type RecordVoice = 'bed' | 'carrier';
export const RECORD_VOICE_START = 0.0;
export const RECORD_VOICE_LAST_WORD_MAX = 9.5;
export interface RecordVoiceFile { file: string; lastWord: number; measuredAt: string }
/**
 * REGISTERED 2026-09-11 (landed upstream mid-build: "Add files via upload" +
 * a GitHub web RENAME to record_public_carrier.mp4 — probed intact, not a
 * stub). Gates, measured on landing:
 *   · ffprobe: h264 720×1280 24fps 10.000s · aac 48k stereo 10.005s (the
 *     10.005s law holds) · 610 KB (static bolt on purple compresses small).
 *   · speech (faster-whisper small int8, word timestamps): "40 plus states,
 *     30 days, every one of them checked, published for the draw, graded
 *     after, and the misses stay on there." — the three scripted lines with
 *     whisper-level variances ("for"/"'fore", "of them"/"of 'em"). First
 *     word 0.00s, LAST WORD 9.26s ≤ 9.5 (scripted ≤ 8.8 — over by 0.46s,
 *     inside acceptance). Tier-1 lint CLEAN: no session words, no state
 *     names, no result counts spoken (40/30 are the two-digit scale words).
 *   · silent tail: last 0.5s −80.8 dBFS RMS (digital silence from 9.30s);
 *     no trim needed — speech starts at 0.00, so the file plays whole.
 *   · voice family (autocorrelation f0, −40 dB gate): 121.2 Hz IQR
 *     [106.8–132.2], centroid 936 Hz — vs public_carrier 115.1 [101.4–124.0]
 *     /758, verif 105.3 [98.8–113.7]/872, midday cta 102.6 [94.7–111.9]/965.
 *     IQRs overlap with every serving reference; reads ~6 Hz above the
 *     public carrier and below allday_pro's 133. Same family by proxy; the
 *     ear is the operator's (MKT-43 convention).
 *   · ALIGNMENT: voice enters at reel 0.0, so line three ("and the misses…")
 *     lands at reel 7.86s, not the scripted 6.9s — the count has resolved
 *     (6.9) and the stats line is fading in; the dim tile has been on
 *     screen since 2.9s. "Misses" is spoken at 8.18s with the miss visible,
 *     which is the alignment's purpose. There is no leading silence to
 *     trim, so the file cannot be pulled earlier; recorded, not corrected.
 * Default flipped to 'carrier' on registration (the order: bed is the
 * default UNTIL the carrier clears). --voice=bed remains the silent fallback.
 */
export const RECORD_VOICE_FILE: RecordVoiceFile | null = { file: 'record_public_carrier.mp4', lastWord: 9.26, measuredAt: '2026-09-11' };
export const RECORD_VOICE_DEFAULT: RecordVoice = 'carrier';
