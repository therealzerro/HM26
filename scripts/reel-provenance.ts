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
export function provenanceArgs(dateISO: string): string {
  return `-movflags +faststart+use_metadata_tags -metadata ${DATE_TAG}="${dateISO}"`;
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
