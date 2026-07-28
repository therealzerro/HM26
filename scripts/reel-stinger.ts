// MKT-12 — shared stinger resolution for both assemblers.
//
// Returns the prebuilt per-variant clip, or null. NEVER throws: a missing clip,
// a disabled variant, or a defective file all fall back to assembling exactly
// as before with a logged note, same contract as the anchor-intro lane.
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STINGERS, STINGER_DUR, INTRO_XFADE, stingerFile } from './stinger-config';

export interface Stinger { path: string; dur: number }

/**
 * How much a stinger ADDS to the open. The clip is crossfaded into rather than
 * butt-cut, so the crossfade window is shared, not additive.
 */
export function stingerAdds(s: Stinger | null): number {
  return s ? +(s.dur - INTRO_XFADE).toFixed(3) : 0;
}

export function probeStinger(assetsDir: string, variant: string): Stinger | null {
  const cfg = STINGERS[variant];
  if (!cfg) return null;
  if (!cfg.enabled) {
    console.log(`NOTE(${variant}): stinger disabled in config — assembling without it.`);
    return null;
  }
  const p = join(assetsDir, stingerFile(variant));
  if (!existsSync(p)) {
    console.log(`NOTE(${variant}): ${stingerFile(variant)} not built — run npm run stinger:build. Assembling without a stinger.`);
    return null;
  }
  try {
    if (statSync(p).size < 100_000) throw new Error(`${statSync(p).size} bytes — placeholder/corrupt`);
    const probe = (a: string) => execSync(`ffprobe -v error ${a} "${p}"`).toString().trim();
    const vDur = parseFloat(probe('-select_streams v:0 -show_entries stream=duration -of csv=p=0'));
    if (!Number.isFinite(vDur) || vDur < STINGER_DUR - 0.05) throw new Error(`video ${vDur}s < ${STINGER_DUR}s`);
    const aDur = parseFloat(probe('-select_streams a:0 -show_entries stream=duration -of csv=p=0'));
    if (!Number.isFinite(aDur) || aDur <= 0) throw new Error('no audio stream');
    return { path: p, dur: STINGER_DUR };
  } catch (e) {
    console.log(`NOTE(${variant}): stinger unusable (${e instanceof Error ? e.message : String(e)}) — assembling without it. Run npm run reel:check.`);
    return null;
  }
}
