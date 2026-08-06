// MKT-09 — multi-part carrier support.
// MKT-20 — part 1 rotates, and the pairing became EXPLICIT.
//
// A carrier VO may be delivered as several ~10s parts rather than one long
// file, because the generator caps clip length. When parts are present they are
// concatenated, in order, into a single joined track that the assemblers and
// reel:check consume in place of the base file.
//
// Only AUDIO is joined: every consumer uses the carrier's audio and discards its
// video (the carriers are a static bolt on a purple field by design), so a bare
// .m4a is the correct artifact and avoids a pointless video re-encode.
//
// WHAT MKT-20 CHANGED. The pairing used to be derived from part 1's filename
// (`<base>` + `<base>_pt2`). It is now looked up per kind in carrier-config.ts,
// because rotating part 1 breaks derivation outright — and breaks it SILENTLY,
// into a published half-narration reel rather than an error. The reasoning is
// recorded in full at the head of that file; it is the ruling, not a preference.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CARRIERS, CARRIER_KINDS, type CarrierVariant } from './carrier-config';
import { laneRotate, laneIndex, ROTATION_SALT } from './reel-rotation';

export const CARRIER_CACHE = '_carrier_joined';

/**
 * Silence inserted at each part boundary, in seconds.
 *
 * The join was originally a pure butt-splice ("no gap inserted, no silence
 * trimmed") on the theory that any pause should be baked into the parts. In
 * practice the 2026-07-27 delivery landed part 2's first word only ~0.4s after
 * part 1's last word — because, under the then-17.0s ceiling, part 2 had been
 * asked to start early to save room. At this voice's unhurried pace 0.4s reads
 * as the next thought crowding the previous one. The ceiling has since widened
 * to 20.0s, so the room exists; this spends a little of it on the breath.
 *
 * Keep it small: it is charged against the joined-VO ceiling like any speech.
 *
 * ⚠ MKT-20 — THIS IS NOT THE AUDIBLE PAUSE. It is the silence this code INSERTS;
 * what a listener hears is 0.35s plus whatever tail part 1 already carries.
 * Measured across the All-Day rotation that lands between 0.586s and 0.777s, so
 * the breath varies by ~0.19s depending on which variant the date draws. Both
 * extremes are bracketed by assets that already ship, so this is recorded rather
 * than corrected — but do not read "the seam is 0.35s" as exact.
 */
export const SEAM_GAP = 0.35;

/**
 * How far a carrier may fall SHORT of the voice window and still be treated as
 * wall-to-wall ("overlap mode") rather than switching to hum-bed mode.
 *
 * `overlap = carrierDur >= voiceWindow - OVERLAP_EPSILON`
 *
 * ⚠ EXACT EQUALITY RESOLVES TO OVERLAP, and that is a decision, not an accident
 * of `>=`. Overlap is the safe side: it plays the voice wall-to-wall and needs
 * no hum bed at all, whereas hum-bed mode has a failure path (a motion with no
 * usable bed — MKT-19). When the two are indistinguishable, take the branch that
 * cannot abort.
 *
 * WHY THIS IS NAMED RATHER THAN INLINE (MKT-21 Phase 0). A ~20.0s body puts the
 * comparison at exact equality: bodyDur 20.010 → voiceWindow 20.410 → threshold
 * 20.360, against a joined carrier of exactly 20.360. It currently resolves to
 * overlap — but on a tie, and a tie is not a margin. A body 0.01s longer, or a
 * carrier a few milliseconds shorter after a re-encode or container rewrite,
 * flips the whole reel into hum-bed mode silently. Today's live bodies are 19.0s
 * so there is ~1.0s of slack and nothing is at risk; this exists so that the day
 * a body approaches the carrier length, the mode is something someone chose.
 *
 * `carrierBoundarySlack()` reports the distance to the flip so preflight can warn
 * before the coin lands the other way.
 */
export const OVERLAP_EPSILON = 0.05;

/** Seconds of headroom before `overlap` flips. Negative = already hum-bed. */
export function carrierBoundarySlack(carrierDur: number, voiceWindow: number): number {
  return +(carrierDur - (voiceWindow - OVERLAP_EPSILON)).toFixed(4);
}

/** True when the carrier is close enough to the flip to be worth reporting. */
export const BOUNDARY_WARN_AT = 0.05;

export interface ResolvedCarrier {
  /** Path the assembler should actually read. */
  path: string;
  /** Every part in play order (length 1 when the kind has no continuation). */
  parts: string[];
  /** True when `path` is a generated join rather than a delivered file. */
  joined: boolean;
  /** Which part-1 variant the date selected — printed in the run summary. */
  variant: CarrierVariant;
}

/**
 * Part-1 candidates for a kind on a date, in preference order.
 *
 * Ordered list rather than one pick, same shape as every other lane, so a
 * missing variant drops for that day and the next candidate is used. Entry 0 of
 * the configured set is appended as the last resort, which makes the incumbent
 * the floor: an empty or fully-missing rotation still resolves to the file that
 * has been shipping.
 */
export function carrierCandidates(kind: string, dateISO: string, forceFile?: string): CarrierVariant[] {
  const spec = CARRIERS[kind];
  if (!spec) return [];
  if (forceFile) return spec.set.filter(v => v.file === forceFile || v.file === `${forceFile}.mp4`);
  // Spread across kinds, not just across dates — see CARRIER_KINDS for the
  // lockstep collapse this closes and for why the axis lists only rotating
  // kinds. Was `rotateByDate` (no kind index) from MKT-20 until 2026-08-06.
  const ordered = laneRotate(spec.set, dateISO, ROTATION_SALT.carrier, laneIndex(CARRIER_KINDS, kind));
  const incumbent = spec.set[0];
  if (incumbent && !ordered.some(v => v.file === incumbent.file)) ordered.push(incumbent);
  return ordered;
}

/** Continuation parts a kind REQUIRES. Empty for genuine single-part carriers. */
export function carrierRest(kind: string): string[] {
  return CARRIERS[kind]?.rest ?? [];
}

/**
 * A `<part1>_pt<N>.mp4` on disk that the config does not declare.
 *
 * MKT-09 had `orphanedParts` for the same job under derivation. Explicit pairing
 * removes the old failure (an unreachable part behind a gap) but introduces a
 * new one: a delivered continuation that nobody added to the config is simply
 * ignored, and the reel ships missing that narration. The `_pt<N>` naming makes
 * the intent unambiguous, so this stays a FAIL rather than degrading into the
 * general stray WARN.
 */
export function undeclaredParts(assetsDir: string, kind: string): string[] {
  const spec = CARRIERS[kind];
  if (!spec) return [];
  const declared = new Set(spec.rest);
  const out: string[] = [];
  for (const v of spec.set) {
    const stem = v.file.replace(/\.mp4$/, '');
    for (let n = 2; n <= 9; n++) {
      const f = `${stem}_pt${n}.mp4`;
      if (existsSync(join(assetsDir, f)) && !declared.has(f)) out.push(f);
    }
  }
  return out;
}

/**
 * Resolve the carrier for `kind` on `dateISO`.
 *
 * A missing PART 1 drops that variant and the walk continues. A missing declared
 * CONTINUATION is different and does not degrade: it would convert the reel to
 * hum-bed mode and publish half a narration, so it aborts here and is a FAIL at
 * preflight. That asymmetry is the whole point of MKT-20.
 */
export function resolveCarrier(
  assetsDir: string,
  kind: string,
  dateISO = '',
  forceFile?: string,
  /**
   * MKT-27 — usable VO window in seconds, for kinds whose continuation must play
   * WHOLE or not at all. Omit to get the pre-MKT-27 behaviour exactly.
   *
   * ⚠ THIS IS DELIBERATELY OPT-IN, because "the carrier is longer than the
   * window" means opposite things in the two lanes. For a SLATE reel it is
   * normal and intended: those carriers are written wall-to-wall and the
   * assembler discards the tail after the voice has already finished ("carrier
   * content beyond 20.26s discarded"). For VERIFY it is a hazard: the body is
   * data-adaptive (MKT-27), so the window moves day to day, and part 2 is a
   * short fixed sign-off — a window 1s shy of the join does not clip a designed
   * tail, it cuts the sign-off mid-word.
   *
   * So verify passes its need and takes part 1 alone on days the sign-off will
   * not fit; every other kind passes nothing and is unaffected.
   */
  needSec?: number,
): ResolvedCarrier {
  const spec = CARRIERS[kind];
  if (!spec) {
    console.error(`ABORT: no carrier config for kind "${kind}" — known: ${Object.keys(CARRIERS).join(', ')}.`);
    process.exit(1);
  }
  const candidates = carrierCandidates(kind, dateISO, forceFile);
  if (forceFile && !candidates.length) {
    console.error(`ABORT(${kind}): --carrier=${forceFile} is not in this kind's set — known: ${spec.set.map(v => v.file).join(', ')}.`);
    process.exit(1);
  }

  const tried: string[] = [];
  let variant: CarrierVariant | undefined;
  for (const v of candidates) {
    if (existsSync(join(assetsDir, v.file))) { variant = v; break; }
    tried.push(v.file);
  }
  if (!variant) {
    console.error(
      `ABORT(${kind}): no carrier part 1 could be resolved. Tried ${tried.join(', ')}.\n` +
      `       The carrier IS the voiceover — a reel cannot assemble without it.`,
    );
    process.exit(1);
  }
  if (tried.length) {
    console.log(`NOTE(${kind}): carrier ${tried.join(', ')} not delivered — dropped from today's rotation, using ${variant.file}.`);
  }

  // Declared continuations are REQUIRED. Silently proceeding with part 1 alone
  // is the exact MKT-20 failure: a 10s carrier, hum-bed mode, and a published
  // reel with half its narration missing.
  const missing = spec.rest.filter(f => !existsSync(join(assetsDir, f)));
  if (missing.length) {
    console.error(
      `ABORT(${kind}): carrier continuation missing — ${missing.join(', ')}.\n` +
      `       Proceeding on part 1 alone would publish a reel with roughly half its narration\n` +
      `       replaced by hum bed, and nothing would error. Run npm run reel:check.`,
    );
    process.exit(1);
  }

  // MKT-27 fits-whole gate (opt-in via needSec — see the parameter's note).
  // Walk: full continuation → short continuation → part 1 alone. Each step
  // plays WHOLE or not at all; the short slot (restShort, optional and never
  // required on disk) exists to close the ~5.7s silent tail the full sign-off
  // leaves behind on the days it cannot fit.
  let rest = spec.rest;
  let shortUsed = false;
  if (needSec != null && rest.length) {
    const joinDurOf = (files: string[]) => {
      const ps = [join(assetsDir, variant.file), ...files.map(f => join(assetsDir, f))];
      return ps.reduce((s, p) => s + audioDur(p), 0) + SEAM_GAP * (ps.length - 1);
    };
    const fullDur = joinDurOf(rest);
    if (fullDur > needSec + BOUNDARY_WARN_AT) {
      const short = (spec.restShort ?? []).length &&
        (spec.restShort ?? []).every(f => existsSync(join(assetsDir, f)))
        ? spec.restShort! : null;
      const shortDur = short ? joinDurOf(short) : null;
      if (short && shortDur != null && shortDur <= needSec + BOUNDARY_WARN_AT) {
        console.log(
          `NOTE(${kind}): full continuation does not fit (${fullDur.toFixed(2)}s vs ` +
          `${needSec.toFixed(2)}s window) — using SHORT sign-off ${short.join(', ')} ` +
          `(join ${shortDur.toFixed(2)}s).`,
        );
        rest = short;
        shortUsed = true;
      } else {
        console.log(
          `NOTE(${kind}): continuation DROPPED for this run — the join is ${fullDur.toFixed(2)}s ` +
          `against a ${needSec.toFixed(2)}s window, so it would be cut ${(fullDur - needSec).toFixed(2)}s ` +
          `short of the end.${short ? '' : spec.restShort?.length ? ' (Short sign-off declared but not delivered.)' : ''} ` +
          `Part 1 alone; the tail plays in silence rather than mid-word.`,
        );
        const p1 = join(assetsDir, variant.file);
        return { path: p1, parts: [p1], joined: false, variant };
      }
    }
  }

  const parts = [join(assetsDir, variant.file), ...rest.map(f => join(assetsDir, f))];
  if (parts.length <= 1) return { path: parts[0], parts, joined: false, variant };

  const cacheDir = join(assetsDir, CARRIER_CACHE);
  mkdirSync(cacheDir, { recursive: true });
  // Keyed on the PART-1 variant, so the four All-Day pro joins coexist instead
  // of overwriting each other under a shared kind-level name. The short join
  // gets its own suffix — full and short must never share a cache entry.
  const out = join(cacheDir, `${basename(variant.file, '.mp4')}_joined${shortUsed ? '_short' : ''}.m4a`);

  const stale =
    !existsSync(out) ||
    parts.some(p => statSync(p).mtimeMs > statSync(out).mtimeMs);

  if (stale) {
    // aformat per input: the concat filter requires every input to share a
    // sample rate and channel layout, and generated clips routinely differ.
    // SEAM_GAP is appended to every part except the last (see the constant).
    const inputs = parts.map(p => `-i "${p}"`).join(' ');
    const pre = parts
      .map((_, i) =>
        `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,aresample=48000` +
        (i < parts.length - 1 && SEAM_GAP > 0 ? `,apad=pad_dur=${SEAM_GAP}` : '') +
        `[a${i}];`)
      .join('');
    const chain = parts.map((_, i) => `[a${i}]`).join('');
    execSync(
      `ffmpeg -y -loglevel error ${inputs} -filter_complex "${pre}${chain}concat=n=${parts.length}:v=0:a=1[a]" ` +
        `-map "[a]" -c:a aac -b:a 192k -ar 48000 -movflags +faststart "${out}"`,
      { stdio: 'inherit' },
    );
  }

  return { path: out, parts, joined: true, variant };
}

/** ffprobe duration in seconds, or NaN. */
export function audioDur(path: string): number {
  return parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`).toString().trim(),
  );
}
