// MKT-01 Phase 2 — 30s ad assembly.
//
//   clipA (AI, ends frozen on bolt) ─┐
//   clipB = 2s eased dissolve bolt→ui_raw f0, then ui_raw 0-8s; carrier audio
//   clipC (AI) ──────────────────────┘
//   → master_30s.mp4 (1080x1920, 30.000s, H.264 high, yuv420p, AAC 48k, -14 LUFS)
//   → master_30s_1x1.mp4 (1080x1080 center-crop), master_30s_4x5.mp4 (1080x1350)
//
// Usage: tsx scripts/assemble-ad.ts <assetDir>
//   expects clipA.mp4, carrier.mp4, clipC.mp4, ui_raw.mp4 in <assetDir>;
//   writes clipB.mp4, masters, and contact_sheet.png there.
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const DIR = resolve(process.argv[2] ?? 'assets/marketing/screenvideos_2026-07-27');
const p = (f: string) => join(DIR, f);
const sh = (cmd: string) => { console.log('» ' + cmd.slice(0, 120) + (cmd.length > 120 ? '…' : '')); execSync(cmd, { stdio: 'inherit' }); };

// Smoothstep-eased crossfade expression for xfade (per-plane).
// NOTE: xfade's P counts DOWN 1→0 across the transition, so ease on q=(1-P):
// q=0 at the start (all A / bolt) → q=1 at the end (all B / ui).
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`;
// Inaudible 10ms edge fades guarantee click-free joins.
const DECLICK = 'afade=t=in:st=0:d=0.01,afade=t=out:st=9.99:d=0.01';

// 1. Final frame of clipA (the frozen bolt), scaled to 1080x1920.
sh(`ffmpeg -y -loglevel error -sseof -0.05 -i "${p('clipA.mp4')}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${p('boltframe.png')}"`);

// 2. clipB: bolt still (2s) ⤳ eased 2s dissolve ⤳ ui_raw front-padded with a
//    2s clone of its first frame (tpad), so ui CONTENT plays exactly 2.0-10.0s.
//    Audio = carrier track only, trimmed to 10.000s.
sh(
  `ffmpeg -y -loglevel error ` +
  `-loop 1 -framerate 60 -t 2 -i "${p('boltframe.png')}" ` +
  `-i "${p('ui_raw.mp4')}" -i "${p('carrier.mp4')}" ` +
  `-filter_complex "` +
  `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[bolt];` +
  `[1:v]tpad=start_duration=2:start_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[ui];` +
  `[bolt][ui]xfade=transition=custom:expr=${EASED}:duration=2:offset=0[v];` +
  `[2:a]atrim=0:10,asetpts=PTS-STARTPTS,aresample=48000,${DECLICK}[a]" ` +
  `-map "[v]" -map "[a]" -t 10 -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "${p('clipB.mp4')}"`,
);

// 3. Conform clipA / clipC: 1080x1920 lanczos, 60fps, exactly 10.000s, native audio kept.
for (const c of ['clipA', 'clipC']) {
  sh(
    `ffmpeg -y -loglevel error -i "${p(c + '.mp4')}" ` +
    `-vf "scale=1080:1920:flags=lanczos,fps=60,format=yuv420p,setsar=1" ` +
    `-af "atrim=0:10,asetpts=PTS-STARTPTS,aresample=48000,${DECLICK}" ` +
    `-t 10 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "${p(c + '_conf.mp4')}"`,
  );
}

// 4. Concat A+B+C, single-pass loudnorm to -14 LUFS across the full timeline.
sh(
  `ffmpeg -y -loglevel error -i "${p('clipA_conf.mp4')}" -i "${p('clipB.mp4')}" -i "${p('clipC_conf.mp4')}" ` +
  `-filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[cv][ca];` +
  `[ca]atrim=0:30,asetpts=PTS-STARTPTS,loudnorm=I=-14:TP=-1.5:LRA=11[a]" ` +
  `-map "[cv]" -map "[a]" -t 30 -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "${p('master_30s.mp4')}"`,
);

// 5. Feed cuts (center crops), audio stream-copied.
sh(`ffmpeg -y -loglevel error -i "${p('master_30s.mp4')}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${p('master_30s_1x1.mp4')}"`);
sh(`ffmpeg -y -loglevel error -i "${p('master_30s.mp4')}" -vf "crop=1080:1350:0:285" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${p('master_30s_4x5.mp4')}"`);

// 6. Contact sheet: 0s, 10s, 12s, 20s, ~30s (last frame).
const STAMPS = [0, 10, 12, 20, 29.98];
STAMPS.forEach((t, i) =>
  sh(`ffmpeg -y -loglevel error -ss ${t} -i "${p('master_30s.mp4')}" -frames:v 1 -vf "scale=270:480" "${p(`_cs${i}.png`)}"`));
sh(
  `ffmpeg -y -loglevel error ${STAMPS.map((_, i) => `-i "${p(`_cs${i}.png`)}"`).join(' ')} ` +
  `-filter_complex "[0][1][2][3][4]hstack=5" "${p('contact_sheet.png')}"`,
);

// Verify durations.
for (const f of ['clipB.mp4', 'master_30s.mp4', 'master_30s_1x1.mp4', 'master_30s_4x5.mp4']) {
  execSync(`echo -n "${f}: " && ffprobe -v error -show_entries format=duration -of csv=p=0 "${p(f)}"`, { stdio: 'inherit', shell: '/bin/bash' } as any);
}
console.log('assembly complete');
