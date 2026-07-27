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
// MKT-08: when assets/marketing/anchor_intro.mp4 is present, it REPLACES the
// lockup open — intro plays full length, its final smoke dissolves (0.8s) into
// the body, intro's own audio runs until the carrier VO enters 0.4s before the
// dissolve completes. Everything downstream shifts by (introDur − 1.2); the
// endcard outro is untouched. Missing/unusable intro → legacy open, identical
// output (see scripts/reel-intro.ts).
//
// Usage: tsx scripts/assemble-allday-reels.ts [YYYYMMDD]  (default today ET)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { probeAnchorIntro, INTRO_DISSOLVE, INTRO_VO_LEAD } from './reel-intro';
import { resolveCarrier } from './reel-carrier';
import { available, rotation, rotationDegenerate, builtPath, modalWindow } from './reel-panels';
import { PANELS, MODAL_COUNT, ZONE_TOP, ZONE_BOTTOM, CROP_SAFE_TOP } from './panel-config';

const ASSETS = resolve('assets/marketing');
const REELS = join(ASSETS, 'allday_reels');
const sh = (c: string) => execSync(c, { stdio: 'inherit' });
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`; // xfade P counts DOWN

/**
 * MKT-10: build a `bedLen`-second hum bed from the endcard's crack-free window.
 * The window (3.9s) is usually shorter than the gap it must fill, so it is
 * extended as a PALINDROME (segment + its reverse): the seam is level-matched
 * by construction, where a plain loop would click on the level discontinuity.
 * `inLabel` is the endcard audio input, `outLabel` the finished bed.
 */
function humBed(inLabel: string, bedLen: number, outLabel: string): string {
  const seg = +(BED_SRC_END - BED_SRC_START).toFixed(2);
  const pairs = Math.max(1, Math.ceil(bedLen / (2 * seg)));
  let f =
    `${inLabel}atrim=${BED_SRC_START}:${BED_SRC_END},asetpts=PTS-STARTPTS,aresample=48000[bs];` +
    `[bs]asplit=2[bsa][bsb];[bsb]areverse[bsr];[bsa][bsr]concat=n=2:v=0:a=1[bp];`;
  if (pairs > 1) {
    const labels = Array.from({ length: pairs }, (_, i) => `[bq${i}]`);
    f += `[bp]asplit=${pairs}${labels.join('')};${labels.join('')}concat=n=${pairs}:v=0:a=1[bl];`;
  } else {
    f += `[bp]anull[bl];`;
  }
  return (
    f +
    `[bl]atrim=0:${bedLen.toFixed(2)},asetpts=PTS-STARTPTS,volume=0.8,` +
    `afade=t=in:st=0:d=${XFADE_A},afade=t=out:st=${(bedLen - 0.25).toFixed(2)}:d=0.25${outLabel}`
  );
}

const stamp = process.argv[2] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const body = join(REELS, `ui_allday_${stamp}.mp4`);
if (!existsSync(body)) {
  console.error(`ABORT: ${body} not found — run the body render first (npm run reel:allday).`);
  process.exit(1);
}
const bodyDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${body}"`).toString());
const OPEN = 1.2, CARD = 6.5;          // endcard outro: formation + lockup resolve + hold
// MKT-10: the hum bed is sourced from the endcard's PRE-crack tension hum.
// The bolt crack lands at ~4.3s (measured; contract-pinned), so the old
// BED_SRC_START=2.0 window ran straight through it and dragged the crack into
// mid-reel — the viewer heard the bolt snap twice, once under the modals and
// again in the real outro. 0.0-3.9s is crack-free and level-steady; reel:check
// asserts the endcard's loudest transient falls outside this window.
const BED_SRC_START = 0.0, BED_SRC_END = 3.9;
const XFADE_A = 0.4;                    // voice→bed audio crossfade-ish join fades

// MKT-11: rotating promo panels in the pick-detail dead zone. Resolved once —
// the sequence is identical for both variants because they share one body.
// Panels composite at ASSEMBLY (inside the per-variant loop below), so a future
// tier-specific set costs a second array in panel-config, not a second render.
const GRID_DUR = 4.0, MODAL_HOLD = 2.0;   // render-allday-body.ts segment plan
const PANEL_XFADE = process.argv.includes('--panel-xfade') ? 0.15 : 0;
const panelAvail = available(ASSETS);
panelAvail.dropped.forEach(d => console.log(`NOTE: panel dropped — ${d}`));
const panelSeq = rotation(stamp, panelAvail.usable);
if (rotationDegenerate(panelAvail.usable.length)) {
  console.log(`NOTE: ${panelAvail.usable.length} panels with a ${MODAL_COUNT}-modal stride only ever reaches a couple of distinct subsets — add or remove one to restore daily variety.`);
}
if (panelSeq.length) {
  console.log(`panels (${panelAvail.usable.length}/${PANELS.length} usable${PANEL_XFADE ? ', 0.15s crossfade' : ', hard cut'}):`);
  panelSeq.forEach((p, i) => console.log(`   modal ${i + 1} → ${p.label}  [${p.file}]`));
} else {
  console.log('NOTE: no usable panels — assembling without the panel layer.');
}
// Panels keep their native band height (they differ), so each is centred in the
// dead zone individually rather than assuming one strip size.
const panelHeights: Record<string, number> = {};
for (const p of panelAvail.usable) {
  panelHeights[p.file] = parseInt(
    execSync(`ffprobe -v error -select_streams v -show_entries stream=height -of csv=p=0 "${builtPath(ASSETS, p)}"`).toString().trim(), 10);
}

const intro = probeAnchorIntro(ASSETS);
const openDur = intro ? intro.dur : OPEN;      // body starts here in both modes
const dissolve = intro ? INTRO_DISSOLVE : OPEN;
const total = +(openDur + bodyDur + CARD).toFixed(3);   // 23.7 legacy with the 16.0s body

// MKT-07 slate stamp: day·scope·purpose chip burned over the body (shared by
// both variants). Derived from the same `stamp` the body was rendered for, so
// it can never disagree with the on-screen data. Overlay layer only — the
// rotating carriers/endcards/VOs stay date-agnostic.
const stampPng = join(REELS, `_stamp_${stamp}.png`);
sh(`npx tsx scripts/render-reel-stamp.ts drop ${stamp} ALL-DAY "${stampPng}"`);

for (const v of ['pro', 'free'] as const) {
  const endcard = join(ASSETS, `allday_${v}_endcard.mp4`);
  // MKT-09: a carrier delivered as parts (…_carrier.mp4 + …_carrier_pt2.mp4)
  // is joined first; a single-file carrier resolves to itself unchanged.
  const carrierRes = resolveCarrier(ASSETS, `allday_${v}_carrier`);
  const carrier = carrierRes.path;
  if (carrierRes.joined) {
    console.log(`NOTE(${v}): carrier joined from ${carrierRes.parts.length} parts (${carrierRes.parts.map(p => p.split('/').pop()).join(' + ')}).`);
  }
  // Voice spans min(carrier length, open+body); the endcard's hum (audio from
  // BED_SRC_START, after its crack) beds any remaining gap before the outro.
  const carrierDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${carrier}"`).toString());
  // OVERLAP MODE (long carriers): voice may finish naturally over the rising
  // smoke (up to 1.1s past the scene cut, always ending before the bolt snap);
  // the endcard's synced outro audio is MIXED in from the scene cut. Any
  // carrier content after the voice window is discarded (generated tracks have
  // proven unreliable past their VO).
  // With the intro, the VO enters at (openDur − 0.4) instead of 0, so the
  // usable VO window is bodyDur+0.4 (+1.1 overlap allowance) — 17.5s ceiling.
  const voiceStart = intro ? +(openDur - INTRO_VO_LEAD).toFixed(2) : 0;
  const voiceWindow = +(openDur + bodyDur - voiceStart).toFixed(2);
  const overlap = carrierDur >= voiceWindow - 0.05;
  const voiceSpan = overlap
    ? +Math.min(carrierDur - 0.1, voiceWindow + 1.1).toFixed(2)
    : +Math.min(carrierDur - 0.2, voiceWindow).toFixed(2);
  const bedLen = overlap ? 0 : +(voiceWindow - voiceSpan).toFixed(2);
  const endcardAudioDur = parseFloat(execSync(`ffprobe -v error -select_streams a:0 -show_entries format=duration -of csv=p=0 "${endcard}"`).toString());
  // The bed now palindrome-fills from a fixed window, so it no longer needs
  // endcard audio as long as the gap — only the window itself must exist.
  if (endcardAudioDur < Math.max(CARD, BED_SRC_END)) {
    console.error(`ABORT(${v}): endcard audio ${endcardAudioDur}s too short for outro ${CARD}s / bed source window ${BED_SRC_END}s.`);
    process.exit(1);
  }
  if (overlap) {
    console.log(`NOTE(${v}): long carrier (${carrierDur.toFixed(1)}s) — voice plays ${voiceStart}-${(voiceStart + voiceSpan).toFixed(1)}s (tail rides the smoke rise), endcard outro audio mixed from ${(openDur + bodyDur).toFixed(1)}s; carrier content beyond ${voiceSpan}s discarded.`);
  } else if (bedLen > 0.05) {
    console.log(`NOTE(${v}): carrier VO covers ${voiceStart}-${(voiceStart + voiceSpan).toFixed(1)}s; endcard hum beds to ${(openDur + bodyDur).toFixed(1)}s (modals after the VO). A full ~${total}s track would replace all reel audio.`);
  }
  const lockup = join(REELS, `_lockup_${v}.png`);
  const out = join(REELS, `allday_${v}_${stamp}.mp4`);
  const out1x1 = join(REELS, `allday_${v}_${stamp}_1x1.mp4`);
  const sheet = join(REELS, `allday_${v}_${stamp}_contact.png`);

  if (!intro) sh(`ffmpeg -y -loglevel error -sseof -0.1 -i "${endcard}" -frames:v 1 -vf "scale=1080:1920:flags=lanczos" "${lockup}"`);

  const msVoice = Math.round(voiceStart * 1000);
  const msBed = Math.round((voiceStart + voiceSpan) * 1000);
  const msOutro = Math.round((openDur + bodyDur) * 1000);
  sh(
    `ffmpeg -y -loglevel error ` +
    (intro
      ? `-i "${intro.path}" -i "${body}" -i "${endcard}" `
      : `-loop 1 -framerate 60 -t ${OPEN} -i "${lockup}" -i "${body}" -i "${endcard}" `) +
    `-i "${carrier}" -i "${endcard}" ` +
    `-loop 1 -framerate 60 -t ${total} -i "${stampPng}" ` +
    // MKT-11 panels occupy [6..] — appended after the stamp so inputs [0]-[5]
    // and every hardcoded index in the graph below are undisturbed.
    panelSeq.map(p => `-loop 1 -framerate 60 -t ${total} -i "${builtPath(ASSETS, p)}" `).join('') +
    `-filter_complex "` +
    (intro
      ? `[0:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${openDur},setpts=PTS-STARTPTS[lk];`
      : `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[lk];`) +
    // Pad = dissolve only: xfade aligns input2's t=0 at `offset`, so the clone
    // covers exactly the crossfade window and real body motion starts at
    // openDur. Legacy (dissolve=OPEN, offset=0) is byte-identical to before.
    `[1:v]tpad=start_duration=${dissolve}:start_mode=clone,format=yuv420p,setsar=1,fps=60,settb=AVTB[uix];` +
    `[lk][uix]xfade=transition=custom:expr=${EASED}:duration=${dissolve}:offset=${+(openDur - dissolve).toFixed(2)}[openbody];` +
    `[2:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${CARD},setpts=PTS-STARTPTS[cardv];` +
    `[openbody][cardv]concat=n=2:v=1:a=0[vraw];` +
    // Stamp rides the body only: in as the open dissolve settles, out before
    // the endcard cut so the lockup stays clean.
    `[5:v]format=rgba,fade=t=in:st=${+(openDur - 0.1).toFixed(2)}:d=0.45:alpha=1,fade=t=out:st=${(openDur + bodyDur - 0.55).toFixed(2)}:d=0.5:alpha=1[stmp];` +
    // Panels: one per modal segment, centred in the measured dead zone, each
    // gated to its own window. Chained BEFORE the stamp so the stamp stays on
    // top (they don't overlap — stamp y432-650, panels y>=1500 — but the order
    // keeps that true if either ever moves). Sitting at y>=1500 also means the
    // 1:1 centre crop (keeps y 420-1500) excludes them with no extra work.
    panelSeq.map((p, i) => {
      const [t0, t1] = modalWindow(openDur, GRID_DUR, MODAL_HOLD, i);
      const h = panelHeights[p.file];
      const y = Math.max(CROP_SAFE_TOP, Math.round(ZONE_TOP + (ZONE_BOTTOM - ZONE_TOP + 1 - h) / 2));
      const src = `[${6 + i}:v]format=rgba` +
        // Crossfade variant overlaps the gate by the fade length at both ends so
        // the ramps land inside the neighbouring segment rather than clipping.
        (PANEL_XFADE
          ? `,fade=t=in:st=${t0.toFixed(2)}:d=${PANEL_XFADE}:alpha=1,fade=t=out:st=${(t1 - PANEL_XFADE).toFixed(2)}:d=${PANEL_XFADE}:alpha=1`
          : ``) + `[pn${i}];`;
      const gate = PANEL_XFADE ? `between(t,${t0.toFixed(2)},${t1.toFixed(2)})` : `between(t,${t0.toFixed(2)},${(t1 - 0.001).toFixed(3)})`;
      return `${src}[${i === 0 ? 'vraw' : `vp${i - 1}`}][pn${i}]overlay=0:${y}:enable='${gate}'[vp${i}];`;
    }).join('') +
    `[${panelSeq.length ? `vp${panelSeq.length - 1}` : 'vraw'}][stmp]overlay=0:0,format=yuv420p[vid];` +
    (intro
      // Intro mode: everything positioned by adelay and amixed — intro's own
      // audio 0→openDur, VO enters at openDur−0.4, hum bed fills any VO gap,
      // endcard outro audio from the scene cut (crack stays synced).
      ? `[0:a]atrim=0:${openDur},asetpts=PTS-STARTPTS,aresample=48000,apad=whole_dur=${openDur},` +
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${(openDur - 0.3).toFixed(2)}:d=0.3[introaud];` +
        `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - 0.25).toFixed(2)}:d=0.25,` +
        `adelay=${msVoice}|${msVoice}[voice];` +
        (bedLen > 0.05 ? humBed('[4:a]', bedLen, `,adelay=${msBed}|${msBed}[bed];`) : ``) +
        `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4,` +
        `adelay=${msOutro}|${msOutro}[outroaud];` +
        `[introaud][voice]${bedLen > 0.05 ? '[bed]' : ''}[outroaud]amix=inputs=${bedLen > 0.05 ? 4 : 3}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
      : overlap
      ? `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - 0.25).toFixed(2)}:d=0.25[voice];` +
        `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4,` +
        `adelay=${Math.round((OPEN + bodyDur) * 1000)}|${Math.round((OPEN + bodyDur) * 1000)}[outroaud];` +
        `[voice][outroaud]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
      : `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - XFADE_A).toFixed(2)}:d=${XFADE_A}[voice];` +
    (bedLen > 0.05 ? humBed('[4:a]', bedLen, `[bed];`) : ``) +
    `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4[cardaud];` +
    (bedLen > 0.05
      ? `[voice][bed][cardaud]concat=n=3:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
      : `[voice][cardaud]concat=n=2:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `)) +
    `-map "[vid]" -map "[a]" -t ${total} -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
    `-c:a aac -ar 48000 -movflags +faststart "${out}"`,
  );

  sh(`ffmpeg -y -loglevel error -i "${out}" -vf "crop=1080:1080:0:420" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a copy -movflags +faststart "${out1x1}"`);

  // Same beats relative to the (possibly intro-shifted) timeline — legacy
  // openDur=1.2 reproduces the original [0, 3, 6.5, 12, 18.6, 23.3].
  // MKT-11: sample the MIDPOINT of every modal so all six panel placements are
  // verifiable in one artifact (the old 6-wide strip caught only modals 1 and 4).
  // Intro + endcard bookend it, keeping the reel arc visible; the grid tile was
  // dropped as the least informative — no panel, no stamp change.
  const STAMPS = panelSeq.length
    ? [0,
       ...Array.from({ length: MODAL_COUNT }, (_, i) => modalWindow(openDur, GRID_DUR, MODAL_HOLD, i)[0] + MODAL_HOLD / 2),
       total - 0.4].map(t => +t.toFixed(1))
    : [0, openDur + 1.8, openDur + 5.3, openDur + 10.8, openDur + bodyDur + 1.4, total - 0.4].map(t => +t.toFixed(1));
  STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs_${v}${i}.png`)}"`));
  const inputs = STAMPS.map((_, i) => `-i "${join(REELS, `_cs_${v}${i}.png`)}"`).join(' ');
  sh(
    STAMPS.length === 8
      ? `ffmpeg -y -loglevel error ${inputs} -filter_complex "[0][1][2][3]hstack=4[r0];[4][5][6][7]hstack=4[r1];[r0][r1]vstack=2" "${sheet}"`
      : `ffmpeg -y -loglevel error ${inputs} -filter_complex "[0][1][2][3][4][5]hstack=6" "${sheet}"`,
  );

  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`${v.toUpperCase()} reel: ${out} · duration ${dur}s · 1x1 + contact sheet written`);
}
