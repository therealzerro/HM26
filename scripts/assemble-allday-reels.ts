// MKT-03 Phase 2 (rev 2) — dual All-Day reel assembly (Pro + Free), 12.5s.
//
// Per variant v ∈ {pro, free}:
//   [0.0-1.2s]   settled lockup frame from allday_<v>_endcard.mp4 tail,
//                1.2s smoothstep-eased dissolve into the body's frame 0.
//   [1.2-17.2s]  ui_allday_YYYYMMDD.mp4 (16.0s: grid push-in → six modals).
//   [17.2-23.7s] the endcard's FIRST 6.5s as a true outro, hard cut in:
//                smoke rise → bolt snap (its resonant crack lands ON the snap,
//                endcard's own synced audio) → lockup resolves → calm hold.
//   Audio:       carrier VO (beats mapped to grid + first modals; ends ~9.6s)
//                → the endcard's HUM SWELL (its audio from t≈2s, AFTER the
//                crack) crossfades in as a low bed under modals #3-6 →
//                endcard native audio from t=0 at the outro (crack synced).
//                All real assets, no loops. Longer carriers auto-shrink the bed.
//
// Usage: tsx scripts/assemble-allday-reels.ts [YYYYMMDD]  (default today ET)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ASSETS = resolve('assets/marketing');
const REELS = join(ASSETS, 'allday_reels');
const sh = (c: string) => execSync(c, { stdio: 'inherit' });
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`; // xfade P counts DOWN

const stamp = process.argv[2] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const body = join(REELS, `ui_allday_${stamp}.mp4`);
if (!existsSync(body)) {
  console.error(`ABORT: ${body} not found — run the body render first (npm run reel:allday).`);
  process.exit(1);
}
const bodyDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${body}"`).toString());
const OPEN = 1.2, CARD = 6.5;          // endcard outro: formation + lockup resolve + hold
const BED_SRC_START = 2.0;              // endcard audio hum begins here (post-crack)
const XFADE_A = 0.4;                    // voice→bed audio crossfade-ish join fades
const total = +(OPEN + bodyDur + CARD).toFixed(3);   // 23.7 with the 16.0s body

for (const v of ['pro', 'free'] as const) {
  const endcard = join(ASSETS, `allday_${v}_endcard.mp4`);
  const carrier = join(ASSETS, `allday_${v}_carrier.mp4`);
  // Voice spans min(carrier length, open+body); the endcard's hum (audio from
  // BED_SRC_START, after its crack) beds any remaining gap before the outro.
  const carrierDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${carrier}"`).toString());
  const voiceSpan = +Math.min(carrierDur - 0.2, OPEN + bodyDur).toFixed(2);
  const bedLen = +(OPEN + bodyDur - voiceSpan).toFixed(2);
  const endcardAudioDur = parseFloat(execSync(`ffprobe -v error -select_streams a:0 -show_entries format=duration -of csv=p=0 "${endcard}"`).toString());
  if (endcardAudioDur < Math.max(CARD, BED_SRC_START + bedLen)) {
    console.error(`ABORT(${v}): endcard audio ${endcardAudioDur}s too short for outro ${CARD}s / bed ${bedLen}s.`);
    process.exit(1);
  }
  if (bedLen > 0.05) {
    console.log(`NOTE(${v}): carrier VO covers 0-${voiceSpan}s; endcard hum beds ${voiceSpan}-${(OPEN + bodyDur).toFixed(1)}s (modals after the VO). A ~${(OPEN + bodyDur).toFixed(1)}s carrier would carry voice wall-to-wall.`);
  }
  const lockup = join(REELS, `_lockup_${v}.png`);
  const out = join(REELS, `allday_${v}_${stamp}.mp4`);
  const out1x1 = join(REELS, `allday_${v}_${stamp}_1x1.mp4`);
  const sheet = join(REELS, `allday_${v}_${stamp}_contact.png`);

  sh(`ffmpeg -y -loglevel error -sseof -0.1 -i "${endcard}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${lockup}"`);

  sh(
    `ffmpeg -y -loglevel error ` +
    `-loop 1 -framerate 60 -t ${OPEN} -i "${lockup}" -i "${body}" -i "${endcard}" ` +
    `-i "${carrier}" -i "${endcard}" ` +
    `-filter_complex "` +
    `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[lk];` +
    `[1:v]tpad=start_duration=${OPEN}:start_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[uix];` +
    `[lk][uix]xfade=transition=custom:expr=${EASED}:duration=${OPEN}:offset=0[openbody];` +
    `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${CARD},setpts=PTS-STARTPTS[cardv];` +
    `[openbody][cardv]concat=n=2:v=1:a=0[vid];` +
    `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - XFADE_A).toFixed(2)}:d=${XFADE_A}[voice];` +
    (bedLen > 0.05
      ? `[4:a]atrim=${BED_SRC_START}:${(BED_SRC_START + bedLen).toFixed(2)},asetpts=PTS-STARTPTS,aresample=48000,volume=0.8,` +
        `afade=t=in:st=0:d=${XFADE_A},afade=t=out:st=${(bedLen - 0.25).toFixed(2)}:d=0.25[bed];`
      : ``) +
    `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4[cardaud];` +
    (bedLen > 0.05
      ? `[voice][bed][cardaud]concat=n=3:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
      : `[voice][cardaud]concat=n=2:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `) +
    `-map "[vid]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
    `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
  );

  sh(`ffmpeg -y -loglevel error -i "${out}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out1x1}"`);

  const STAMPS = [0, 3, 6.5, 12, 18.6, 23.3];
  STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs_${v}${i}.png`)}"`));
  sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs_${v}${i}.png`)}"`).join(' ')} -filter_complex "[0][1][2][3][4][5]hstack=6" "${sheet}"`);

  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`${v.toUpperCase()} reel: ${out} · duration ${dur}s · 1x1 + contact sheet written`);
}
