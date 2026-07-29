// MKT-02 Phase 2 — daily "Yesterday's Receipts" reel assembly.
//
//   [0.0-1.2s] bolt open: settled lockup frame from verif_endcard.mp4 tail,
//              1.2s smoothstep-eased dissolve into the UI segment's frame 0.
//              (Chosen over the endcard's first 1.2s, which is smoke only —
//              the bolt hasn't formed yet; a formation cut joined poorly.)
//   [1.2-7.5s] ui_verify_YYYYMMDD.mp4 (6.3s, from render-verification-reel).
//   [7.5-10s]  final 2.5s of verif_endcard.mp4 (static lockup), hard cut.
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
import { assertBodyDate } from './reel-provenance';
import { resolveEndcard } from './reel-endcard';
import { CHIP_LABELS } from './intro-chip-config';
import { join, resolve } from 'node:path';
import { probeAnchorIntro, INTRO_DISSOLVE, INTRO_VO_LEAD } from './reel-intro';
import { resolveCarrier } from './reel-carrier';
import { probeStinger, stingerAdds } from './reel-stinger';
import { STINGER_DUR, INTRO_XFADE } from './stinger-config';

const ASSETS = resolve('assets/marketing');
const REELS = join(ASSETS, 'verify_reels');

function yesterdayET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
}

const stamp = process.argv[2] ?? yesterdayET();
const ui = join(REELS, `ui_verify_${stamp}.mp4`);
if (!existsSync(ui)) {
  console.error(`ABORT: ${ui} not found — run the render step first (npm run reel:verify).`);
  process.exit(1);
}
// MKT-18: the check above validates a FILENAME, not the pixels. Verify had the
// identical gap as the slate assembler — a body copied to another day's name
// would be stamped with that day's "✓ VERIFIED RESULTS" chip, which on a
// receipts reel means publishing one day's outcomes as another's.
assertBodyDate(ui, `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`, 'npm run reel:verify');
// MKT-19: the two reads below were inline `verif_endcard.mp4` literals — the
// close AND the legacy fallback open, which takes the endcard's final frame.
// Both now resolve through the shared resolver. Verify never uses a hum bed (its
// soundtrack is verif_carrier), so needsBed is false.
const vEndcard = resolveEndcard(ASSETS, 'verify', `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}`, false);
console.log(`NOTE(verify): endcard motion → ${vEndcard.motion.label} [${vEndcard.name}].`);
const out = join(REELS, `verify_reel_${stamp}.mp4`);
const out1x1 = join(REELS, `verify_reel_${stamp}_1x1.mp4`);
const bolt = join(REELS, `_bolt_lockup.png`);
const sheet = join(REELS, `verify_reel_${stamp}_contact.png`);
const sh = (c: string) => execSync(c, { stdio: 'inherit' });

// xfade P counts DOWN 1→0 — ease on q=(1-P) so the dissolve runs bolt→ui.
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`;

// MKT-07 slate stamp: "✓ VERIFIED RESULTS" + yesterday's date, burned over the
// UI segment (cross-scope page, so no scope tag). Overlay layer only — the
// rotating carrier/endcard assets stay date-agnostic.
const stampPng = join(REELS, `_stamp_${stamp}.png`);
sh(`npx tsx scripts/render-reel-stamp.ts verify ${stamp} - "${stampPng}"`);

const uiDur = +parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${ui}"`).toString()).toFixed(2);
const intro = probeAnchorIntro(ASSETS, 'verify');
// MKT-12: wired but DISABLED for verify by config — the body is only 6.3s, so a
// 5.6s intro plus a 3.0s stinger would put more branding on screen than
// receipts. Enabling it later is a config flip, no code change.
const sting = probeStinger(ASSETS, 'verify');
const openBase = intro ? intro.dur : 1.2;
const openDur = +(openBase + stingerAdds(sting)).toFixed(2);
const dissolve = intro ? INTRO_DISSOLVE : 1.2;
const total = +(openDur + uiDur + 2.5).toFixed(2);   // legacy 10.0
const voiceStart = intro ? +(openDur - INTRO_VO_LEAD).toFixed(2) : 0;
const carrierNeed = +(total - voiceStart).toFixed(2); // uiDur + 2.5 + INTRO_VO_LEAD
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
// A verif_carrier_pt2 of ~7.0s would close it on every day (see the handover
// note for the arithmetic); until one exists the silence is deliberate.
if (carrierNeed > 10.005) {
  console.log(
    `NOTE(verify): carrier covers ${(voiceStart + 10.005).toFixed(2)}s of a ${total}s reel — ` +
    `${(carrierNeed - 10.005).toFixed(2)}s plays under the closing holds in silence (MKT-27, by ruling).`,
  );
}
// MKT-09/MKT-20: resolved from the carrier registry by KIND. Verify declares no
// continuation, so this is a genuine single-part carrier and resolves to itself.
const verifCarrier = resolveCarrier(ASSETS, 'verify', `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}`);
if (verifCarrier.joined) {
  console.log(`NOTE: carrier joined from ${verifCarrier.parts.length} parts (${verifCarrier.parts.map(p => p.split('/').pop()).join(' + ')}).`);
}
// MKT-22: intro identity chip — "YESTERDAY'S RESULTS", green accent to match
// the verify stamp. Only with an intro active; the legacy open is a bolt still.
const chipPng = intro && CHIP_LABELS.verify ? join(REELS, `_chip_verify.png`) : null;
if (chipPng) sh(`npx tsx scripts/render-intro-chip.ts verify "${chipPng}"`);

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
  `-sseof -2.5 -i "${vEndcard.path}" ` + // [2] endcard tail
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
  `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=2.5,setpts=PTS-STARTPTS[card];` +
  `[openbody][card]concat=n=2:v=1:a=0[vraw];` +
  `[4:v]format=rgba,fade=t=in:st=${+(openDur - 0.3).toFixed(2)}:d=0.4:alpha=1,fade=t=out:st=${+(openDur + uiDur - 0.5).toFixed(2)}:d=0.45:alpha=1[stmp];` +
  `[vraw][stmp]overlay=0:0,format=yuv420p[vst];` +
  // MKT-22: chip rides the intro only, out well before the crossfade.
  (chipPng
    ? `[${sting ? 6 : 5}:v]format=rgba,fade=t=in:st=0.40:d=0.25:alpha=1,` +
      `fade=t=out:st=2.40:d=0.25:alpha=1[chip];[vst][chip]overlay=0:0,format=yuv420p[v];`
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
      `[introaud]${sting ? '[stgaud]' : ''}[carr]amix=inputs=${sting ? 3 : 2}:duration=longest:normalize=0,` +
      `loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur=${total}[a]" `
    : `[3:a]atrim=0:${carrierNeed},asetpts=PTS-STARTPTS,aresample=48000,` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${(carrierNeed - 0.01).toFixed(2)}:d=0.01,` +
      `loudnorm=I=-14:TP=-1.5:LRA=11,apad=whole_dur=${total}[a]" `) +
  `-map "[v]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
  `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
);

// 3. 1:1 feed cut (center crop).
sh(`ffmpeg -y -loglevel error -i "${out}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out1x1}"`);

// 4. Contact sheet — open, the board, a featured hold, the close.
//
// MKT-27: the third stamp was a fixed `openDur + 3.8`, chosen when the body was
// always 6.3s and 3.8s in landed on a hold. The body is now 8.6-14.0s depending
// on the row selection, and that offset would land in the pan on every day —
// making the storyboard show motion blur where the evidence should be. Taken as
// a FRACTION of the body instead: 0.62 sits inside the second hold across the
// whole range, which is the frame most worth reviewing.
const STAMPS = [0, openDur + 0.3, openDur + uiDur * 0.62, openDur + uiDur + 0.5].map(t => +t.toFixed(1));
STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs${i}.png`)}"`));
sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs${i}.png`)}"`).join(' ')} -filter_complex "[0][1][2][3]hstack=4" "${sheet}"`);

const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
console.log(`reel: ${out} · duration ${dur}s · 1x1 cut + contact sheet written`);
