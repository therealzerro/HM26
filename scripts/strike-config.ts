// MKT-63 — THE CONDITIONAL STRIKE: a lightning bolt screen-blended over the
// body at the start of the first featured hold, ONLY when that hold is a
// STRAIGHT MATCH. The first conditional visual beat in the system and the
// first light-composite over the body.
//
// THE RULINGS THIS ENCODES (operator, 2026-08-19/20):
//   • ONCE PER REEL, NOT ONCE PER STRAIGHT — rarity is the whole point. The
//     renderer features straights FIRST, so "first featured straight" IS the
//     first hold whenever any straight is featured: one overlay, one fixed
//     window, once per reel by construction. Box-only days get nothing.
//   • The row must never be UNREADABLE: the bolt runs full-height down centre
//     frame and crosses the badge/attribution at peak, so the blend rides at
//     STRIKE_OPACITY (the operator's ruled fix palette was opacity or a
//     vertical offset; the bolt is full-height, so offset cannot clear it).
//   • The overlay's own audio is NEVER mapped — the carrier VO is the bed. The
//     delivered clip arrived with a baked crack (max −0.2 dB) against the
//     silent-by-design spec; recorded, ignored structurally.
//
// THE DELIVERED ASSET (overlay_strike_straight.mp4, 720x1280 @24fps, 4.00s,
// untagged-range yuv420p) measured on landing (MKT-63 scoping):
//   • Action f0–f27 (~1.13s, peak Y=255 at f6–7) — inside the 2.0s straight
//     hold with ≥0.8s of clean row after, as specified. STRIKE_TRIM cuts the
//     clip there so the tail never plays.
//   • Global floor Y≈16: LIMITED-RANGE black left untagged, not haze — mapped
//     to true black by the explicit in_range=tv read below, with the lutrgb
//     clamp as the safety net (screen blend turns any nonzero floor into a
//     veil over the board).
//   • ⚠ A RENDERED SPARKLE GLYPH (Y=85, ~48x48 px, bbox x576–623 y1136–1183)
//     sits bottom-right from frame 0 to the last frame — generator ornament
//     that survives any black-point lift. STRIKE_MASK blacks its box before
//     scaling; the bolt never enters that corner (region luma ≤100 at peak,
//     measured), so the mask costs nothing. THE MASK COORDS ARE IN THE
//     SOURCE'S 720x1280 SPACE — which is why the probe below REFUSES a
//     re-delivery at any other resolution instead of masking the wrong box.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Filename in assets/marketing. A source asset (like a stinger motion), not a
 *  reel — retention/supersession never touch local sources; checkStrays
 *  references it via this constant. */
export const STRIKE_OVERLAY = 'overlay_strike_straight.mp4';
/** Seconds of the clip that play — action ends ~1.13s; the sparkle-bearing
 *  floor tail (f28+) must never reach a frame. */
export const STRIKE_TRIM = 1.25;
/** Screen-blend opacity — full-strength crossed the badge/attribution
 *  unreadably at peak (measured on the 8/18 worst case: first-viewport
 *  featured STRAIGHT). 0.65 keeps the strike an event and the row legible. */
export const STRIKE_OPACITY = 0.65;
/** The coordinate space STRIKE_MASK is measured in. */
export const STRIKE_SRC_W = 720;
export const STRIKE_SRC_H = 1280;
/** Sparkle mask (source coords): measured bbox x576–623 y1136–1183 + margin. */
export const STRIKE_MASK = { x: 566, y: 1126, w: 68, h: 68 };
/** Post range-normalization black clamp (pc-range values below this → 0). */
export const STRIKE_FLOOR = 12;

/** Max acceptable luma in the UNPLAYED tail with the mask applied — the floor
 *  measures 16–20 (limited-range black + noise); the 8/19 sparkle measured 85.
 *  Anything above this outside the mask box is a new/moved glyph or real haze:
 *  exactly what must never ride a board under screen blend. */
export const STRIKE_TAIL_MAX = 40;
/** A strike that never gets bright is not a strike (preflight sanity). */
export const STRIKE_PEAK_MIN = 200;

export interface StrikeOverlay { path: string; dur: number }

/** Max YMAX over [from,to], optionally with the sparkle mask applied first —
 *  ONE measurement shared by the assembler's probe and preflight, so what the
 *  gate asserts is what the composite actually sees. -1 = no frames in window. */
export function strikeMaxLuma(path: string, from: number, to: number, masked: boolean): number {
  const mask = masked
    ? `drawbox=x=${STRIKE_MASK.x}:y=${STRIKE_MASK.y}:w=${STRIKE_MASK.w}:h=${STRIKE_MASK.h}:color=black:t=fill,`
    : '';
  const out = execSync(
    `ffmpeg -ss ${from} -to ${to} -i "${path}" -vf "${mask}signalstats,metadata=print:key=lavfi.signalstats.YMAX" -f null - 2>&1 | grep -oE "YMAX=[0-9.]+" || true`,
    { shell: '/bin/bash' },
  ).toString();
  const vals = [...out.matchAll(/YMAX=([\d.]+)/g)].map(m => parseFloat(m[1]));
  return vals.length ? Math.max(...vals) : -1;
}

/**
 * Resolve the overlay, MKT-08 probe style: NEVER aborts. Missing or defective
 * → null with a NOTE naming why, and the reel assembles byte-identical to a
 * strike-less day. Resolution is a hard structural requirement (see the mask
 * note above), not a scale-and-hope.
 */
export function probeStrikeOverlay(assetsDir: string): StrikeOverlay | null {
  const path = join(assetsDir, STRIKE_OVERLAY);
  if (!existsSync(path)) return null; // dormant lane — not even worth a NOTE per run
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height:format=duration -of csv=p=0 "${path}"`,
    ).toString().trim().split('\n');
    const [w, h] = (out[0] ?? '').split(',').map(Number);
    const dur = parseFloat(out[1] ?? out[0]?.split(',')[2] ?? '0');
    if (w !== STRIKE_SRC_W || h !== STRIKE_SRC_H) {
      console.log(`NOTE: ${STRIKE_OVERLAY} is ${w}x${h}, not ${STRIKE_SRC_W}x${STRIKE_SRC_H} — the sparkle mask is measured in the source space, so a re-delivered resolution needs the mask re-measured (strike-config). Strike dormant.`);
      return null;
    }
    if (!(dur >= STRIKE_TRIM)) {
      console.log(`NOTE: ${STRIKE_OVERLAY} is ${dur}s (< ${STRIKE_TRIM}s trim) — strike dormant.`);
      return null;
    }
    // Fail-closed floor gate (~0.4s): the unplayed tail, masked, must sit at
    // the black floor. A re-delivered clip with a moved sparkle or real haze
    // goes DORMANT here rather than riding a glyph onto a (possibly tier-1)
    // reel — the mask and clamp only rescue the defects that were measured.
    if (dur > STRIKE_TRIM + 0.2) {
      const tail = strikeMaxLuma(path, STRIKE_TRIM, dur, true);
      if (tail > STRIKE_TAIL_MAX) {
        console.log(`NOTE: ${STRIKE_OVERLAY} tail luma ${tail} outside the sparkle mask (max ${STRIKE_TAIL_MAX}) — un-measured bright content would ride the board under screen blend. Strike dormant; re-measure the delivery (reel:check names it too).`);
        return null;
      }
    }
    return { path, dur };
  } catch (e) {
    console.log(`NOTE: ${STRIKE_OVERLAY} unreadable (${String(e).slice(0, 80)}) — strike dormant.`);
    return null;
  }
}

/**
 * The composite chain, shared so a test harness exercises the exact graph the
 * assembler runs. Consumes `[inLabel]` (yuv420p body-timeline stream) and the
 * overlay at input `idx`; emits `[outLabel]` (yuv420p).
 *
 * Order of operations, each one load-bearing:
 *   trim/setpts   — only the action frames exist downstream (sparkle tail cut);
 *   drawbox       — sparkle mask, in SOURCE coords, before any scaling;
 *   scale in_range=tv:out_range=pc — the untagged clip is limited-range; read
 *                   it as such or Y=16 rides the board as a grey veil;
 *   fps/settb     — align to the assembler's 60fps/AVTB timeline;
 *   format=gbrp   — screen blend MUST run in RGB: yuv-plane screen shifts
 *                   chroma toward grey (chroma planes centre at 128);
 *   lutrgb        — floor clamp: residual near-black noise → true black,
 *                   because screen with black is identity and that identity is
 *                   what gates the effect to its window;
 *   tpad          — true-black padding to the reel's full span. No enable=
 *                   timeline, no EOF races: outside the window the top layer
 *                   IS black, and screen-with-black changes nothing.
 */
export function strikeFilter(idx: number, inLabel: string, outLabel: string, t0: number, total: number): string {
  const clamp = (c: string) => `${c}='if(lt(val,${STRIKE_FLOOR}),0,val)'`;
  const padTail = Math.max(0, +(total - t0 - STRIKE_TRIM).toFixed(2) + 0.5);
  return (
    `[${idx}:v]trim=duration=${STRIKE_TRIM},setpts=PTS-STARTPTS,` +
    `drawbox=x=${STRIKE_MASK.x}:y=${STRIKE_MASK.y}:w=${STRIKE_MASK.w}:h=${STRIKE_MASK.h}:color=black:t=fill,` +
    `scale=1080:1920:in_range=tv:out_range=pc:flags=lanczos,fps=60,settb=AVTB,format=gbrp,` +
    `lutrgb=${clamp('r')}:${clamp('g')}:${clamp('b')},` +
    `tpad=start_duration=${t0}:start_mode=add:color=black:stop_duration=${padTail}:stop_mode=add:color=black[strk];` +
    `[${inLabel}]format=gbrp[skbase];` +
    `[skbase][strk]blend=all_mode=screen:all_opacity=${STRIKE_OPACITY},format=yuv420p[${outLabel}];`
  );
}
