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
// Usage: tsx scripts/assemble-verification-reel.ts [YYYYMMDD]
//   (defaults to yesterday ET; expects ui_verify_<stamp>.mp4 already rendered)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
const out = join(REELS, `verify_reel_${stamp}.mp4`);
const out1x1 = join(REELS, `verify_reel_${stamp}_1x1.mp4`);
const bolt = join(REELS, `_bolt_lockup.png`);
const sheet = join(REELS, `verify_reel_${stamp}_contact.png`);
const sh = (c: string) => execSync(c, { stdio: 'inherit' });

// xfade P counts DOWN 1→0 — ease on q=(1-P) so the dissolve runs bolt→ui.
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`;

// 1. Settled lockup frame from the endcard tail (also used by the open).
sh(`ffmpeg -y -loglevel error -sseof -0.1 -i "${join(ASSETS, 'verif_endcard.mp4')}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${bolt}"`);

// 2. Single-pass assembly: open+body (xfade) ++ endcard tail, carrier audio.
sh(
  `ffmpeg -y -loglevel error ` +
  `-loop 1 -framerate 60 -t 1.2 -i "${bolt}" ` +           // [0] bolt still
  `-i "${ui}" ` +                                           // [1] ui segment 6.3s
  `-sseof -2.5 -i "${join(ASSETS, 'verif_endcard.mp4')}" ` + // [2] endcard tail
  `-i "${join(ASSETS, 'verif_carrier.mp4')}" ` +            // [3] carrier (audio)
  `-filter_complex "` +
  `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[bolt];` +
  `[1:v]tpad=start_duration=1.2:start_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[uix];` +
  `[bolt][uix]xfade=transition=custom:expr=${EASED}:duration=1.2:offset=0[openbody];` +
  `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=2.5,setpts=PTS-STARTPTS[card];` +
  `[openbody][card]concat=n=2:v=1:a=0[v];` +
  `[3:a]atrim=0:10,asetpts=PTS-STARTPTS,aresample=48000,` +
  `afade=t=in:st=0:d=0.01,afade=t=out:st=9.99:d=0.01,loudnorm=I=-14:TP=-1.5:LRA=11[a]" ` +
  `-map "[v]" -map "[a]" -t 10 -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
  `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
);

// 3. 1:1 feed cut (center crop).
sh(`ffmpeg -y -loglevel error -i "${out}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out1x1}"`);

// 4. Contact sheet: 0s, 1.5s, 5s, 8s.
const STAMPS = [0, 1.5, 5, 8];
STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs${i}.png`)}"`));
sh(`ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${join(REELS, `_cs${i}.png`)}"`).join(' ')} -filter_complex "[0][1][2][3]hstack=4" "${sheet}"`);

const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
console.log(`reel: ${out} · duration ${dur}s · 1x1 cut + contact sheet written`);
