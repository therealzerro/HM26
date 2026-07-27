// MKT-10 — build an endcard from a text-free motion file + a config entry.
//
// WHY: endcards are generated at 720x1280 with the wordmark BAKED into the
// pixels. Reels assemble at 1080x1920, so every run stretched that type 1.5x —
// inventing more than half the pixels of the one element that must read as
// premium, immediately after native-1080 UI footage. Smoke hides resampling;
// thin white letterforms do not.
//
// So: motion stays generated and soft (invisible on smoke), type is rendered
// natively at 1080x1920 and composited. Copy becomes a config string rather
// than a regeneration, which is the real return — the session wave reuses the
// pro motion file verbatim.
//
// Output is the same filename the assemblers already read. No assembler
// changes. Motion audio is passed through UNTOUCHED (-c:a copy) so the crack
// stays sample-aligned to the visual snap.
//
// Usage: tsx scripts/build-endcard.ts <variant|all>
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ENDCARDS, LOCKUP_TOP, CROP_SAFE_BOTTOM, TEXT_FADE_IN, TEXT_FADE_DUR, OUT_W, OUT_H,
  type EndcardVariant,
} from './endcard-config';

const ASSETS = resolve('assets/marketing');
const sh = (c: string) => execSync(c, { stdio: 'inherit' });

const FONT_DIR = resolve('node_modules/@expo-google-fonts/inter');
const BOLD = `${FONT_DIR}/700Bold/Inter_700Bold.ttf`;
const MED = `${FONT_DIR}/500Medium/Inter_500Medium.ttf`;

/**
 * Render the three-line lockup as a transparent 1080x1920 PNG in the app's
 * brand face (Inter — theme.typography.fontFamily.bold/medium).
 *
 * Loads via a real file:// page, NOT setContent: file:// @font-face URLs are
 * blocked from setContent's about:blank origin and Chromium silently falls
 * back to a serif. That failure is visually plausible and completely wrong, so
 * the font is asserted before the screenshot is trusted.
 */
async function renderLockup(lines: [string, string, string], out: string): Promise<void> {
  for (const f of [BOLD, MED]) {
    if (!existsSync(f)) throw new Error(`brand font missing: ${f}`);
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><head><style>
    @font-face { font-family: BRAND; src: url('file://${BOLD}'); font-weight: 700; }
    @font-face { font-family: BRAND; src: url('file://${MED}');  font-weight: 500; }
    * { margin: 0; padding: 0; }
    body { width: ${OUT_W}px; height: ${OUT_H}px; background: transparent; overflow: hidden; }
    .lockup {
      position: absolute; top: ${LOCKUP_TOP}px; left: 0; width: ${OUT_W}px;
      text-align: center; font-family: BRAND; color: #ffffff;
    }
    .l1 { font-weight: 700; font-size: 58px; letter-spacing: 1.5px; }
    .l2 { font-weight: 500; font-size: 30px; letter-spacing: 2.6px; margin-top: 16px; }
    .l3 { font-weight: 500; font-size: 21px; letter-spacing: 2.2px; margin-top: 13px; opacity: .86; }
  </style></head><body>
    <div class="lockup">
      <div class="l1">${esc(lines[0])}</div>
      <div class="l2">${esc(lines[1])}</div>
      <div class="l3">${esc(lines[2])}</div>
    </div>
  </body></html>`;

  const tmpHtml = join(tmpdir(), `endcard-lockup-${process.pid}.html`);
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: OUT_W, height: OUT_H } });
    await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => (document as any).fonts.ready);
    const loaded = await page.evaluate(() => (document as any).fonts.check('700 58px BRAND'));
    if (!loaded) throw new Error('Inter failed to load — lockup would render in a fallback face');
    // Guard the defect this lane exists to fix: the baked endcards put line 3
    // below the 1:1 crop line and the square cut sliced it. Measure the real
    // laid-out block rather than trusting the constants to stay in sync.
    const bottom = await page.evaluate(() => {
      const el = document.querySelector('.lockup') as HTMLElement;
      const r = el.getBoundingClientRect();
      return r.top + r.height;
    });
    if (bottom > CROP_SAFE_BOTTOM) {
      throw new Error(
        `lockup extends to y=${Math.round(bottom)}, past the 1:1 crop line ${CROP_SAFE_BOTTOM} — ` +
          `line 3 would be sliced in the square cutdown. Shorten the copy or raise LOCKUP_TOP.`,
      );
    }
    await page.screenshot({ path: out, omitBackground: true });
    console.log(`  lockup rendered natively at ${OUT_W}x${OUT_H} · block ends y=${Math.round(bottom)} (crop line ${CROP_SAFE_BOTTOM})`);
  } finally {
    await browser.close();
    rmSync(tmpHtml, { force: true });
  }
}

async function build(key: string, v: EndcardVariant): Promise<void> {
  const motion = join(ASSETS, v.motion);
  const out = join(ASSETS, v.out);
  if (!existsSync(motion)) {
    console.log(`SKIP ${key}: ${v.motion} not delivered yet — leaving ${v.out} as-is.`);
    return;
  }
  console.log(`${key} → ${v.out}  (motion: ${v.motion})`);

  // One-time preservation of a delivered baked endcard before it is replaced
  // by a built one; the motion file becomes the source of truth from here.
  const backup = join(ASSETS, v.out.replace(/\.mp4$/, '_baked_backup.mp4'));
  if (existsSync(out) && !existsSync(backup)) {
    copyFileSync(out, backup);
    console.log(`  preserved previous baked endcard → ${v.out.replace(/\.mp4$/, '_baked_backup.mp4')}`);
  }

  const png = join(tmpdir(), `endcard-lockup-${key}.png`);
  await renderLockup(v.lines, png);

  // Motion upscaled with lanczos: the sharpness that matters is the type, and
  // that is native. An ML upscaler would add a heavy dependency to improve
  // pixels (smoke, glow) where resampling is invisible — deliberately not used.
  sh(
    `ffmpeg -y -loglevel error -i "${motion}" -loop 1 -i "${png}" -filter_complex ` +
      `"[0:v]scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p,setsar=1[mot];` +
      `[1:v]format=rgba,fade=t=in:st=${TEXT_FADE_IN}:d=${TEXT_FADE_DUR}:alpha=1[txt];` +
      `[mot][txt]overlay=0:0:format=auto,format=yuv420p[v]" ` +
      `-map "[v]" -map 0:a -c:v libx264 -profile:v high -crf 17 -pix_fmt yuv420p ` +
      `-c:a copy -shortest -movflags +faststart "${out}"`,
  );
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`  ✔ ${v.out} · ${(+dur).toFixed(2)}s · text fades ${TEXT_FADE_IN}-${TEXT_FADE_IN + TEXT_FADE_DUR}s, opaque to final frame`);
}

(async () => {
  const arg = process.argv[2] ?? 'all';
  const keys = arg === 'all' ? Object.keys(ENDCARDS) : [arg];
  for (const k of keys) {
    const v = ENDCARDS[k];
    if (!v) {
      console.error(`ABORT: unknown variant "${k}". Known: ${Object.keys(ENDCARDS).join(', ')}`);
      process.exit(1);
    }
    await build(k, v);
  }
})();
