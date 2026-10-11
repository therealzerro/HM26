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

export type BriefFrameKind = 'present' | 'point' | 'receipts';
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
  screenRect: { x: number; y: number; w: number; h: number };   // source px, inner edge
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
    // MKT-83 weekly frame (IMG_0490, upload 6005fb0 → weekly_frame_receipts.png).
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
    file: 'weekly_frame_receipts.png',
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
  receipts: require('@/assets/marketing/weekly_frame_receipts.png'),
};
