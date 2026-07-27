// MKT-08 — shared Anchor-intro probe for the reel assemblers.
//
// assets/marketing/anchor_intro.mp4 = single branded intro for ALL reel kinds
// ("The Anchor" newsroom figure → camera dives into the phone → full-frame
// purple smoke). Its final frames dissolve into the UI body, replacing the
// legacy endcard-lockup open. The endcard remains the outro, untouched.
//
// Contract (validated hard in reel:check; soft here): embedded audio required,
// duration 3.5–6.5s, final ~0.5s near-uniform smoke. This probe NEVER aborts —
// a missing or unusable intro returns null and the assemblers fall back to
// the legacy open exactly as before, so the daily run can't block on it.
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const INTRO_DISSOLVE = 0.8;   // intro's final smoke → body first frame
export const INTRO_VO_LEAD = 0.4;    // carrier VO enters this far before the intro ends
export const INTRO_MIN = 3.5;
export const INTRO_MAX = 6.5;

export interface AnchorIntro { path: string; dur: number }

export function probeAnchorIntro(assetsDir: string): AnchorIntro | null {
  const p = join(assetsDir, 'anchor_intro.mp4');
  if (!existsSync(p)) {
    console.log('NOTE: anchor_intro.mp4 not present — assembling with the legacy endcard-lockup open.');
    return null;
  }
  try {
    // Same placeholder/corrupt guard reel:check applies (the GitHub web-rename
    // failure mode) — without it a 2-byte stub would be composited into reels.
    const size = statSync(p).size;
    if (size < 100_000) throw new Error(`${size} bytes — placeholder/corrupt`);
    const probe = (args: string) => execSync(`ffprobe -v error ${args} "${p}"`).toString().trim();
    const vDur = parseFloat(probe('-select_streams v:0 -show_entries stream=duration -of csv=p=0'));
    if (!Number.isFinite(vDur)) throw new Error('unreadable video stream');
    const aDur = parseFloat(probe('-select_streams a:0 -show_entries stream=duration -of csv=p=0'));
    if (!Number.isFinite(aDur) || aDur <= 0) throw new Error('no audio stream (intro audio is load-bearing pre-VO)');
    if (vDur < INTRO_MIN || vDur > INTRO_MAX) throw new Error(`duration ${vDur.toFixed(1)}s outside ${INTRO_MIN}-${INTRO_MAX}s`);
    return { path: p, dur: +vDur.toFixed(2) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`NOTE: anchor_intro.mp4 unusable (${msg}) — assembling with the legacy open. Run npm run reel:check.`);
    return null;
  }
}
