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
// MKT-13: scope-parameterized. `--scope=midday|evening` assembles that session's
// reels (pro only — see scripts/reel-scopes.ts for why sessions have no free
// variant); with no flag this is the All-Day assembler exactly as before, down
// to the output filenames.
//
// Usage: tsx scripts/assemble-allday-reels.ts [YYYYMMDD] [--scope=…]  (default today ET, allday)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { probeAnchorIntro, INTRO_DISSOLVE, INTRO_VO_LEAD } from './reel-intro';
import { resolveCarrier } from './reel-carrier';
import { MODAL_COUNT, GRID_DUR, MODAL_HOLD, modalWindow } from '../constants/reelPanels';
import { probeStinger, stingerAdds } from './reel-stinger';
import { bedWindow, type BedWindow } from './reel-bed';
import { STINGERS, STINGER_DUR, INTRO_XFADE } from './stinger-config';
import { REEL_SCOPES, parseScopeFlag, positionals, reelKind } from './reel-scopes';
import { assertBodyDate } from './reel-provenance';
import { resolveEndcard } from './reel-endcard';

const ASSETS = resolve('assets/marketing');
const SCOPE = parseScopeFlag(process.argv);
const SPEC = REEL_SCOPES[SCOPE];
const REELS = join(ASSETS, SPEC.dir);
const sh = (c: string) => execSync(c, { stdio: 'inherit' });
const EASED = `'st(0,(1-P)*(1-P)*(3-2*(1-P)));A*(1-ld(0))+B*ld(0)'`; // xfade P counts DOWN

/**
 * MKT-10: build a `bedLen`-second hum bed from the endcard's crack-free window.
 * The window (3.9s) is usually shorter than the gap it must fill, so it is
 * extended as a PALINDROME (segment + its reverse): the seam is level-matched
 * by construction, where a plain loop would click on the level discontinuity.
 * `inLabel` is the endcard audio input, `outLabel` the finished bed.
 */
function humBed(inLabel: string, bedLen: number, outLabel: string, bed: BedWindow): string {
  const seg = +(bed.end - bed.start).toFixed(2);
  const pairs = Math.max(1, Math.ceil(bedLen / (2 * seg)));
  let f =
    `${inLabel}atrim=${bed.start}:${bed.end},asetpts=PTS-STARTPTS,aresample=48000[bs];` +
    `[bs]asplit=2[bsa][bsb];[bsb]areverse[bsr];[bsa][bsr]concat=n=2:v=0:a=1[bp];`;
  if (pairs > 1) {
    const labels = Array.from({ length: pairs }, (_, i) => `[bq${i}]`);
    f += `[bp]asplit=${pairs}${labels.join('')};${labels.join('')}concat=n=${pairs}:v=0:a=1[bl];`;
  } else {
    f += `[bp]anull[bl];`;
  }
  // MKT-19: LEVEL-MATCH the bed instead of applying a flat gain.
  //
  // This was `volume=0.8` for every endcard. The final loudnorm runs on the
  // MIXED track, so it normalises the whole reel and cannot correct the bed's
  // level relative to the VO — meaning bed loudness varied with whichever motion
  // the date happened to select. Measured across the set: -24.5 to -29.3 dB, a
  // 4.8 dB swing on hum-bed days, for no reason a listener could attribute to
  // anything. bedWindow() already measures the window's RMS, so the correction
  // is arithmetic on data we compute anyway.
  const correction = clampDb(BED_TARGET_RMS - bed.rms);
  return (
    f +
    `[bl]atrim=0:${bedLen.toFixed(2)},asetpts=PTS-STARTPTS,volume=${(correction + BED_MIX_DB).toFixed(2)}dB,` +
    `afade=t=in:st=0:d=${XFADE_A},afade=t=out:st=${(bedLen - 0.25).toFixed(2)}:d=0.25${outLabel}`
  );
}

/**
 * Reference bed level, dB RMS. This is the incumbent Pro endcard's measured
 * window — the level that has been shipping and is approved by ear, so matching
 * to it changes nothing about the reels that already sound right and only pulls
 * the outliers into line.
 */
const BED_TARGET_RMS = -27.6;
/** The historical flat `volume=0.8`, preserved as the mix balance. */
const BED_MIX_DB = -1.94;
/** Never correct by more than this: a motion needing more is a defect, not a
 *  level, and boosting it that hard would raise its noise floor with it. */
const MAX_BED_CORRECTION = 6;
function clampDb(db: number): number {
  return Math.max(-MAX_BED_CORRECTION, Math.min(MAX_BED_CORRECTION, db));
}

const stamp = positionals(process.argv.slice(2))[0]
  ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
const isoDate = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
/** MKT-19 gate overrides: --stinger-motion=<tag> / --endcard-motion=<tag>. */
const flagVal = (name: string): string | undefined =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const FORCE_STING = flagVal('stinger-motion');
const FORCE_CARD = flagVal('endcard-motion');
/** MKT-20: --carrier=<part-1 filename> forces one carrier open, for review. */
const FORCE_CARRIER = flagVal('carrier');
if (FORCE_STING || FORCE_CARD || FORCE_CARRIER) {
  console.log(`NOTE: rotation override — stinger=${FORCE_STING ?? 'rotation'} endcard=${FORCE_CARD ?? 'rotation'} carrier=${FORCE_CARRIER ?? 'rotation'}`);
}
const body = join(REELS, `ui_${SCOPE}_${stamp}.mp4`);
if (!existsSync(body)) {
  console.error(`ABORT: ${body} not found — run the body render first (npm run reel:${SCOPE}).`);
  process.exit(1);
}
// MKT-18: the existence check above is not enough — it validates a FILENAME.
// Assert the body's own recorded capture date matches the date about to be
// burned onto it, so a copied or renamed body cannot be published wearing
// someone else's day. See scripts/reel-provenance.ts for the incident.
assertBodyDate(body, isoDate, `npm run reel:${SCOPE}`);
const bodyDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${body}"`).toString());
const OPEN = 1.2, CARD = 6.5;          // endcard outro: formation + lockup resolve + hold
// MKT-10: the hum-bed window is DERIVED from each endcard (scripts/reel-bed.ts)
// rather than hardcoded. The previous constant was measured on the Pro endcard
// and generalised — and was already wrong for Free, whose crack lands at ~1.0s
// inside it. Deriving means a replaced motion file cannot silently poison the
// bed by moving its snap.
const XFADE_A = 0.4;                    // voice→bed audio crossfade-ish join fades

// MKT-11: promo panels are NOT composited here. They render inside the app's
// pick-detail modal (capture-gated) and are captured as part of the UI by
// render-allday-body.ts, so the assembler needs no panel layer at all — it only
// needs the modal segment plan for contact-sheet sampling.
// MKT-12: the branded stinger sits between the intro and the body. It is
// per-variant (the headline differs), so openDur/total are resolved inside the
// variant loop below rather than once here.
// MKT-17: the INTRO is per-variant too now — slate kinds rotate, public kinds
// take a fixed file — so it resolves in the loop alongside the stinger.

// MKT-07 slate stamp: day·scope·purpose chip burned over the body (shared by
// both variants). Derived from the same `stamp` the body was rendered for, so
// it can never disagree with the on-screen data. Overlay layer only — the
// rotating carriers/endcards/VOs stay date-agnostic.
const stampPng = join(REELS, `_stamp_${stamp}.png`);
sh(`npx tsx scripts/render-reel-stamp.ts drop ${stamp} ${SPEC.stampLabel} "${stampPng}"`);

for (const v of SPEC.variants) {
  const kind = reelKind(SCOPE, v);
  // MKT-17: resolved per kind and per DATE (not "today"), so re-running an old
  // stamp reproduces that day's intro exactly, the same contract the caption
  // and panel rotations already honour.
  const intro = probeAnchorIntro(ASSETS, kind, isoDate);
  const openBase = intro ? intro.dur : OPEN;
  const dissolve = intro ? INTRO_DISSOLVE : OPEN;
  // MKT-12: prebuilt per-variant stinger. Missing/disabled → null and the reel
  // assembles exactly as before. Crossfaded into, so it adds dur − INTRO_XFADE.
  const sting = probeStinger(ASSETS, kind, isoDate, FORCE_STING);
  const openDur = +(openBase + stingerAdds(sting)).toFixed(3);
  const total = +(openDur + bodyDur + CARD).toFixed(3);
  if (sting) console.log(`NOTE(${v}): stinger ${STINGERS[kind].lines[1]} — open ${openBase}s + ${stingerAdds(sting)}s = ${openDur}s, reel ${total}s.`);
  // MKT-19: resolved through the shared resolver, never composed from `kind` —
  // the built names are not uniform (verify's is `verif_endcard.mp4`). Whether
  // the day needs a bed is a property of the CARRIER, so it is decided below and
  // the endcard re-resolved if the narrowed set differs.
  let ec = resolveEndcard(ASSETS, kind, isoDate, false, FORCE_CARD);
  let endcard = ec.path;
  // MKT-09: a carrier delivered as parts is joined first.
  // MKT-20: keyed on the KIND, not a composed `${kind}_carrier` base — part 1
  // rotates and its continuation is looked up explicitly, because deriving the
  // continuation from a rotating part-1 name resolves to nothing and degrades
  // into a published half-narration reel rather than an error.
  const carrierRes = resolveCarrier(ASSETS, kind, isoDate, FORCE_CARRIER);
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
  if (endcardAudioDur < CARD) {
    console.error(`ABORT(${v}): endcard audio ${endcardAudioDur}s too short for the ${CARD}s outro.`);
    process.exit(1);
  }
  // Derived per endcard; null means no crack-free, level-steady stretch exists
  // (true of the Free endcard today). Fail rather than replay the bolt crack
  // under the modals — the fix is a long wall-to-wall carrier, not a worse bed.
  // MKT-19: whether a bed is needed is a property of the CARRIER, and it is only
  // known here. Re-resolve against the bed-viable subset so a build-up motion
  // (no level-steady stretch — endcard_motion_pro_alt) drops out for the day
  // instead of aborting the run. On wall-to-wall days nothing changes.
  if (bedLen > 0.05) {
    const bedEc = resolveEndcard(ASSETS, kind, isoDate, true, FORCE_CARD);
    if (bedEc.path !== endcard) {
      console.log(`NOTE(${v}): short carrier needs a hum bed — endcard re-resolved ${ec.name} → ${bedEc.name} (${bedEc.motion.label}).`);
      ec = bedEc;
      endcard = ec.path;
    }
  }
  const bed = bedLen > 0.05 ? bedWindow(endcard, CARD) : null;
  if (bedLen > 0.05 && !bed) {
    console.error(`ABORT(${v}): ${basename(endcard)} has no usable hum-bed window (crack too early, or its audio decays away). No motion in this tier could supply one — deliver a wall-to-wall carrier, or a motion with a level-steady pre-crack window.`);
    process.exit(1);
  }
  // MKT-19/MKT-20 run summary: the day's FOUR independently rotating beats, in
  // one line. They are deliberately uncorrelated — the combinatorial spread is
  // the point — so this line is the only place the day's actual combination is
  // visible, and it is what an operator reads back when a reel sounds wrong.
  console.log(
    `NOTE(${v}): rotation → intro ${intro ? intro.label : 'legacy open'}` +
    ` · stinger ${sting?.motion ? sting.motion.label : (sting ? 'unversioned' : 'none')}` +
    ` · endcard ${ec.motion.label} [${ec.name}]` +
    ` · carrier ${carrierRes.variant.label} [${carrierRes.variant.file}].`,
  );
  if (bed) console.log(`NOTE(${v}): hum bed ← ${bed.mode}-crack ${bed.start}-${bed.end}s (crack measured at ${bed.crackAt}s, mean ${bed.rms}dB).`);
  if (overlap) {
    console.log(`NOTE(${v}): long carrier (${carrierDur.toFixed(1)}s) — voice plays ${voiceStart}-${(voiceStart + voiceSpan).toFixed(1)}s (tail rides the smoke rise), endcard outro audio mixed from ${(openDur + bodyDur).toFixed(1)}s; carrier content beyond ${voiceSpan}s discarded.`);
  } else if (bedLen > 0.05) {
    console.log(`NOTE(${v}): carrier VO covers ${voiceStart}-${(voiceStart + voiceSpan).toFixed(1)}s; endcard hum beds to ${(openDur + bodyDur).toFixed(1)}s (modals after the VO). A full ~${total}s track would replace all reel audio.`);
  }
  const lockup = join(REELS, `_lockup_${v}.png`);
  const out = join(REELS, `${kind}_${stamp}.mp4`);
  const out1x1 = join(REELS, `${kind}_${stamp}_1x1.mp4`);
  const sheet = join(REELS, `${kind}_${stamp}_contact.png`);

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
    // MKT-12: stinger takes input [6] — appended so [0]-[5] and every hardcoded
    // index in the graph below are undisturbed.
    (sting ? `-i "${sting.path}" ` : ``) +
    `-filter_complex "` +
    (intro
      ? `[0:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${openBase},setpts=PTS-STARTPTS[lk0];`
      : `[0:v]format=yuv420p,setsar=1,fps=60,settb=AVTB[lk0];`) +
    // Intro smoke → stinger smoke. Both are full-frame smoke but NOT the same
    // smoke (saturation 98.5 vs 119.8, different texture), so a hard cut pops —
    // hence a short dissolve rather than the butt-cut Phase 0 assumed.
    (sting
      ? `[6:v]scale=1080:1920:flags=lanczos,format=yuv420p,setsar=1,fps=60,settb=AVTB,trim=duration=${STINGER_DUR},setpts=PTS-STARTPTS[stg];` +
        `[lk0][stg]xfade=transition=fade:duration=${INTRO_XFADE}:offset=${+(openBase - INTRO_XFADE).toFixed(2)}[lk];`
      : `[lk0]null[lk];`) +
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
    `[vraw][stmp]overlay=0:0,format=yuv420p[vid];` +
    (intro
      // Intro mode: everything positioned by adelay and amixed — intro's own
      // audio 0→openDur, VO enters at openDur−0.4, hum bed fills any VO gap,
      // endcard outro audio from the scene cut (crack stays synced).
      ? `[0:a]atrim=0:${openBase},asetpts=PTS-STARTPTS,aresample=48000,apad=whole_dur=${openBase},` +
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${(openBase - 0.3).toFixed(2)}:d=0.3[introaud];` +
        // Stinger keeps its own impact at its native position; it lands well
        // before the VO enters and ~22-25s clear of the endcard crack.
        (sting
          ? `[6:a]atrim=0:${STINGER_DUR},asetpts=PTS-STARTPTS,aresample=48000,` +
            `afade=t=out:st=${(STINGER_DUR - 0.25).toFixed(2)}:d=0.25,` +
            `adelay=${Math.round((openBase - INTRO_XFADE) * 1000)}|${Math.round((openBase - INTRO_XFADE) * 1000)}[stgaud];`
          : ``) +
        `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - 0.25).toFixed(2)}:d=0.25,` +
        `adelay=${msVoice}|${msVoice}[voice];` +
        (bed ? humBed('[4:a]', bedLen, `,adelay=${msBed}|${msBed}[bed];`, bed) : ``) +
        `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4,` +
        `adelay=${msOutro}|${msOutro}[outroaud];` +
        `[introaud]${sting ? '[stgaud]' : ''}[voice]${bedLen > 0.05 ? '[bed]' : ''}[outroaud]amix=inputs=${(bedLen > 0.05 ? 4 : 3) + (sting ? 1 : 0)}:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
      : overlap
      ? `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - 0.25).toFixed(2)}:d=0.25[voice];` +
        `[2:a]atrim=0:${CARD},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:st=0:d=0.05,afade=t=out:st=${(CARD - 0.4).toFixed(2)}:d=0.4,` +
        `adelay=${Math.round((OPEN + bodyDur) * 1000)}|${Math.round((OPEN + bodyDur) * 1000)}[outroaud];` +
        `[voice][outroaud]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" `
      : `[3:a]atrim=0:${voiceSpan},asetpts=PTS-STARTPTS,aresample=48000,` +
    `afade=t=in:st=0:d=0.01,afade=t=out:st=${(voiceSpan - XFADE_A).toFixed(2)}:d=${XFADE_A}[voice];` +
    (bed ? humBed('[4:a]', bedLen, `[bed];`, bed) : ``) +
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
  // MKT-11: sample the MIDPOINT of every modal (the old 6-wide strip caught
  // only modals 1 and 4), so all six in-UI panel placements are verifiable in
  // one artifact. Intro + endcard bookend it, keeping the reel arc visible; the
  // grid tile was dropped as least informative — no panel, no stamp change.
  const STAMPS = [
    0,
    ...Array.from({ length: MODAL_COUNT }, (_, i) => modalWindow(openDur, GRID_DUR, MODAL_HOLD, i)[0] + MODAL_HOLD / 2),
    total - 0.4,
  ].map(t => +t.toFixed(1));
  STAMPS.forEach((t, i) => sh(`ffmpeg -y -loglevel error -ss ${t} -i "${out}" -frames:v 1 -vf "scale=270:480" "${join(REELS, `_cs_${v}${i}.png`)}"`));
  const inputs = STAMPS.map((_, i) => `-i "${join(REELS, `_cs_${v}${i}.png`)}"`).join(' ');
  sh(`ffmpeg -y -loglevel error ${inputs} -filter_complex "[0][1][2][3]hstack=4[r0];[4][5][6][7]hstack=4[r1];[r0][r1]vstack=2" "${sheet}"`);

  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`${kind.toUpperCase()} reel: ${out} · duration ${dur}s · 1x1 + contact sheet written`);
}
