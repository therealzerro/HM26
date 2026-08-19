// MKT-02 Phase 2 — daily "Yesterday's Receipts" reel assembly.
//
//   [0.0-1.2s] bolt open: settled lockup frame from verif_endcard.mp4 tail,
//              1.2s smoothstep-eased dissolve into the UI segment's frame 0.
//              (Chosen over the endcard's first 1.2s, which is smoke only —
//              the bolt hasn't formed yet; a formation cut joined poorly.)
//   [1.2-7.5s] ui_verify_YYYYMMDD.mp4 (6.3s, from render-verification-reel).
//   [then]     the endcard's FIRST 6.5s as a true outro (MKT-31 addendum) —
//              formation fills the frame, text fades in 4.5-5.2s, settled
//              hold to the cut. The old window was the LAST 2.5s: a hard cut
//              to the settled composition, whose bolt ends ~y756 while the
//              text band starts 1150 — ~500px of static dead frame on every
//              proven motion, which is why the close read as stranded. The
//              endcard's audio stays unused (verify's ruling: carrier, then
//              silence); the settled tail frame still serves the legacy open.
//   Audio:     verif_carrier.mp4 track across the full 10.0s, -14 LUFS,
//              10ms de-click edge fades — no other sound.
//
// MKT-08: when assets/marketing/anchor_intro.mp4 is present it REPLACES the
// bolt open — intro plays full length (own audio), final smoke dissolves
// (0.8s) into the UI segment, carrier enters 0.4s before the dissolve
// completes and covers the rest. Total becomes introDur + 8.8s. Missing or
// unusable intro → legacy 10.0s reel, identical output (scripts/reel-intro.ts).
//
// Usage: tsx scripts/assemble-verification-reel.ts [YYYYMMDD]
//   (defaults to yesterday ET; expects ui_verify_<stamp>.mp4 already rendered)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { assertBodyDate, assertBodyPublic } from './reel-provenance';
import { resolveEndcard } from './reel-endcard';
import { CHIP_LABELS } from './intro-chip-config';
import { join, resolve } from 'node:path';
import { probeAnchorIntro, INTRO_DISSOLVE, INTRO_VO_LEAD } from './reel-intro';
import { resolveCarrier, audioDur } from './reel-carrier';
import { probeStinger, stingerAdds } from './reel-stinger';
import { STINGER_DUR, INTRO_XFADE } from './stinger-config';
import { COVER_LIFT_SECONDS } from './render-verify-slate';

const ASSETS = resolve('assets/marketing');
const REELS = join(ASSETS, 'verify_reels');

/**
 * ⚠ NO `timeZone` ON THE OUTPUT FORMAT — see the long note on the identical
 * function in render-verification-reel.ts. Line 1 already rebases into ET
 * wall-clock, so formatting with the timezone shifts a second time and returns
 * D−2 below 04:00 ET. Fixed 2026-08-01, when this and the renderer agreed on
 * 07-30 while publish-reels correctly wanted 07-31 — the renderer, the
 * assembler and the publisher must all compute the same day.
 */
function yesterdayET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('en-CA').replace(/-/g, '');
}
function todayET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return now.toLocaleDateString('en-CA').replace(/-/g, '');
}

// MKT-40: `--variant=public` assembles the PUBLIC grading half — masked body,
// public intro, its own endcard copy — sharing verify's carrier, stinger
// (seal) and ribbon. Everything else in this file is common to both kinds.
const PUBLIC = process.argv.includes('--variant=public');
// MKT-62 — `--kind=verify_midday`: the SAME-DAY MIDDAY VERIFY. A new KIND, not
// a variant: today's date, its own FIXED set (rise intro / sameday carrier /
// sameday endcard — pinned, never pooled), NO STINGER by ruling (the chip
// identifies at frame one; the standing-Anchor beat lands straight into the
// covered board; the 1-box floor day measured 63.8% with one = the number that
// barred verify's stinger), free group only.
const MIDDAY = process.argv.includes('--kind=verify_midday');
if (MIDDAY && PUBLIC) { console.error('ABORT: verify_midday has no public variant (MKT-62 ruling).'); process.exit(1); }
const KIND = MIDDAY ? 'verify_midday' : PUBLIC ? 'verify_public' : 'verify';
const stamp = process.argv.slice(2).find(a => !a.startsWith('--')) ?? (MIDDAY ? todayET() : yesterdayET());
const ui = join(REELS, MIDDAY ? `ui_verify_midday_${stamp}.mp4` : `ui_verify${PUBLIC ? '_public' : ''}_${stamp}.mp4`);
if (!existsSync(ui)) {
  console.error(`ABORT: ${ui} not found — run the render step first (${MIDDAY ? 'npm run reel:verify-midday' : 'npm run reel:verify'}).`);
  process.exit(1);
}
// MKT-18: the check above validates a FILENAME, not the pixels. Verify had the
// identical gap as the slate assembler — a body copied to another day's name
// would be stamped with that day's "✓ VERIFIED RESULTS" chip, which on a
// receipts reel means publishing one day's outcomes as another's.
assertBodyDate(ui, `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`, MIDDAY ? 'npm run reel:verify-midday' : 'npm run reel:verify');
// MKT-40: a full-fidelity body posing as public would carry real digits onto
// a public feed — the tag is written by the renderer's --public path only.
if (PUBLIC) assertBodyPublic(ui, 'tsx scripts/render-verification-reel.ts --public');
// MKT-19: the two reads below were inline `verif_endcard.mp4` literals — the
// close AND the legacy fallback open, which takes the endcard's final frame.
// Both now resolve through the shared resolver. Verify never uses a hum bed (its
// soundtrack is verif_carrier), so needsBed is false.
const vEndcard = resolveEndcard(ASSETS, KIND, `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}`, false);
console.log(`NOTE(${KIND}): endcard motion → ${vEndcard.motion.label} [${vEndcard.name}].`);
const outBase = MIDDAY ? `verify_midday_${stamp}` : PUBLIC ? `verify_public_${stamp}` : `verify_reel_${stamp}`;
const out = join(REELS, `${outBase}.mp4`);
const out1x1 = join(REELS, `${outBase}_1x1.mp4`);
const bolt = join(REELS, `_bolt_lockup.png`);
const sheet = join(REELS, `${outBase}_contact.png`);
const sh = (c: string) => execSync(c, { stdio: 'inherit' });

// xfade P counts DOWN 1→0 — ease on q=(1-P) so the dissolve runs bolt→ui.
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`;

// MKT-07 slate stamp: "✓ VERIFIED RESULTS" + yesterday's date, burned over the
// UI segment (cross-scope page, so no scope tag). Overlay layer only — the
// rotating carrier/endcard assets stay date-agnostic.
// MKT-62: the same-day kind has its own ribbon purpose (TODAY'S MIDDAY ·
// GRADED) — verify's YESTERDAY'S RECEIPTS is wrong on it. Own PNG name too, so
// a same-stamp verify re-run never picks up the other kind's ribbon.
const stampPng = join(REELS, MIDDAY ? `_stamp_midday_${stamp}.png` : `_stamp_${stamp}.png`);
sh(`npx tsx scripts/render-reel-stamp.ts ${MIDDAY ? 'verify_midday' : 'verify'} ${stamp} - "${stampPng}"`);

const uiDur = +parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${ui}"`).toString()).toFixed(2);
// Board segment length — F_SLATE's 2.5s, plus the cover-lift on verify_midday.
const BOARD_SEG = 2.5 + (MIDDAY ? COVER_LIFT_SECONDS : 0);
// MKT-31 addendum: the outro takes the endcard's FIRST 6.5s (All-Day's proven
// window) instead of its last 2.5s. 6.5 covers formation + text fade (4.5-5.2)
// + a settled hold, and matches assemble-allday-reels' CARD.
const CARD = 6.5;
// ⚠ THE INTRO IS DELIBERATELY DATE-LESS AND THE STINGER IS NOT. Verify draws a
// FIXED intro by MKT-17 ruling (its own anchor_intro_verify.mp4, never a
// rotation member), so passing a date here would be wrong. The stinger has no
// such ruling — and omitting the date was a real divergence, caught by preflight
// on 2026-07-29: `reel:check` reported "verify stinger selection → imprint"
// while this assembler was resolving the unversioned fallback, because
// stingerCandidates builds its rotation from dateISO and gets an empty list
// without one. Preflight reporting a beat the assembler will not use is exactly
// the failure the "check the RESOLVED file, not the incumbent" rule exists to
// prevent, so verify now rotates like every other kind.
// MKT-40: the public half opens on the cold-audience public intro; the group
// half keeps verify's own fixed file. Both are FIXED_INTRO entries.
const intro = probeAnchorIntro(ASSETS, KIND);
// MKT-12 wired this; MKT-27 ENABLED it, once the readable-holds body made the
// branding ratio defensible (64% → 44%). See stinger-config for the ordering.
// MKT-40: DELIBERATELY 'verify' for both kinds — verify_public SHARES the
// built stinger files (identical text "HITMASTER ZK6 / YESTERDAY'S RECEIPTS",
// same seal pin, same headline-dominant layout). A per-kind build here would
// duplicate byte-identical clips and widen the stray-scan surface for nothing.
// MKT-62: NO STINGER on verify_midday — a ruling, not a missing asset. Stated
// here rather than as an absent STINGERS entry so nobody "fixes" it by adding
// one: ratio (63.8% on the 1-box floor day = the barred number), the chip
// already identifies at frame one, and intro → covered board reads better
// direct than through a branded interstitial.
const sting = MIDDAY ? null : probeStinger(ASSETS, 'verify', `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}`);
const openBase = intro ? intro.dur : 1.2;
const openDur = +(openBase + stingerAdds(sting)).toFixed(2);
const dissolve = intro ? INTRO_DISSOLVE : 1.2;
const total = +(openDur + uiDur + CARD).toFixed(2);
const voiceStart = intro ? +(openDur - INTRO_VO_LEAD).toFixed(2) : 0;
// uiDur + CARD + INTRO_VO_LEAD. ⚠ The wider window changes pt2 eligibility:
// days whose join was dropped against the old uiDur+2.5 window can now take it
// whole, so the sign-off plays out over the endcard formation — ending before
// the lockup settles (text opaque at openDur+uiDur+5.2).
const carrierNeed = +(total - voiceStart).toFixed(2);
// MKT-27: THE CARRIER NO LONGER COVERS THE WHOLE REEL, AND THAT IS A RULING, NOT
// A BUG. The readable-holds rewrite put the body at 8.6-14.0s, so `carrierNeed`
// (11.5-16.9s) now exceeds the 10.005s verif_carrier on every day. The atrim
// below simply yields the whole track and the reel plays out under the closing
// holds in silence — the operator's stated option, on the grounds that on a
// receipts reel the footage is the argument.
//
// Two consequences worth stating rather than discovering:
//   • The gap is INDEPENDENT OF THE STINGER. carrierNeed derives from uiDur and
//     the VO lead, not from openDur, and the stinger carries its own audio over
//     the intro — so enabling it does not widen the silence by a frame.
//   • apad in the filtergraph is what keeps the AUDIO STREAM as long as the
//     container. Without it the stream ended ~6.5s early, which is legal mp4 but
//     is the kind of thing a platform transcoder is entitled to mishandle.
// `verif_carrier_pt2` (landed 2026-07-29) closes most of it — see below.
//
// MKT-09/MKT-20: resolved from the carrier registry by KIND.
// MKT-27: `carrierNeed` is passed so the pt2 sign-off plays WHOLE or is dropped
// — see resolveCarrier's needSec note for why verify is the only kind that does.
// MKT-40: 'verify' for both kinds — the carrier pair is SHARED (Phase 0 free
// win: the spoken lines transcribe Q2-clean at tier 1, so the public half
// costs zero generation).
// MKT-62: verify_midday resolves ITS OWN pinned carrier (set of one, no pt2).
const verifCarrier = resolveCarrier(
  ASSETS, MIDDAY ? 'verify_midday' : 'verify', `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}`, undefined, carrierNeed,
);
if (verifCarrier.joined) {
  console.log(`NOTE: carrier joined from ${verifCarrier.parts.length} parts (${verifCarrier.parts.map(p => p.split('/').pop()).join(' + ')}).`);
}
// Report the ACTUAL uncovered tail, from the carrier that resolved rather than
// from an assumed part-1 length — the whole point of the pt2 lane is that this
// number changes, and a hardcoded 10.005 would keep printing the old gap.
{
  const covered = Math.min(audioDur(verifCarrier.path), carrierNeed);
  const gap = +(carrierNeed - covered).toFixed(2);
  console.log(
    gap > 0.05
      ? `NOTE(${KIND}): VO covers ${(voiceStart + covered).toFixed(2)}s of a ${total}s reel — ` +
        `the last ${gap.toFixed(2)}s carries the endcard's own audio (MKT-41; it was silence until then).`
      : `NOTE(${KIND}): VO covers the full ${total}s reel (${verifCarrier.joined ? 'joined' : 'single-part'} carrier).`,
  );
}
// MKT-22: intro identity chip — "YESTERDAY'S RESULTS", green accent to match
// the verify stamp. Only with an intro active; the legacy open is a bolt still.
// MKT-35: dated from `stamp` — which for verify IS yesterday (the receipts'
// content date, provenance-asserted above), so the chip's date line agrees
// with its own YESTERDAY'S RESULTS heading and distinguishes the save from
// the same morning's All-Day drop in a camera roll.
const chipPng = intro && CHIP_LABELS[KIND] ? join(REELS, `_chip_${KIND}_${stamp}.png`) : null;
if (chipPng) sh(`npx tsx scripts/render-intro-chip.ts ${KIND} "${chipPng}" ${stamp}`);

const msVoice = Math.round(voiceStart * 1000);

// 1. Settled lockup frame from the endcard tail (legacy open only).
if (!intro) sh(`ffmpeg -y -loglevel error -sseof -0.1 -i "${vEndcard.path}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${bolt}"`);

// 2. Single-pass assembly: open+body (xfade) ++ endcard tail, carrier audio.
sh(
  `ffmpeg -y -loglevel error ` +
  (intro
    ? `-i "${intro.path}" `                                  // [0] anchor intro
    : `-loop 1 -framerate 60 -t 1.2 -i "${bolt}" `) +        // [0] bolt still
  `-i "${ui}" ` +                                           // [1] ui segment 6.3s
  `-i "${vEndcard.path}" ` + // [2] endcard — first CARD seconds (MKT-31 addendum)
  `-i "${verifCarrier.path}" ` +                            // [3] carrier (audio, MKT-09 parts-aware)
  `-loop 1 -framerate 60 -t ${total} -i "${stampPng}" ` +    // [4] slate stamp
  (sting ? `-i "${sting.path}" ` : ``) +                     // [5] stinger (MKT-12)
  // MKT-22: chip LAST, index computed — the stinger input is conditional, so a
  // hardcoded index would take the stinger's slot on a stinger-less build.
  (chipPng ? `-loop 1 -framerate 60 -t ${total} -i "${chipPng}" ` : ``) +
  `-filter_complex "` +
  (intro
    ? `[0:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${openBase},setpts=PTS-STARTPTS[bolt0];`
    : `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[bolt0];`) +
  (sting
    ? `[5:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${STINGER_DUR},setpts=PTS-STARTPTS[stg];` +
      `[bolt0][stg]xfade=transition=fade:duration=${INTRO_XFADE}:offset=${+(openBase - INTRO_XFADE).toFixed(2)}[bolt];`
    : `[bolt0]null[bolt];`) +
  // Pad = dissolve only (see assemble-allday-reels.ts); legacy is unchanged.
  `[1:v]tpad=start_duration=${dissolve}:start_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[uix];` +
  `[bolt][uix]xfade=transition=custom:expr=${EASED}:duration=${dissolve}:offset=${+(openDur - dissolve).toFixed(2)}[openbody];` +
  `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${CARD},setpts=PTS-STARTPTS[card];` +
  `[openbody][card]concat=n=2:v=1:a=0[vraw];` +
  // RIBBON RULE (operator ruling 2026-08-19, superseding MKT-31 item 2's
  // every-body-frame span): on BOTH verify kinds the ribbon rides the BOARD
  // SEGMENT ONLY, UNCONDITIONALLY — never a collision-day conditional. The
  // featured row IS the proof — digits, badge and attribution are the one
  // thing a viewer must read cleanly, and nothing may cross it on ANY day
  // (verify_midday's first live build measured the spec y=470 ribbon covering
  // "STRAIGHT · Midday / Drew 618 in NC" through the whole hold; the same
  // geometry is latent on verify on first-row-featured days, 8/18's sheet
  // shows it). A conditional that fires rarely is exactly the defect shape
  // this system keeps discovering months later (the straight-match
  // classifier, the .mov class, the unpaired-carrier hum-bed) — a uniform
  // rule cannot silently mis-fire. What's lost is small and already covered:
  // after the board the "Yesterday"/"Today" header and the dated group carry
  // the date, and the chip carried it at frame one at full opacity. The
  // ribbon's job is identification during the opening beat.
  // MKT-35 P4: PER-SEGMENT PLACEMENT still holds for the segment the ribbon
  // rides. During the BOARD segment the ribbon at its spec y=470 crossed the
  // #1/#2 cards, so it rides at y-370 (plate y 100-220) inside the band the
  // board renderer reserves (clear y 0-300 through the push-in, measured).
  `[4:v]format=rgba,split=2[st0][st1];` +
  `[st0]fade=t=in:st=${+(openDur - 0.3).toFixed(2)}:d=0.4:alpha=1[stA];` +
  // The fade-out begins AT the board→summary/ledger cut on both kinds; the
  // 0.45s dissolve tail rides at spec placement past the cut (the shipped
  // verify_midday shape, measured and accepted 8/19). On verify_midday the
  // BOARD segment is longer by the cover-lift (covered hold + lift precede
  // the graded board's 2.5s).
  `[st1]fade=t=out:st=${+(openDur + BOARD_SEG).toFixed(2)}:d=0.45:alpha=1[stB];` +
  `[vraw][stA]overlay=0:-370:enable='lt(t,${+(openDur + BOARD_SEG).toFixed(2)})'[vbrd];` +
  `[vbrd][stB]overlay=0:0:enable='gte(t,${+(openDur + BOARD_SEG).toFixed(2)})',format=yuv420p[vst];` +
  // MKT-22/MKT-35: chip rides the intro only — FULL OPACITY FROM FRAME ONE
  // (frame one is the camera-roll thumbnail; no fade-in by ruling), hold to
  // 2.65s, then the existing fade, out well before the crossfade.
  (chipPng
    ? `[${sting ? 6 : 5}:v]format=rgba,` +
      `fade=t=out:st=2.65:d=0.25:alpha=1[chip];[vst][chip]overlay=0:0,format=yuv420p[v];`
    : `[vst]null[v];`) +
  (intro
    // Intro audio 0→openDur, carrier enters 0.4s before the dissolve completes.
    ? `[0:a]atrim=0:${openBase},asetpts=PTS-STARTPTS,aresample=48000,apad=whole_dur=${openBase},` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${(openBase - 0.3).toFixed(2)}:d=0.3[introaud];` +
      (sting
        ? `[5:a]atrim=0:${STINGER_DUR},asetpts=PTS-STARTPTS,aresample=48000,` +
          `afade=t=out:st=${(STINGER_DUR - 0.25).toFixed(2)}:d=0.25,` +
          `adelay=${Math.round((openBase - INTRO_XFADE) * 1000)}|${Math.round((openBase - INTRO_XFADE) * 1000)}[stgaud];`
        : ``) +
      `[3:a]atrim=0:${carrierNeed},asetpts=PTS-STARTPTS,aresample=48000,` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${(carrierNeed - 0.01).toFixed(2)}:d=0.01,` +
      `adelay=${msVoice}|${msVoice}[carr];` +
      // MKT-41 — THE ENDCARD'S OWN AUDIO, mixed at the outro cut. MKT-31 ruled
      // "carrier, then silence" when the close was a 2.5s STATIC tail with
      // nothing to hear. Addendum 1 replaced it with the endcard's first 6.5s
      // — a formation with its own sting — so that ruling started discarding a
      // real beat and left up to 4.5s of dead air at the close. Slate reels
      // have always mixed this ([outroaud], 4-input amix); verify was the only
      // kind that did not. Same shape as assemble-allday-reels.
      `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
      `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4,` +
      `adelay=${Math.round((openDur + uiDur) * 1000)}|${Math.round((openDur + uiDur) * 1000)}[outroaud];` +
      `[introaud]${sting ? '[stgaud]' : ''}[carr][outroaud]amix=inputs=${sting ? 4 : 3}:duration=longest:normalize=0,` +
      `loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur=${total}[a]" `
    : `[3:a]atrim=0:${carrierNeed},asetpts=PTS-STARTPTS,aresample=48000,` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${(carrierNeed - 0.01).toFixed(2)}:d=0.01,` +
      `loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur=${total}[a]" `) +
  `-map "[v]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
  `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
);

// 3. 1:1 feed cut — RETIRED (MKT-39 addendum, operator, 2026-07-31): zero
// logged use across 48 posts; consumers are all null-tolerant. See the
// matching note in assemble-allday-reels.ts for the resurrect recipe.
void out1x1;

// 4. Contact sheet — open, the board, a featured hold, the close.
//
// MKT-27: the third stamp was a fixed `openDur + 3.8`, chosen when the body was
// always 6.3s and 3.8s in landed on a hold. The body is now 8.6-14.0s depending
// on the row selection, and that offset would land in the pan on every day —
// making the storyboard show motion blur where the evidence should be. Taken as
// a FRACTION of the body instead: 0.62 sits inside the second hold across the
// whole range, which is the frame most worth reviewing.
// Fourth stamp: the settled close (text opaque from +5.2s of the outro), not
// the formation smoke the old tail-window stamp landed on.
// MKT-62: five frames on the same-day kind — open (frame one), the COVERED
// board, the board after the lift (with the timestamp pair visible on the
// next beat, so stamp 3 lands on the summary band), a featured hold, the close.
const STAMPS = (MIDDAY
  ? [0, openDur + 0.3, openDur + BOARD_SEG + 0.3, openDur + uiDur * 0.66, total - 0.7]
  : [0, openDur + 0.3, openDur + uiDur * 0.62, total - 0.7]).map(t => +t.toFixed(1));
STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs${i}.png`)}"`));
sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs${i}.png`)}"`).join(' ')} -filter_complex "${STAMPS.map((_, i) => `[${i}]`).join('')}hstack=${STAMPS.length}" "${sheet}"`);

const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
console.log(`reel: ${out} · duration ${dur}s · contact sheet written (1:1 retired, MKT-39)`);
