// MKT-19 — resolve which BUILT endcard a reel kind closes on today.
//
// Counterpart to reel-intro.ts and reel-stinger.ts. Everything that reads an
// endcard goes through here, because `${kind}_endcard.mp4` was a hardcoded path
// in eight places and two of them were inline literals in the verify assembler —
// including the legacy fallback open, which reads the endcard's final frame.
// Leaving that one behind would have degraded the single path that exists to
// catch failures.
//
// AN ENDCARD IS NOT OPTIONAL. A missing intro degrades to the legacy open and a
// missing stinger degrades to no stinger, but a reel with no close is not a
// reel. So this walks its candidates and, on exhausting them, FAILS LOUDLY
// rather than returning null.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ENDCARDS } from './endcard-config';
import {
  endcardMotionsFor, builtEndcardName, readMotionMeta, type MotionVariant,
} from './brand-motion';

export interface ResolvedEndcard {
  /** Absolute path to the built endcard the assembler should read. */
  path: string;
  /** Filename only — what run summaries and error messages should print. */
  name: string;
  motion: MotionVariant;
}

/**
 * Resolve the endcard for `kind` on `dateISO`.
 *
 * `needsBed` narrows the set to motions with a usable hum-bed window. It is the
 * carrier that decides this, not the endcard: a wall-to-wall carrier never beds,
 * so every motion is eligible; a short one does, so build-up motions with no
 * level-steady stretch drop out for that day. Passing it lets the same rotation
 * serve both cases without the caller knowing which motions can bed.
 */
export interface EndcardCandidate {
  /** Built filename to try. */
  name: string;
  motion: MotionVariant;
  /** True for the pre-MKT-19 unversioned build — the last-resort fallback. */
  legacy?: boolean;
}

/**
 * The ordered candidate list for a kind on a date — WITHOUT touching the disk
 * or exiting.
 *
 * Split out from `resolveEndcard` so `reel:check` can report on the same
 * ordering the assembler will walk without inheriting its abort. That matters:
 * a preflight whose job is to enumerate every problem must not `process.exit(1)`
 * on the first unresolvable kind, and a preflight that re-derived the ordering
 * itself could disagree with the assembler — which is the entire failure class
 * MKT-19 exists to close.
 */
export function endcardCandidates(
  assetsDir: string,
  kind: string,
  dateISO: string,
  needsBed = false,
  forceTag?: string,
): EndcardCandidate[] | null {
  const spec = ENDCARDS[kind];
  if (!spec) return null;
  const meta = readMotionMeta(assetsDir);
  const all = endcardMotionsFor(kind, dateISO, { needsBed, meta });
  const rotation = forceTag ? all.filter(m => m.tag === forceTag) : all;
  const out: EndcardCandidate[] = rotation.map(mv => ({ name: builtEndcardName(spec.out, mv.tag), motion: mv }));
  // Last resort: the pre-MKT-19 unversioned build. Present only until the
  // matrix has been built at least once; it keeps a half-migrated tree
  // assembling rather than failing on a naming change alone. Excluded under a
  // forced tag — the gate asks for one specific motion, and quietly handing it
  // the untagged build would make the gate report a combination it never ran.
  if (!forceTag) out.push({ name: spec.out, motion: { file: spec.motion, tag: 'legacy', label: 'unversioned build' }, legacy: true });
  return out;
}

export function resolveEndcard(
  assetsDir: string,
  kind: string,
  dateISO: string,
  needsBed = false,
  /**
   * Force a specific motion tag, bypassing the date rotation.
   *
   * Exists for the MKT-19 Phase 2 gate, which must exercise every
   * (stinger x endcard) combination against ONE real body — the date rotation
   * cannot deliver that, and faking dates would trip MKT-18's provenance guard,
   * which is the correct behaviour and not something to work around. Also useful
   * for re-assembling a specific combination for review.
   */
  forceTag?: string,
): ResolvedEndcard {
  const candidates = endcardCandidates(assetsDir, kind, dateISO, needsBed, forceTag);
  if (!candidates) {
    console.error(`ABORT: no endcard config for kind "${kind}" — known: ${Object.keys(ENDCARDS).join(', ')}.`);
    process.exit(1);
  }
  if (forceTag && !candidates.length) {
    console.error(`ABORT(${kind}): --endcard-motion=${forceTag} is not in the ${kind}'s tier set${needsBed ? ' (or is not bed-viable today)' : ''}.`);
    process.exit(1);
  }

  const tried: string[] = [];
  for (const c of candidates) {
    const p = join(assetsDir, c.name);
    if (existsSync(p)) {
      if (c.legacy) console.log(`NOTE(${kind}): no motion-tagged endcard found (tried ${tried.join(', ')}) — falling back to ${c.name}. Run npm run endcard:build.`);
      return { path: p, name: c.name, motion: c.motion };
    }
    tried.push(c.name);
  }

  console.error(
    `ABORT(${kind}): no endcard could be resolved. Tried ${tried.join(', ')}.\n` +
    `       A reel cannot assemble without a close. Run: npm run endcard:build ${kind}`,
  );
  process.exit(1);
}
