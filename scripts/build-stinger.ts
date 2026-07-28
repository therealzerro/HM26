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

async function build(key: string, v: StingerVariant): Promise<void> {
  const motion = join(ASSETS, v.motion);
  const out = join(ASSETS, stingerFile(key));
  if (!v.enabled) { console.log(`SKIP ${key}: enabled:false — this reel kind assembles with no stinger.`); return; }
  if (!existsSync(motion)) { console.log(`SKIP ${key}: ${v.motion} not delivered yet.`); return; }
  console.log(`${key} → ${stingerFile(key)}  (motion: ${v.motion})`);

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
      `-map "[v]" -map 0:a -c:v libx264 -profile:v high -crf 17 -pix_fmt yuv420p ` +
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
    await build(k, v);
  }
})();
