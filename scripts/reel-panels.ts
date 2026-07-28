// MKT-11 — panel file resolution + clearance, shared by build-panels and reel:check.
//
// Rotation itself lives in constants/reelPanels.ts because the APP performs it
// (panels render inside the pick-detail modal during capture, not as a video
// overlay). This module only deals with files on disk: where they are, whether
// they are readable, and whether their copy is still cleared.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PANELS, CLEARANCE, SRC_DIR, PUBLIC_DIR } from './panel-config';
import type { ReelPanel } from '../constants/reelPanels';

const ROOT = resolve('.');

export function sourcePath(assetsDir: string, p: ReelPanel): string {
  return join(assetsDir, SRC_DIR, p.file);
}
/** Where the app actually loads it from, relative to the repo root. */
export function publicPath(p: ReelPanel): string {
  return join(ROOT, PUBLIC_DIR, p.file);
}

export function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function clearanceFor(p: ReelPanel) {
  return CLEARANCE[p.file];
}

export interface PanelAvailability {
  usable: ReelPanel[];
  /** Human-readable reasons for anything dropped, for logging. */
  dropped: string[];
}

/**
 * Panels the APP will actually be able to load — i.e. present under public/.
 * A missing one is dropped from that day's rotation rather than blocking.
 */
export function available(): PanelAvailability {
  const usable: ReelPanel[] = [];
  const dropped: string[] = [];
  for (const p of PANELS) {
    const f = publicPath(p);
    if (!existsSync(f)) {
      dropped.push(`${p.file} — not published to ${PUBLIC_DIR} (run npm run panel:build)`);
      continue;
    }
    // Catches the truncated/renamed-through-a-web-UI failure mode that has
    // bitten this pipeline before.
    if (statSync(f).size < 1024) {
      dropped.push(`${p.file} — ${statSync(f).size} bytes, placeholder/corrupt`);
      continue;
    }
    usable.push(p);
  }
  return { usable, dropped };
}
