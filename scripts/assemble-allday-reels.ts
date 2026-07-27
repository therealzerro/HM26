// MKT-03 Phase 2 (rev 2) — dual All-Day reel assembly (Pro + Free), 12.5s.
//
// Per variant v ∈ {pro, free}:
//   [0.0-1.2s]   settled lockup frame from allday_<v>_endcard.mp4 tail,
//                1.2s smoothstep-eased dissolve into the body's frame 0.
//   [1.2-17.2s]  ui_allday_YYYYMMDD.mp4 (16.0s: grid push-in → six modals).
//   [17.2-19.7s] final 2.5s of allday_<v>_endcard.mp4, hard cut.
//   Audio:       carrier narration first (up to its full length), then the
//                endcard's own front-loaded sting bridges the remainder and
//                decays naturally into the lockup. All real assets, no loops.
//                If a carrier >= open+body is supplied it is used in full —
//                regenerate carriers at ~17.2s for wall-to-wall narration.
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
const OPEN = 1.2, CARD = 2.5;
const total = +(OPEN + bodyDur + CARD).toFixed(3);   // 19.7 with the 16.0s body

for (const v of ['pro', 'free'] as const) {
  const endcard = join(ASSETS, `allday_${v}_endcard.mp4`);
  const carrier = join(ASSETS, `allday_${v}_carrier.mp4`);
  // Narration spans min(carrier length, open+body); the endcard's front-loaded
  // sting (played from ITS start) bridges whatever remains to the reel end.
  const carrierDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${carrier}"`).toString());
  const carrierSpan = +Math.min(carrierDur - 0.005, OPEN + bodyDur).toFixed(2);
  const bridge = +(total - carrierSpan).toFixed(2);
  const endcardAudioDur = parseFloat(execSync(`ffprobe -v error -select_streams a:0 -show_entries format=duration -of csv=p=0 "${endcard}"`).toString());
  if (bridge > endcardAudioDur) {
    console.error(`ABORT(${v}): audio bridge ${bridge}s exceeds endcard audio ${endcardAudioDur}s — supply a longer carrier.`);
    process.exit(1);
  }
  if (carrierSpan < OPEN + bodyDur - 0.05) {
    console.log(`NOTE(${v}): carrier is ${carrierDur.toFixed(1)}s; narration covers 0-${carrierSpan}s and the endcard sting bridges the rest. For wall-to-wall narration regenerate the carrier at ~${(OPEN + bodyDur).toFixed(1)}s.`);
  }
  const lockup = join(REELS, `_lockup_${v}.png`);
  const out = join(REELS, `allday_${v}_${stamp}.mp4`);
  const out1x1 = join(REELS, `allday_${v}_${stamp}_1x1.mp4`);
  const sheet = join(REELS, `allday_${v}_${stamp}_contact.png`);

  sh(`ffmpeg -y -loglevel error -sseof -0.1 -i "${endcard}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${lockup}"`);

  sh(
    `ffmpeg -y -loglevel error ` +
    `-loop 1 -framerate 60 -t ${OPEN} -i "${lockup}" -i "${body}" -sseof -${CARD} -i "${endcard}" ` +
    `-i "${endcard}" -i "${carrier}" -i "${endcard}" ` +
    `-filter_complex "` +
    `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[lk];` +
    `[1:v]tpad=start_duration=${OPEN}:start_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[uix];` +
    `[lk][uix]xfade=transition=custom:expr=${EASED}:duration=${OPEN}:offset=0[openbody];` +
    `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${CARD},setpts=PTS-STARTPTS[cardv];` +
    `[openbody][cardv]concat=n=2:v=1:a=0[vid];` +
    `[4:a]atrim=0:${carrierSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.01,afade=t=out:st=${(carrierSpan - 0.01).toFixed(2)}:d=0.01[voice];` +
    `[5:a]atrim=0:${bridge},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.25,afade=t=out:st=${(bridge - 0.3).toFixed(2)}:d=0.3[sting];` +
    `[voice][sting]concat=n=2:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]" ` +
    `-map "[vid]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
    `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
  );

  sh(`ffmpeg -y -loglevel error -i "${out}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out1x1}"`);

  const STAMPS = [0, 3, 6.5, 11, 15, 18.5];
  STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs_${v}${i}.png`)}"`));
  sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs_${v}${i}.png`)}"`).join(' ')} -filter_complex "[0][1][2][3][4][5]hstack=6" "${sheet}"`);

  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`${v.toUpperCase()} reel: ${out} · duration ${dur}s · 1x1 + contact sheet written`);
}
