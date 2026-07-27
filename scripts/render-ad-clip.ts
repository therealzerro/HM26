// MKT-01 Phase 1 — deterministic UI ad-clip renderer.
//
// Renders ui_raw.mp4 (1080x1920, 60fps, 8.000s = 480 frames) from the live
// Expo web build. NO wall-clock recording: scroll position is computed per
// frame from an ease-in-out curve and set programmatically, then the frame is
// screenshotted. Static holds are one screenshot duplicated per frame.
//
// Beat map (frames @60fps):
//   f000-f179  0.0-3.0s  Results Ledger (Today): one eased scroll, 1.2 viewports
//   f180       3.0s      HARD CUT to Verified Track Record, top
//   f180-f299  3.0-5.0s  static hold on summary stats band
//   f300-f449  5.0-7.5s  one eased scroll of the receipt stream
//   f450-f479  7.5-8.0s  static hold
//
// Usage: tsx scripts/render-ad-clip.ts <workDir> [outMp4]
import { chromium, type Page } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const BASE = 'http://localhost:8081';
const WORK = resolve(process.argv[2] ?? './ad-frames');
const OUT = resolve(process.argv[3] ?? join(WORK, 'ui_raw.mp4'));

const FPS = 60;
const VIEW_H = 960;                       // CSS px; x2 DPR => 1920 output
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;

const fname = (i: number) => join(WORK, `frame_${String(i).padStart(4, '0')}.png`);

// Locate the tallest scrollable container and pin it on window for reuse.
async function bindScroller(page: Page) {
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    let best: HTMLDivElement | null = null;
    for (const d of divs) {
      if (d.scrollHeight > d.clientHeight + 50 && (!best || d.scrollHeight > best.scrollHeight)) best = d;
    }
    (window as any).__adScroll = best;
    if (best) (best.style as any).scrollBehavior = 'auto';
  });
  return page.evaluate(() => {
    const el = (window as any).__adScroll as HTMLDivElement | null;
    return el ? { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null;
  });
}

const setScroll = (page: Page, px: number) =>
  page.evaluate(y => { const el = (window as any).__adScroll; if (el) el.scrollTop = y; }, px);

(async () => {
  mkdirSync(WORK, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 540, height: VIEW_H },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role: 'premium' }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
  });

  // ── Segment 1: Results Ledger eased scroll, f000-f179 ──
  await page.goto(BASE + '/results', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.waitForTimeout(6_000);                       // data + entrance animations settle
  const s1 = await bindScroller(page);
  if (!s1) throw new Error('No scrollable container found on /results');
  const dist1 = Math.min(1.2 * VIEW_H, s1.scrollHeight - s1.clientHeight);
  console.log(`ledger: scrollable ${s1.scrollHeight}px, scrolling ${Math.round(dist1)}px over 180 frames`);
  for (let f = 0; f < 180; f++) {
    await setScroll(page, dist1 * easeInOut(f / 179));
    await page.screenshot({ path: fname(f) });
    if (f % 45 === 0) console.log(`  f${f}`);
  }

  // ── HARD CUT: SPA-navigate to Track Record (no reload) ──
  await page.evaluate(() => {
    window.history.pushState({}, '', '/track-record');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });
  await page.getByText('Verified Track Record').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3_000);                       // count-up + fades fully settle
  const s2 = await bindScroller(page);
  if (!s2) throw new Error('No scrollable container found on /track-record');
  await setScroll(page, 0);
  await page.waitForTimeout(300);

  // ── Segment 2: static hold on stats band, f180-f299 (one shot, duplicated) ──
  await page.screenshot({ path: fname(180) });
  for (let f = 181; f < 300; f++) copyFileSync(fname(180), fname(f));
  console.log('hold on stats band: f180-f299');

  // ── Segment 3: eased receipt scroll, f300-f449 ──
  const dist2 = Math.min(1.1 * VIEW_H, s2.scrollHeight - s2.clientHeight);
  console.log(`receipts: scrollable ${s2.scrollHeight}px, scrolling ${Math.round(dist2)}px over 150 frames`);
  for (let f = 300; f < 450; f++) {
    await setScroll(page, dist2 * easeInOut((f - 300) / 149));
    await page.screenshot({ path: fname(f) });
    if ((f - 300) % 50 === 0) console.log(`  f${f}`);
  }

  // ── Segment 4: final hold, f450-f479 ──
  for (let f = 450; f < 480; f++) copyFileSync(fname(449), fname(f));
  console.log('final hold: f450-f479');

  await browser.close();

  // ── Assemble with ffmpeg: 480 frames @60fps = 8.000s exactly ──
  execSync(
    `ffmpeg -y -loglevel error -framerate ${FPS} -i "${join(WORK, 'frame_%04d.png')}" ` +
    `-frames:v 480 -c:v libx264 -pix_fmt yuv420p -r ${FPS} -crf 18 -movflags +faststart "${OUT}"`,
    { stdio: 'inherit' },
  );
  execSync(`ffprobe -v error -show_entries format=duration -show_entries stream=width,height,r_frame_rate -of default=noprint_wrappers=1 "${OUT}"`, { stdio: 'inherit' });
  console.log(`wrote ${OUT}`);
})();
