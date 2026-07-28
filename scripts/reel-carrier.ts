// MKT-09 — multi-part carrier support.
//
// A carrier VO may be delivered as several ~10s parts rather than one long
// file, because the generator caps clip length:
//
//   allday_pro_carrier.mp4  +  allday_pro_carrier_pt2.mp4  [+ _pt3 ...]
//
// When parts are present they are concatenated, in order, into a single joined
// track that the assemblers and reel:check consume in place of the base file.
// Only AUDIO is joined: every consumer uses the carrier's audio and discards
// its video (the carriers are a static bolt on a purple field by design), so a
// bare .m4a is the correct artifact and avoids a pointless video re-encode.
//
// With no _pt2 on disk this returns the base path untouched, so a single-file
// carrier behaves byte-identically to before this file existed.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
 */
export const SEAM_GAP = 0.35;

export interface ResolvedCarrier {
  /** Path the assembler should actually read. */
  path: string;
  /** Every part found, in play order (length 1 when there is no _pt2). */
  parts: string[];
  /** True when `path` is a generated join rather than a delivered file. */
  joined: boolean;
}

/** Parts for `base` in play order: base.mp4, base_pt2.mp4, base_pt3.mp4, ... */
export function carrierParts(assetsDir: string, base: string): string[] {
  const first = join(assetsDir, `${base}.mp4`);
  if (!existsSync(first)) return [];
  const parts = [first];
  // Stops at the first gap on purpose — a missing _pt2 with a stray _pt3 is a
  // delivery error, and silently skipping it would ship a reel with a hole in
  // the narration. reel:check reports the gap.
  for (let n = 2; ; n++) {
    const p = join(assetsDir, `${base}_pt${n}.mp4`);
    if (!existsSync(p)) break;
    parts.push(p);
  }
  return parts;
}

/** A _ptN that exists but is unreachable because an earlier part is missing. */
export function orphanedParts(assetsDir: string, base: string): string[] {
  const reachable = new Set(carrierParts(assetsDir, base));
  const orphans: string[] = [];
  for (let n = 2; n <= 9; n++) {
    const p = join(assetsDir, `${base}_pt${n}.mp4`);
    if (existsSync(p) && !reachable.has(p)) orphans.push(p);
  }
  return orphans;
}

/**
 * Resolve the carrier to read for `base` ('allday_pro_carrier', 'verif_carrier',
 * …). Concatenates delivered parts when there is more than one; the join is
 * cached and rebuilt only when a part is newer than it.
 */
export function resolveCarrier(assetsDir: string, base: string): ResolvedCarrier {
  const parts = carrierParts(assetsDir, base);
  if (parts.length <= 1) {
    return { path: join(assetsDir, `${base}.mp4`), parts, joined: false };
  }

  const cacheDir = join(assetsDir, CARRIER_CACHE);
  mkdirSync(cacheDir, { recursive: true });
  const out = join(cacheDir, `${base}_joined.m4a`);

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

  return { path: out, parts, joined: true };
}

/** ffprobe duration in seconds, or NaN. */
export function audioDur(path: string): number {
  return parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`).toString().trim(),
  );
}
