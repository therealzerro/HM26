// MKT-12 — shared stinger resolution for both assemblers.
//
// Returns the prebuilt per-variant clip, or null. On the DAILY path it never
// throws: a missing clip, a disabled variant, or a defective file all fall back
// to assembling exactly as before with a logged note, same contract as the
// anchor-intro lane. The one exception is an explicit MKT-19 `--stinger-motion`
// override, which aborts when it cannot be honoured — see probeStinger.
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STINGERS, STINGER_DUR, INTRO_XFADE, stingerFile } from './stinger-config';
import { stingerMotionsFor, builtStingerName, STINGER_MOTIONS, type MotionVariant } from './brand-motion';

export interface Stinger { path: string; dur: number; motion?: MotionVariant }

/**
 * How much a stinger ADDS to the open. The clip is crossfaded into rather than
 * butt-cut, so the crossfade window is shared, not additive.
 */
export function stingerAdds(s: Stinger | null): number {
  return s ? +(s.dur - INTRO_XFADE).toFixed(3) : 0;
}

export interface StingerCandidate { name: string; motion?: MotionVariant }

/**
 * The ordered candidate list for a variant on a date, without touching disk.
 *
 * Shared with `reel:check` for the same reason as `endcardCandidates`: the
 * preflight must report on the ordering the assembler will actually walk rather
 * than re-derive it. An empty `dateISO` yields the pre-MKT-19 behaviour (the
 * unversioned build alone), which is what any un-migrated caller gets.
 */
export function stingerCandidates(variant: string, dateISO = '', forceTag?: string): StingerCandidate[] {
  let rotation = dateISO ? stingerMotionsFor(variant, dateISO) : [];
  // MKT-19 Phase 2 gate: force one motion (see resolveEndcard's forceTag).
  if (forceTag) rotation = rotation.filter(m => m.tag === forceTag);
  const out: StingerCandidate[] = rotation.map(mv => ({ name: builtStingerName(variant, mv.tag), motion: mv }));
  // The unversioned build is the last resort, and is skipped under a forced tag
  // so the gate cannot silently report a combination it did not run.
  if (!forceTag) out.push({ name: stingerFile(variant) });
  return out;
}

/**
 * MKT-19: resolve the stinger for a variant on a date.
 *
 * Walks the day's rotation in preference order and takes the first BUILT file,
 * so a motion that has not been built yet drops out of that day rather than
 * taking the run down. The pre-MKT-19 unversioned name is the last candidate,
 * which keeps a half-migrated tree assembling. Exhausting everything returns
 * null and the reel assembles with no stinger — unchanged from MKT-12.
 *
 * `forceTag` inverts that tolerance, and deliberately: it exists so a specific
 * combination can be reviewed, and a review that silently drops the beat under
 * review is worse than no review.
 */
export function probeStinger(assetsDir: string, variant: string, dateISO = '', forceTag?: string): Stinger | null {
  const cfg = STINGERS[variant];
  if (!cfg) return null;
  if (!cfg.enabled) {
    console.log(`NOTE(${variant}): stinger disabled in config — assembling without it.`);
    return null;
  }
  const candidates = stingerCandidates(variant, dateISO, forceTag);
  let hit: StingerCandidate | undefined;
  for (const c of candidates) {
    if (existsSync(join(assetsDir, c.name))) { hit = c; break; }
  }
  if (!hit) {
    // Graceful degradation is correct for the DATE rotation — a missing motion
    // drops and the reel keeps its other beats. It is wrong for an explicit
    // override: the operator asked to watch one combination, and quietly
    // assembling a stinger-less reel would have them sign off on a beat that
    // never played. An unhonourable override fails loudly instead.
    if (forceTag) {
      console.error(
        `ABORT(${variant}): --stinger-motion=${forceTag} could not be resolved (tried ${candidates.map(c => c.name).join(', ') || 'nothing — no such motion tag'}).\n` +
        `       Known tags: ${STINGER_MOTIONS.map(m => m.tag).join(', ')}. Run npm run stinger:build ${variant}.`,
      );
      process.exit(1);
    }
    console.log(`NOTE(${variant}): no built stinger found (tried ${candidates.map(c => c.name).join(', ')}) — run npm run stinger:build. Assembling without a stinger.`);
    return null;
  }
  const p = join(assetsDir, hit.name);
  try {
    if (statSync(p).size < 100_000) throw new Error(`${statSync(p).size} bytes — placeholder/corrupt`);
    const probe = (a: string) => execSync(`ffprobe -v error ${a} "${p}"`).toString().trim();
    const vDur = parseFloat(probe('-select_streams v:0 -show_entries stream=duration -of csv=p=0'));
    if (!Number.isFinite(vDur) || vDur < STINGER_DUR - 0.05) throw new Error(`video ${vDur}s < ${STINGER_DUR}s`);
    const aDur = parseFloat(probe('-select_streams a:0 -show_entries stream=duration -of csv=p=0'));
    if (!Number.isFinite(aDur) || aDur <= 0) throw new Error('no audio stream');
    if (hit.motion) console.log(`NOTE(${variant}): stinger motion → ${hit.motion.file} [${hit.motion.label}].`);
    return { path: p, dur: STINGER_DUR, motion: hit.motion };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    // Same asymmetry as above: degrade on the daily path, abort under an
    // explicit override so a defective file cannot pass as a reviewed one.
    if (forceTag) {
      console.error(`ABORT(${variant}): --stinger-motion=${forceTag} resolved to ${hit.name} but it is unusable (${why}). Run npm run reel:check.`);
      process.exit(1);
    }
    console.log(`NOTE(${variant}): stinger unusable (${why}) — assembling without it. Run npm run reel:check.`);
    return null;
  }
}
