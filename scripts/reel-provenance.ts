// MKT-18 — body provenance: the capture date travels INSIDE the body file.
//
// WHY THIS EXISTS. The MKT-07 stamp chip claims it "can never disagree with the
// on-screen data" because both derive from the same `stamp` argument. That was
// only ever true because the renderer and the assembler are normally run as a
// pair on the same date. The assembler itself verified nothing: it took the
// stamp from argv, checked that `ui_<scope>_<stamp>.mp4` merely EXISTED, and
// burned that date onto whatever those pixels were. So the guarantee rested on
// a FILENAME, and a filename is the one thing in this pipeline that has already
// proven itself unreliable twice (MKT-06's 2-byte rename, MKT-16's `_pt_`).
//
// It bit on 2026-07-28: `ui_allday_20260728.mp4` was copied to the 7/29 and
// 7/30 names to exercise the MKT-17 intro rotation, and the assembler produced
// a clean, well-formed reel of TUESDAY's six signals wearing a "WED · JUL 29"
// chip. Nothing errored, nothing looked wrong, and there was no 7/29 slate in
// the database at all. Publishing one would have shown subscribers the wrong
// day's board — precisely the failure the stamp was introduced to prevent.
//
// WHY NOT JUST QUERY THE SLATE. Asserting "a slate exists for the stamp date"
// catches that specific incident and no more: once tomorrow's slate lands, a
// copied body passes the check again. The real invariant is narrower —
// THE STAMP DATE MUST EQUAL THE DATE THE BODY WAS CAPTURED FOR — and only the
// body can answer that. So the renderer writes the date it captured into the
// file's own container metadata, and the assembler reads it back. Copying or
// renaming a body now carries the original date with it.
//
// Cost is a metadata tag; no re-encode, no sidecar to lose, survives a move.
import { execSync } from 'node:child_process';

/** Container tag holding the ISO date the body was captured for. */
export const DATE_TAG = 'hm_reel_date';

/**
 * MKT-26 — container tag recording whether the capture was REDACTED.
 *
 * Same argument as the date tag, applied to the other property of a body that
 * cannot be recovered by looking at the filename. Until MKT-26 there was exactly
 * one body per scope and both variants read it, so `--redact` could not be
 * expressed in the pipeline at all: `reel:midday` rendered a full-fidelity board
 * and the assembler handed it to every variant. Enabling the free session
 * variant on top of that would have published the UNREDACTED board to the free
 * group — while preflight reported 0 fail, because preflight validates assets,
 * not what is inside the capture.
 *
 * A filename could carry this (`ui_midday_free_…`), and it does — but a filename
 * is the one thing in this pipeline that has proven unreliable three times now
 * (MKT-06's rename, MKT-16's `_pt_`, MKT-18's copied body). The tag is what makes
 * the assertion about the PIXELS rather than the path.
 */
export const REDACT_TAG = 'hm_reel_redacted';

/**
 * MKT-15 P2 — container tag recording that a capture is the PUBLIC cut
 * (redacted AND relabelled). Written now so every public body carries it from
 * day one; the MKT-16 public assembler must assert it the same way the free
 * session kinds assert REDACT_TAG — a redacted-but-not-relabelled body posing
 * as public would carry tier-1 vocabulary onto a public feed.
 */
export const PUBLIC_TAG = 'hm_reel_public';

/**
 * ffmpeg args that stamp `dateISO` into the output. Append before the path,
 * and do NOT pass a separate `-movflags` — this emits its own.
 *
 * `use_metadata_tags` IS LOAD-BEARING AND NON-OBVIOUS. The mp4 muxer only
 * writes keys from its own standard set and silently DROPS arbitrary ones, so
 * `-metadata hm_reel_date=…` alone produces a file with no tag, no warning and
 * exit 0. Caught in test: every body would have carried nothing, `readProvenance`
 * would have returned null forever, and `assertBodyDate` would have taken its
 * "untagged, warn and continue" path on every single run — a guard that reads
 * as present in the source and protects nothing. `+faststart` is re-declared
 * here because movflags is one combined option; splitting it across two flags
 * means the last one wins and the other is lost.
 */
export function provenanceArgs(dateISO: string, redacted = false, isPublic = false): string {
  return `-movflags +faststart+use_metadata_tags -metadata ${DATE_TAG}="${dateISO}"` +
    ` -metadata ${REDACT_TAG}="${redacted ? '1' : '0'}"` +
    (isPublic ? ` -metadata ${PUBLIC_TAG}="1"` : '');
}

/** The capture date recorded in `file`, or null if it carries no tag. */
export function readProvenance(file: string): string | null {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format_tags=${DATE_TAG} -of default=nw=1:nk=1 "${file}"`,
    ).toString().trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/**
 * Assert a body was captured for the date about to be stamped on it.
 *
 * MISMATCH is fatal — that is a reel about to claim the wrong day, and there is
 * no reading of it that is safe to publish.
 *
 * MISSING is a warning, not an error, and deliberately so: bodies rendered
 * before this tag existed carry nothing, and hard-failing on them would break
 * a re-assembly of any earlier day for no safety gain. It degrades to exactly
 * the old behaviour, which is the correct floor. The warning names the fix so
 * the untagged population drains rather than becoming permanent.
 */
export function assertBodyDate(file: string, stampISO: string, rerunCmd: string): void {
  const captured = readProvenance(file);
  if (captured === null) {
    console.log(
      `NOTE: ${file.split('/').pop()} carries no ${DATE_TAG} tag (rendered before MKT-18) — ` +
      `cannot verify it was captured for ${stampISO}. Re-render to get the guarantee: ${rerunCmd}`,
    );
    return;
  }
  if (captured !== stampISO) {
    console.error(
      `ABORT: ${file.split('/').pop()} was captured for ${captured}, but this run would stamp it ${stampISO}.\n` +
      `       The reel would show ${captured}'s board under a ${stampISO} date chip. If the body was copied or\n` +
      `       renamed, delete it and render the real one: ${rerunCmd}`,
    );
    process.exit(1);
  }
}

/** '1' as recorded in `file`, or null if it carries no PUBLIC_TAG. */
export function readPublic(file: string): boolean | null {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format_tags=${PUBLIC_TAG} -of default=nw=1:nk=1 "${file}"`,
    ).toString().trim();
    return out === '1' ? true : null;
  } catch {
    return null;
  }
}

/**
 * MKT-16 — assert a body IS the public cut before a public kind consumes it.
 *
 * There is no lenient direction here at all: this is only ever called for a
 * kind that requires the public capture, and an absent tag means the file is
 * NOT one (the renderer has written PUBLIC_TAG on every public body since the
 * mode existed — there is no untagged-but-public generation to grandfather).
 * A redacted-but-not-relabelled body posing as public would carry tier-1
 * vocabulary onto a public feed, which is the failure this lane exists to
 * prevent. Callers assert redaction separately (the public cut is redact +
 * relabel; both tags must hold).
 */
export function assertBodyPublic(file: string, rerunCmd: string): void {
  if (readPublic(file) === true) return;
  console.error(
    `ABORT: ${file.split('/').pop()} carries no ${PUBLIC_TAG} tag, but this kind requires the PUBLIC\n` +
    `       (redacted + relabelled) capture. A non-public body here would put tier-1 vocabulary on a\n` +
    `       public feed. Render the public cut: ${rerunCmd}`,
  );
  process.exit(1);
}

/** '1' | '0' as recorded in `file`, or null if it carries no tag. */
export function readRedacted(file: string): boolean | null {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format_tags=${REDACT_TAG} -of default=nw=1:nk=1 "${file}"`,
    ).toString().trim();
    return out === '1' ? true : out === '0' ? false : null;
  } catch {
    return null;
  }
}

/**
 * Assert a body's redaction state matches what the kind about to consume it
 * requires.
 *
 * ⚠ THE MISSING-TAG CASE IS ASYMMETRIC ON PURPOSE, and that asymmetry is the
 * whole safety property. MKT-18 could treat an untagged body as "warn and
 * continue" because the worst case was an unverifiable date. Here the two
 * directions are not comparable:
 *
 *   • expected NOT redacted, tag missing → fine. Every body rendered before
 *     MKT-26 is a full-fidelity capture, so absence means exactly what the
 *     caller expects. Degrades to the old behaviour, which is the correct floor.
 *   • expected REDACTED, tag missing → FATAL. Absence means the body predates
 *     the tag, and every such body is full-fidelity. Warning and continuing here
 *     publishes the unredacted board to the free group, which is the failure
 *     this lane exists to prevent. There is no reading of an untagged body that
 *     is safe to treat as redacted.
 *
 * A tag that is present and WRONG is fatal in both directions — that is a body
 * whose pixels disagree with the kind consuming them.
 */
export function assertBodyRedaction(file: string, expected: boolean, rerunCmd: string): void {
  const actual = readRedacted(file);
  const name = file.split('/').pop();
  if (actual === expected) return;
  if (actual === null && !expected) {
    console.log(
      `NOTE: ${name} carries no ${REDACT_TAG} tag (rendered before MKT-26) — assuming full-fidelity, ` +
      `which is what every pre-MKT-26 body is. Re-render for the guarantee: ${rerunCmd}`,
    );
    return;
  }
  console.error(
    actual === null
      ? `ABORT: ${name} carries no ${REDACT_TAG} tag, but this kind requires a REDACTED body.\n` +
        `       An untagged body predates MKT-26 and is full-fidelity — assembling it would publish the\n` +
        `       board's digits to the free group. Render the redacted capture: ${rerunCmd}`
      : `ABORT: ${name} is ${actual ? 'REDACTED' : 'FULL-FIDELITY'}, but this kind requires a ` +
        `${expected ? 'REDACTED' : 'FULL-FIDELITY'} body.\n` +
        `       Render the right capture: ${rerunCmd}`,
  );
  process.exit(1);
}
