// MKT-08 — Anchor-intro probe for the reel assemblers.
// MKT-17 — the intro is no longer a fixed filename: it is resolved PER REEL KIND
// (scripts/anchor-intros.ts). Slate reels rotate over a set on a date-derived
// offset; verify and the public cuts take a fixed file. Passing no kind keeps
// the MKT-08 behaviour (the standard intro), so nothing that hasn't been updated
// changes meaning.
//
// "The Anchor" newsroom figure → camera dives into the phone → full-frame purple
// smoke. Its final frames dissolve into the UI body, replacing the legacy
// endcard-lockup open. The endcard remains the outro, untouched.
//
// Contract (validated hard in reel:check; soft here): embedded audio required,
// duration 3.5–6.5s, final ~0.5s near-uniform smoke. This probe NEVER aborts —
// with no usable intro it returns null and the assemblers fall back to the
// legacy open exactly as before, so the daily run can't block on it.
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { introCandidates, todayET } from './anchor-intros';

export const INTRO_DISSOLVE = 0.8;   // intro's final smoke → body first frame
export const INTRO_VO_LEAD = 0.4;    // carrier VO enters this far before the intro ends
export const INTRO_MIN = 3.5;
export const INTRO_MAX = 6.5;

export interface AnchorIntro { path: string; dur: number; label?: string }

/**
 * Resolve + validate the intro for a reel kind.
 *
 * Walks the kind's candidate list and returns the FIRST usable file, so a
 * missing or defective rotation member drops out of that day with a logged
 * warning rather than taking the run down. Exhausting the list returns null and
 * the assembler falls back to the legacy 1.2s lockup open.
 */
export function probeAnchorIntro(
  assetsDir: string,
  kind = '',
  dateISO: string = todayET(),
): AnchorIntro | null {
  const candidates = introCandidates(kind, dateISO);
  for (const c of candidates) {
    const hit = probeOne(join(assetsDir, c.file), c.file);
    if (hit) {
      console.log(`NOTE(${kind || 'default'}): intro → ${c.file} [${c.label}] ${hit.dur}s.`);
      return { ...hit, label: c.label };
    }
  }
  console.log(`NOTE(${kind || 'default'}): no usable intro — assembling with the legacy endcard-lockup open.`);
  return null;
}

function probeOne(p: string, name: string): AnchorIntro | null {
  if (!existsSync(p)) {
    console.log(`NOTE: ${name} not present — dropped from today's intro selection.`);
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
    console.log(`NOTE: ${name} unusable (${msg}) — dropped from today's intro selection. Run npm run reel:check.`);
    return null;
  }
}
