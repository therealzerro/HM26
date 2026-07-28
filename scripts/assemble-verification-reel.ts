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
const carrierNeed = +(total - voiceStart).toFixed(2); // 9.2 with intro (any length), 10.0 legacy
// MKT-09: joins verif_carrier.mp4 + verif_carrier_pt2.mp4 … when parts exist.
const verifCarrier = resolveCarrier(ASSETS, 'verif_carrier');
if (verifCarrier.joined) {
  console.log(`NOTE: carrier joined from ${verifCarrier.parts.length} parts (${verifCarrier.parts.map(p => p.split('/').pop()).join(' + ')}).`);
}
const msVoice = Math.round(voiceStart * 1000);

// 1. Settled lockup frame from the endcard tail (legacy open only).
if (!intro) sh(`ffmpeg -y -loglevel error -sseof -0.1 -i "${join(ASSETS, 'verif_endcard.mp4')}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${bolt}"`);

// 2. Single-pass assembly: open+body (xfade) ++ endcard tail, carrier audio.
sh(
  `ffmpeg -y -loglevel error ` +
  (intro
    ? `-i "${intro.path}" `                                  // [0] anchor intro
    : `-loop 1 -framerate 60 -t 1.2 -i "${bolt}" `) +        // [0] bolt still
  `-i "${ui}" ` +                                           // [1] ui segment 6.3s
  `-sseof -2.5 -i "${join(ASSETS, 'verif_endcard.mp4')}" ` + // [2] endcard tail
  `-i "${verifCarrier.path}" ` +                            // [3] carrier (audio, MKT-09 parts-aware)
  `-loop 1 -framerate 60 -t ${total} -i "${stampPng}" ` +    // [4] slate stamp
  (sting ? `-i "${sting.path}" ` : ``) +                     // [5] stinger (MKT-12)
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
  `[vraw][stmp]overlay=0:0,format=yuv420p[v];` +
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
      `[introaud]${sting ? '[stgaud]' : ''}[carr]amix=inputs=${sting ? 3 : 2}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
    : `[3:a]atrim=0:${carrierNeed},asetpts=PTS-STARTPTS,aresample=48000,` +
      `afade=t=in:st=0:d=0.01,afade=t=out:st=${(carrierNeed - 0.01).toFixed(2)}:d=0.01,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `) +
  `-map "[v]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
  `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
);

// 3. 1:1 feed cut (center crop).
sh(`ffmpeg -y -loglevel error -i "${out}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out1x1}"`);

// 4. Contact sheet — same beats on the (possibly intro-shifted) timeline;
// legacy openDur=1.2 reproduces the original [0, 1.5, 5, 8].
const STAMPS = [0, openDur + 0.3, openDur + 3.8, openDur + uiDur + 0.5].map(t => +t.toFixed(1));
STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs${i}.png`)}"`));
sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs${i}.png`)}"`).join(' ')} -filter_complex "[0][1][2][3]hstack=4" "${sheet}"`);

const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
console.log(`reel: ${out} · duration ${dur}s · 1x1 cut + contact sheet written`);
