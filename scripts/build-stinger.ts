// MKT-12 — build a per-variant stinger from the shared motion clip + copy.
//
// Mirrors build-endcard.ts deliberately: same native-text approach, same font
// safety, same "copy is config, not an asset" payoff. Output is a finished
// 3.0s clip per variant, so the daily assembly never runs Playwright.
//
// The lockup ANIMATES (3% scale-up, two lines staggered), which a single
// transparent PNG cannot express — so the in/out window is rendered as a short
// frame sequence and padded with transparency either side. Only the animated
// window is rendered; the static hold is one repeated frame.
//
// Usage: tsx scripts/build-stinger.ts [variant|all]
import { chromium, type Page } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stingerMotionSetFor, builtStingerName, FADE_TARGET_TOLERANCE, type MotionVariant } from './brand-motion';
import {
  STINGERS, STINGER_DUR, TEXT_IN_START, TEXT_IN_DUR, TEXT_OUT_START, TEXT_OUT_DUR,
  LINE_STAGGER, TEXT_SCALE_FROM, TEXT_FPS, LOCKUP_TOP, CROP_SAFE_BOTTOM,
  OUT_W, OUT_H, stingerFile, type StingerVariant,
} from './stinger-config';

const ASSETS = resolve('assets/marketing');
const sh = (c: string) => execSync(c, { stdio: 'inherit' });

const FONT_DIR = resolve('node_modules/@expo-google-fonts/inter');
const BOLD = `${FONT_DIR}/700Bold/Inter_700Bold.ttf`;
const MED = `${FONT_DIR}/500Medium/Inter_500Medium.ttf`;

/** Eased 0..1 — matches the reel's other motion (cosine ease-in-out). */
const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;

/**
 * MKT-19 — authored per-motion audio correction.
 *
 * Only `stinger_motion_circuit` declares one. It carries a second transient (a
 * gold pulse at 2.7s) on top of its hero beat at 1.4s; the lockup is out by
 * 2.4s, so the pulse fires on an empty frame 0.3s before the cut to the body and
 * reads as a pop against the dissolve. Fading from 2.45s to silence by 2.70s
 * removes it while leaving the 2.3s smoke-return whoosh intact.
 *
 * Reaching true silence before the stinger ends is not a compromise here — the
 * carrier VO is already running underneath by this point, and the assembler
 * crossfades into the body regardless.
 */
const FADE_TO_SILENCE = 0.25;

/** Per-0.1s peak envelope of a file's audio, in dB. */
function peaks(file: string): Array<[number, number]> {
  const out = execSync(
    `ffmpeg -hide_banner -v error -i "${file}" -af "aformat=channel_layouts=mono,asetnsamples=4800,` +
      `astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level:file=-" -f null - 2>/dev/null || true`,
    { shell: '/bin/bash' },
  ).toString();
  const r: Array<[number, number]> = [];
  let t = 0;
  for (const l of out.split('\n')) {
    const pt = l.match(/pts_time:([\d.]+)/); if (pt) t = parseFloat(pt[1]);
    const v = l.match(/Peak_level=(-?[\d.]+|-?inf)/);
    if (v) r.push([+t.toFixed(1), v[1] === '-inf' ? -120 : parseFloat(v[1])]);
  }
  return r;
}

/**
 * Transients by PROMINENCE — how far a peak jumps above the floor just before
 * it — not by absolute level.
 *
 * Calibrated against the real set, because the first cut of this used "any local
 * maximum above -12dB" and immediately warned on two healthy assets. Measured
 * over 2.2-3.0s:
 *   circuit   -21.9dB -> -4.7dB  = 17.2dB rise   the gold pulse. A pop.
 *   incumbent -12.4dB -> -6.7dB  =  5.6dB rise   the smoke-return swell.
 *   strike    -13.0dB -> -6.0dB  =  7.0dB rise   the smoke-return swell.
 * The incumbent has shipped daily for weeks with its 2.8s peak and nobody has
 * ever remarked on it, which is the evidence that a broad swell is not the
 * defect. What makes circuit a pop is the SHARPNESS of the rise, so that is what
 * gets measured. A guard that cries wolf on two of three assets would train the
 * operator to skim past it — worse than no guard.
 */
const PROMINENCE_DB = 12;
const PROMINENCE_LOOKBACK = 0.4;
function transients(file: string, within: number): number[] {
  const p = peaks(file).filter(([t]) => t <= within);
  const out: number[] = [];
  for (let i = 1; i < p.length - 1; i++) {
    const [t, db] = p[i];
    if (db < p[i - 1][1] || db <= p[i + 1][1]) continue;          // local max only
    const back = p.filter(([bt]) => bt >= t - PROMINENCE_LOOKBACK && bt < t);
    if (!back.length) continue;
    const floor = Math.min(...back.map(([, d]) => d));
    if (db - floor >= PROMINENCE_DB) out.push(t);
  }
  return out;
}

/**
 * MKT-19 ruling: the build owns the correction's continued justification.
 *
 * Re-derives this motion's transients and checks the authored fade still earns
 * its place. Returns the ffmpeg audio filter, or '' when the correction should
 * not be applied. Warnings are printed rather than thrown — a stale correction
 * degrades a brand beat, it does not break a reel, and failing the build would
 * block the daily run over a cosmetic regression.
 */
/**
 * MKT-23 — the ATTACK-SHAPE-BLIND check, and why it exists.
 *
 * `transients()` scores by PROMINENCE: a 12 dB rise over the preceding 0.4s. A
 * motion that ramps in over longer has an already-high lookback floor, so a
 * genuinely loud beat scores near zero. Measured: `imprint` reports 0 transients
 * while peaking at −1.0 dB with a 51.6 dB range, and `strike` — shipping daily —
 * reports 0 the same way.
 *
 * So "0 transients" means "no 12 dB rise over 0.4s", NOT "no transients". That
 * is the same shape as "no numerals found" reading as comprehensive when it is
 * only a search result (MKT-21). A gradual-attack beat at 2.7s — the circuit
 * defect with a soft attack — would sail straight through the prominence pass.
 *
 * This second pass ignores attack shape entirely: any late-window peak that
 * stands more than LATE_PEAK_OVER_FLOOR above the clip's own quiet floor is
 * flagged for a human listen. It cannot distinguish a musical swell from a hit,
 * which is exactly why it asks for an ear rather than failing the build.
 */
/**
 * RETUNED 2026-07-29 after auditioning imprint against strike. The first cut
 * keyed on peak-over-clip-floor at 18dB and flagged TWO of four motions,
 * including `strike`, which ships daily with no reported pop — the same
 * cry-wolf failure MKT-19 hit with its first prominence attempt.
 *
 * The measurement that actually separates them is neither attack rate nor peak
 * height. Both were tested and both fail:
 *   attack rate  imprint 38 dB/s, incumbent 40, circuit 53, strike 61 — strike
 *                is STEEPER than the known pop, so this ranks them backwards.
 *   peak height  all four within 2.7dB of each other.
 * What separates them is WHAT THE BEAT ARRIVES ON TOP OF:
 *   circuit    prior material -32.7dB  <- near-silent: an isolated event
 *   strike     prior material -15.2dB  <- crest on the smoke-return whoosh
 *   imprint    prior material -13.0dB  <- crest, loudest of the four
 *   incumbent  prior material -15.1dB  <- crest
 * Circuit's beat fires into a quiet field, which is exactly why MKT-19
 * described it landing "on an empty frame" — the frame is empty and so is the
 * track. The other three are crests on material already playing, which is why
 * nobody has ever remarked on them.
 *
 * 17.6dB of separation between circuit and the next quietest, so the threshold
 * sits in open space rather than being fitted to one asset.
 */
/**
 * ⚠ THRESHOLD MUST MATCH THE RESOLUTION IT IS EVALUATED AT. The separation above
 * was measured at 10ms buckets, where circuit's prior material reads -32.7dB —
 * but `peaks()` runs at 100ms (asetnsamples=4800), and at that resolution the
 * same stretch reads -24.5dB, because a coarser bucket takes the loudest sample
 * in each 100ms rather than the quiet troughs between. Set at -25 from the 10ms
 * figures, the check cleared circuit — the exact asset it exists to catch.
 * Re-derived at the resolution the code actually uses: circuit -24.5 against
 * strike -11.3, imprint -10.1, incumbent -11.7, fracture -8.1. A 12.8dB gap, so
 * -18 sits in open space rather than being fitted to circuit.
 */
const QUIET_BEFORE_DB = -18;
const PRIOR_FROM = 1.8, PRIOR_TO = 2.3;

function latePeakFlag(motionPath: string, usedWindow: number, from: number): string | null {
  const p = peaks(motionPath).filter(([t]) => t <= usedWindow);
  if (!p.length) return null;
  const late = p.filter(([t]) => t >= from);
  const prior = p.filter(([t]) => t >= PRIOR_FROM && t <= PRIOR_TO).map(([, d]) => d);
  if (!late.length || !prior.length) return null;
  const [t, db] = late.reduce((a, b) => (b[1] > a[1] ? b : a));
  const material = prior.sort((a, b) => a - b)[Math.floor(prior.length / 2)];   // median
  if (material > QUIET_BEFORE_DB) return null;   // a crest on material, not an isolated hit
  return `${t.toFixed(1)}s at ${db.toFixed(1)}dB, arriving after the track drops to ${material.toFixed(1)}dB — an isolated beat in a quiet field, not a crest on the smoke return`;
}

function audioFilter(mv: MotionVariant, motionPath: string, usedWindow: number): string {
  const found = transients(motionPath, usedWindow);
  // Attack-shape-blind second opinion — see above. Runs regardless of whether
  // the prominence pass found anything, because its whole point is the case the
  // prominence pass cannot see.
  const blind = latePeakFlag(motionPath, usedWindow, 2.4);
  if (blind && !mv.audioFadeFrom) {
    console.log(
      `  ⚠️  ${mv.file}: LATE PEAK at ${blind} — after the lockup is out (2.4s). ` +
      `The prominence pass may not have flagged this if the attack is gradual; LISTEN before shipping.`,
    );
  }
  // A transient inside the final stretch of the used window is the defect class:
  // it fires after the lockup is gone and lands against the dissolve.
  const LATE = 0.6;
  const late = found.filter(t => t >= usedWindow - LATE);

  if (mv.audioFadeFrom == null) {
    if (late.length) {
      console.log(
        `  ⚠️  ${mv.file}: uncovered transient(s) at ${late.map(t => t + 's').join(', ')} — inside the last ${LATE}s of the ${usedWindow}s window, ` +
        `so they fire after the lockup is out and land against the dissolve. This is the circuit defect in a new asset; consider an authored fade.`,
      );
    }
    return '';
  }

  const target = mv.audioFadeAgainst;
  const stillThere = target == null || found.some(t => Math.abs(t - target) <= FADE_TARGET_TOLERANCE);
  if (!stillThere) {
    console.log(
      `  ⚠️  ${mv.file}: authored fade targets a transient at ${target}s, but none was re-derived there ` +
      `(found: ${found.length ? found.map(t => t + 's').join(', ') : 'none'}). The asset appears to have been regenerated — ` +
      `NOT applying the fade. Remove audioFadeFrom/audioFadeAgainst from brand-motion.ts.`,
    );
    return '';
  }
  // Anything late the fade does not actually reach is still worth reporting.
  const uncovered = late.filter(t => t < mv.audioFadeFrom!);
  if (uncovered.length) {
    console.log(`  ⚠️  ${mv.file}: transient(s) at ${uncovered.map(t => t + 's').join(', ')} land BEFORE the fade starts (${mv.audioFadeFrom}s) — not suppressed.`);
  }
  console.log(`  audio: fade from ${mv.audioFadeFrom}s (target transient at ${target}s re-derived, justified)`);
  return `-af "afade=t=out:st=${mv.audioFadeFrom}:d=${FADE_TO_SILENCE}"`;
}

/** Per-line opacity + scale at time `t` within the stinger. */
function lineState(t: number, index: number): { opacity: number; scale: number } {
  const start = TEXT_IN_START + index * LINE_STAGGER;
  const inP = ease((t - start) / TEXT_IN_DUR);
  const outP = ease((t - TEXT_OUT_START) / TEXT_OUT_DUR);
  return {
    opacity: Math.max(0, inP - outP),
    scale: TEXT_SCALE_FROM + (1 - TEXT_SCALE_FROM) * inP,
  };
}

async function openPage(lines: [string, string]): Promise<{ page: Page; close: () => Promise<void> }> {
  for (const f of [BOLD, MED]) if (!existsSync(f)) throw new Error(`brand font missing: ${f}`);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><head><style>
    @font-face { font-family: BRAND; src: url('file://${BOLD}'); font-weight: 700; }
    @font-face { font-family: BRAND; src: url('file://${MED}');  font-weight: 500; }
    * { margin: 0; padding: 0; }
    body { width: ${OUT_W}px; height: ${OUT_H}px; background: transparent; overflow: hidden; }
    .lockup { position: absolute; top: ${LOCKUP_TOP}px; left: 0; width: ${OUT_W}px;
              text-align: center; font-family: BRAND; color: #ffffff; }
    .l { transform-origin: 50% 50%; }
    .l1 { font-weight: 700; font-size: 46px; letter-spacing: 1.4px; }
    .l2 { font-weight: 500; font-size: 24px; letter-spacing: 2.4px; margin-top: 14px; }
  </style></head><body>
    <div class="lockup">
      <div class="l l1" id="l0">${esc(lines[0])}</div>
      <div class="l l2" id="l1">${esc(lines[1])}</div>
    </div>
  </body></html>`;

  // Real file:// page + font assertion — setContent silently falls back to a
  // serif because file:// @font-face is blocked from about:blank's origin.
  const tmpHtml = join(tmpdir(), `stinger-lockup-${process.pid}.html`);
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: OUT_W, height: OUT_H } });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts.ready);
  if (!(await page.evaluate(() => (document as any).fonts.check('700 46px BRAND')))) {
    await browser.close();
    throw new Error('Inter failed to load — lockup would render in a fallback face');
  }
  // Guard the defect MKT-10 exists to prevent: the 1:1 crop keeps y 420-1500,
  // and there is only ~196px of clear space under the bolt. Measure, don't trust.
  const bottom = await page.evaluate(() => {
    const el = document.querySelector('.lockup') as HTMLElement;
    const r = el.getBoundingClientRect();
    return r.top + r.height;
  });
  if (bottom > CROP_SAFE_BOTTOM) {
    await browser.close();
    throw new Error(`lockup extends to y=${Math.round(bottom)}, past the 1:1 crop line ${CROP_SAFE_BOTTOM} — shorten the copy or raise LOCKUP_TOP`);
  }
  console.log(`  lockup laid out natively at ${OUT_W}x${OUT_H} · block ends y=${Math.round(bottom)} (crop line ${CROP_SAFE_BOTTOM})`);
  return { page, close: async () => { await browser.close(); rmSync(tmpHtml, { force: true }); } };
}

async function build(key: string, v: StingerVariant, mv: MotionVariant): Promise<void> {
  const motion = join(ASSETS, mv.file);
  const outName = builtStingerName(key, mv.tag);
  const out = join(ASSETS, outName);
  if (!v.enabled) { console.log(`SKIP ${key}: enabled:false — this reel kind assembles with no stinger.`); return; }
  if (!existsSync(motion)) { console.log(`SKIP ${key}/${mv.tag}: ${mv.file} not delivered yet.`); return; }
  console.log(`${key}/${mv.tag} → ${outName}  (motion: ${mv.file} — ${mv.label})`);

  const frameDir = join(tmpdir(), `stinger-frames-${key}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const { page, close } = await openPage(v.lines);
  try {
    // Only the animated window needs frames; before it the lockup is absent and
    // after it the smoke has refilled, so both ends are pure transparency.
    const t0 = TEXT_IN_START;
    const t1 = TEXT_OUT_START + TEXT_OUT_DUR;
    const n = Math.round((t1 - t0) * TEXT_FPS);
    for (let i = 0; i < n; i++) {
      const t = t0 + i / TEXT_FPS;
      const states = [0, 1].map(idx => lineState(t, idx));
      await page.evaluate(s => {
        s.forEach((st: { opacity: number; scale: number }, idx: number) => {
          const el = document.getElementById(`l${idx}`) as HTMLElement;
          el.style.opacity = String(st.opacity);
          el.style.transform = `scale(${st.scale})`;
        });
      }, states);
      await page.screenshot({ path: join(frameDir, `f_${String(i).padStart(4, '0')}.png`), omitBackground: true });
    }
    console.log(`  ${n} lockup frames rendered (${t0}s-${t1}s @ ${TEXT_FPS}fps)`);
  } finally {
    await close();
  }

  // Motion upscaled with lanczos — the sharpness that matters is the type, and
  // that is native. Lockup sequence padded with transparency to cover 0-3.0s.
  sh(
    `ffmpeg -y -loglevel error -t ${STINGER_DUR} -i "${motion}" ` +
      `-framerate ${TEXT_FPS} -i "${join(frameDir, 'f_%04d.png')}" -filter_complex ` +
      `"[0:v]scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p,setsar=1,fps=60[mot];` +
      `[1:v]format=rgba,fps=60,tpad=start_duration=${TEXT_IN_START}:start_mode=add:color=0x00000000,` +
      `tpad=stop_duration=${STINGER_DUR}:stop_mode=add:color=0x00000000,trim=duration=${STINGER_DUR},setpts=PTS-STARTPTS[txt];` +
      `[mot][txt]overlay=0:0:format=auto,format=yuv420p,trim=duration=${STINGER_DUR},setpts=PTS-STARTPTS[v]" ` +
      `-map "[v]" -map 0:a ${audioFilter(mv, motion, STINGER_DUR)} -c:v libx264 -profile:v high -crf 17 -pix_fmt yuv420p ` +
      `-c:a aac -b:a 192k -ar 48000 -t ${STINGER_DUR} -movflags +faststart "${out}"`,
  );
  rmSync(frameDir, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`  ✔ ${stingerFile(key)} · ${(+dur).toFixed(2)}s · "${v.lines[0]}" / "${v.lines[1]}"`);
}

(async () => {
  const arg = process.argv[2] ?? 'all';
  const keys = arg === 'all' ? Object.keys(STINGERS) : [arg];
  for (const k of keys) {
    const v = STINGERS[k];
    if (!v) { console.error(`ABORT: unknown variant "${k}". Known: ${Object.keys(STINGERS).join(', ')}`); process.exit(1); }
    // MKT-19: one built stinger per (variant x motion). The set is per kind —
    // verify's includes its pinned seal (never built for a slate kind).
    for (const mv of stingerMotionSetFor(k)) {
      if (!existsSync(join(ASSETS, mv.file))) {
        console.log(`  SKIP ${builtStingerName(k, mv.tag)} — motion source ${mv.file} not delivered`);
        continue;
      }
      await build(k, v, mv);
    }
  }
})();
