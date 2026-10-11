/**
 * briefFrames — the ANCHOR FRAME registry for the framed Pro brief (MKT-82
 * Phase 2, 2026-10-10). House registry pattern: file, kind, the MEASURED
 * screen rectangle, status. Nothing here is guessed — every screenRect comes
 * from the 2.3 screen gate (scripts/brief-frame-gate.py) run on the file.
 *
 * Geometry: the generated frames are 928×1152 (0.806:1). Output is 4:5 at
 * 1080×1350: crop 3 px off each side (922×1152), scale ×1.1714. screenRect is
 * stored in SOURCE pixels (the gate's inner edge, 4 px inside the glow line so
 * the border stays visible); `outputRect()` converts.
 *
 * Rotation (2.2): never the same frame two days running — `frameForDate()`
 * walks the ACTIVE frames by day index. With one active frame the rotation is
 * that frame every day, by construction (status says why).
 */

export type BriefFrameKind = 'present' | 'point' | 'receipts' | 'strip';
/** 'screen' = the frame image carries the glass (daily frames, measured by the
 *  gate); 'strip' = the image is the ANCHOR ONLY and CODE DRAWS THE SCREEN
 *  (MKT-83 new method, 2026-10-11). */
export type BriefFrameLayout = 'screen' | 'strip';
export type BriefFrameStatus = 'active' | 'parked';
/** MKT-83 (2026-10-11): the DAILY brief and the WEEKLY receipts image draw
 *  from separate frame sets — the rotations never cross. Every lookup below
 *  takes the set and defaults to 'daily' so the daily callers are unchanged. */
export type BriefFrameSet = 'daily' | 'weekly';

export interface BriefFrame {
  key: string;
  set: BriefFrameSet;
  kind: BriefFrameKind;
  file: string;                       // under assets/marketing/
  source: { w: number; h: number };
  layout?: BriefFrameLayout;          // default 'screen'
  screenRect?: { x: number; y: number; w: number; h: number };  // source px, inner edge ('screen' only)
  /** 'strip' only: the measured figure box (source px) and the background
   *  colour the canvas is painted so the feathered edges vanish. */
  strip?: { figure: { x: number; y: number; w: number; h: number }; bg: string };
  status: BriefFrameStatus;
  gate: string;                       // the measured verdict, verbatim
}

export const BRIEF_FRAME_SOURCE_W = 928;
export const BRIEF_FRAME_SOURCE_H = 1152;
export const BRIEF_OUT_W = 1080;
export const BRIEF_OUT_H = 1350;
const CROP_X = 3;                       // (928 − 1152·0.8) / 2
const SCALE = BRIEF_OUT_W / (BRIEF_FRAME_SOURCE_W - 2 * CROP_X);   // 1.1714

export const BRIEF_FRAMES: BriefFrame[] = [
  {
    key: 'point',
    set: 'daily',
    kind: 'point',
    file: 'brief_frame_point.png',
    source: { w: 928, h: 1152 },
    // gate 2026-10-10 (second delivery, IMG_0486): outer glow x68 y108 w792
    // h462, axis ≤1 px, interior std 3.2, no intrusion, crop margins 65/65.
    screenRect: { x: 75, y: 115, w: 779, h: 449 },
    status: 'active',
    gate: 'PASS 2026-10-10 — single border, standing pointer, no intrusion',
  },
  {
    key: 'present',
    set: 'daily',
    kind: 'present',
    file: 'brief_frame_present.png',
    source: { w: 928, h: 1152 },
    // gate 2026-10-10 (second delivery, IMG_0488): outer x68 y107 w792 h463;
    // FAIL — helmet crown enters the screen 21 px (x458–534, y546–560).
    // OPERATOR OVERRIDE 2026-10-10 ("use the frames with helmet as is; there
    // will be no 3rd regen"): ACTIVE despite the gate FAIL. The usable rect's
    // bottom edge is raised to y542, above the crown (y546), so no text is ever
    // drawn over the helmet — the glow line below it stays visible.
    screenRect: { x: 75, y: 114, w: 779, h: 428 },
    status: 'active',
    gate: 'FAIL 2026-10-10 (helmet crown intrudes 21 px, x458–534 y546–560) — ACTIVE by operator override, rect bottom raised above the crown',
  },
  {
    // MKT-83 NEW METHOD (content agent, 2026-10-11): the anchor STRIP —
    // IMG_0492 (upload 9972526, 1376×768 JPEG) → weekly_anchor_strip.png.
    // Gate 2026-10-11: figure box x312–1031 y144–767 (720×624), 144 px of
    // empty background above the helmet, no contact with the top/left/right
    // edges (bottom = chest cut, by design); background #09060c, luminance
    // std ≈ 2 across the top 18 % and both side quarters (p99 ≤ 15; mild
    // vignette 6.5 → 12 corner-to-centre, hidden by the feather); no
    // foreground pixel outside the figure box; mug plain. The helmet bolt is
    // the anchor's own design (daily frames carry it). PASS → ACTIVE.
    // The CARD draws the glass panel (912×846 px minimum plus margin) and
    // seats this strip below it, helmet ≥ 24 px clear of the panel edge.
    key: 'strip',
    set: 'weekly',
    kind: 'strip',
    layout: 'strip',
    file: 'weekly_anchor_strip.png',
    source: { w: 1376, h: 768 },
    strip: { figure: { x: 312, y: 144, w: 720, h: 624 }, bg: '#09060c' },
    status: 'active',
    gate: 'PASS 2026-10-11 — anchor only, uncut helmet/shoulders/mug, 144 px clear above the helmet, background uniform (lum std ≈ 2), no marks',
  },
  {
    // MKT-83 weekly frame (IMG_0490, upload 6005fb0 → weekly_frame_receipts.png).
    // RETIRED 2026-10-11 by the content agent (generated-screen method dropped
    // for the weekly set); file moved to _rejected/weekly_frame_receipts_20261011a.png
    // with its gate JSON. Entry kept parked for the record.
    // Gate 2026-10-11: outer glow x68 y107 w792 h462, axis ≤1 px, single
    // border, crop survives (margins 65/65). FAIL on the governing requirement:
    // the usable screen is 918×532 px on the 1080×1350 canvas against the
    // ≥ 912×846 the weekly grid needs (short 314 px); helmet crown intrudes
    // 5 px (x471–515, y549–553). PARKED until the operator rules; the classic
    // card ships without it. screenRect = inner edge 4 px inside the glow,
    // bottom raised above the crown (y545) so a text line never crosses it.
    key: 'receipts',
    set: 'weekly',
    kind: 'receipts',
    file: '_rejected/weekly_frame_receipts_20261011a.png',
    source: { w: 928, h: 1152 },
    screenRect: { x: 75, y: 114, w: 779, h: 431 },
    status: 'parked',
    gate: 'FAIL 2026-10-11 — screen 918×532 px on canvas vs ≥912×846 required (short 314 px); helmet crown intrudes 5 px (x471–515, y549–553); axis ≤1 px, single border, crop survives',
  },
];

/** The flip date: from this ET date the FRAMED Pro brief is the default Pro
 *  capture; before it the framed cut is the preview button only (2.6). */
export const BRIEF_FRAME_FROM = '2026-10-11';

export function activeBriefFrames(set: BriefFrameSet = 'daily'): BriefFrame[] {
  return BRIEF_FRAMES.filter(f => f.status === 'active' && f.set === set);
}

export function frameByKey(key: string, set: BriefFrameSet = 'daily'): BriefFrame | null {
  return BRIEF_FRAMES.find(f => f.key === key && f.status === 'active' && f.set === set) ?? null;
}

/** Day-indexed rotation over the active frames of a set (ET date "YYYY-MM-DD").
 *  The weekly set rotates on the same day index — one frame per Sunday. */
export function frameForDate(dateISO: string, set: BriefFrameSet = 'daily'): BriefFrame | null {
  const active = activeBriefFrames(set);
  if (!active.length) return null;
  const [y, m, d] = dateISO.split('-').map(n => parseInt(n, 10));
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return active[((dayIndex % active.length) + active.length) % active.length];
}

/** screenRect in OUTPUT pixels (1080×1350) for the 4:5 crop + scale. */
export function outputRect(f: BriefFrame): { x: number; y: number; w: number; h: number } {
  if (!f.screenRect) throw new Error(`frame "${f.key}" has no screenRect (layout ${f.layout ?? 'screen'})`);
  return {
    x: Math.round((f.screenRect.x - CROP_X) * SCALE),
    y: Math.round(f.screenRect.y * SCALE),
    w: Math.round(f.screenRect.w * SCALE),
    h: Math.round(f.screenRect.h * SCALE),
  };
}

/** Static requires — Metro needs literal paths. Keep in step with BRIEF_FRAMES. */
export const BRIEF_FRAME_IMAGES: Record<string, number> = {
  point: require('@/assets/marketing/brief_frame_point.png'),
  present: require('@/assets/marketing/brief_frame_present.png'),
  strip: require('@/assets/marketing/weekly_anchor_strip.png'),
};
