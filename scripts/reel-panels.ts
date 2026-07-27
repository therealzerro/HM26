// MKT-11 — panel rotation + availability, shared by the assembler and reel:check.
//
// Rotation contract:
//  - Deterministic by date, matching the caption engine: the date derives a
//    starting offset into the ordered list, then panels cycle in order across
//    the six modals. Re-running a date reproduces the sequence exactly.
//  - Set size == modal count (today): every panel appears once; daily variety
//    is order-only. Intended.
//  - Set size  > modal count: the offset advances by MODAL_COUNT per day, so
//    consecutive days show different subsets rather than a sliding window.
//  - Set size  < modal count: the cycle repeats rather than leaving a modal bare.
//  Growing the set needs no code change.
//
// Graceful degradation (same pattern as the anchor-intro lane): a missing or
// unreadable panel is dropped from the rotation for that run with a named
// warning, and the run continues. Nothing here ever aborts.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PANELS, MODAL_COUNT, type Panel } from './panel-config';

export const PANEL_DIR = 'panels';
export const BUILT_DIR = join(PANEL_DIR, 'built');

export function sourcePath(assetsDir: string, p: Panel): string {
  return join(assetsDir, PANEL_DIR, p.file);
}
export function builtPath(assetsDir: string, p: Panel): string {
  return join(assetsDir, BUILT_DIR, p.file);
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Day index matching reel-captions' dayOfYear — same clock-free UTC math. */
export function dayIndex(stamp: string): number {
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
  const d = new Date(iso + 'T12:00:00Z');
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - jan1) / 86_400_000);
}

export interface PanelAvailability {
  usable: Panel[];
  /** Human-readable reasons for anything dropped, for logging. */
  dropped: string[];
}

/**
 * Panels whose BUILT artwork exists and is readable. `requireBuilt=false`
 * checks the sources instead (used by the builder and by preflight before a
 * build has run).
 */
export function available(assetsDir: string, requireBuilt = true): PanelAvailability {
  const usable: Panel[] = [];
  const dropped: string[] = [];
  for (const p of PANELS) {
    const f = requireBuilt ? builtPath(assetsDir, p) : sourcePath(assetsDir, p);
    if (!existsSync(f)) {
      dropped.push(`${p.file} — ${requireBuilt ? 'not built (run npm run panel:build)' : 'file missing'}`);
      continue;
    }
    // Catches the truncated/renamed-through-a-web-UI failure mode that has bitten
    // this pipeline before; a 2-byte stub would otherwise composite as garbage.
    if (statSync(f).size < 1024) {
      dropped.push(`${p.file} — ${statSync(f).size} bytes, placeholder/corrupt`);
      continue;
    }
    usable.push(p);
  }
  return { usable, dropped };
}

/**
 * The day's sequence: one panel per modal, in modal order 1..MODAL_COUNT.
 * Returns [] when nothing is usable (caller composites no panels at all).
 */
export function rotation(stamp: string, usable: Panel[]): Panel[] {
  const n = usable.length;
  if (n === 0) return [];
  const offset = (dayIndex(stamp) * MODAL_COUNT) % n;
  return Array.from({ length: MODAL_COUNT }, (_, i) => usable[(offset + i) % n]);
}

/**
 * True when advancing by MODAL_COUNT can only ever reach gcd-many distinct
 * offsets — e.g. 12 panels alternate between just two fixed subsets forever.
 * Surfaced rather than silently accepted.
 */
export function rotationDegenerate(n: number): boolean {
  if (n <= MODAL_COUNT) return false;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  return n / gcd(n, MODAL_COUNT) < 3;
}

/** Modal i (0-based) occupies this window on the REEL timeline. */
export function modalWindow(openDur: number, gridDur: number, holdDur: number, i: number): [number, number] {
  const t0 = +(openDur + gridDur + i * holdDur).toFixed(3);
  return [t0, +(t0 + holdDur).toFixed(3)];
}
