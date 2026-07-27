// Marketing clip v2 (spec 2026-07-27):
//   0-5s  Results Ledger "Today" — ONE slow deliberate scroll, MATCH badge passes through
//   5-9s  transition into Verified Track Record — beat on summary stats, one slow scroll
//   9-12s hold still
// "Slow is everything — confident thumb, like showing a friend."
//
// The browser's clock is shifted to FAKE_ET so the Today tab is a settled day
// with draws + a match badge regardless of when this runs.
// Usage: tsx scripts/capture-clip-ledger-track-v2.ts <outDir> [role] [fakeIsoEt]
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:8081';
const OUT = process.argv[2] ?? './screenvideos';
const ROLE = process.argv[3] ?? 'premium';
// Default: yesterday 7:30 PM ET relative to real now (a fully-imported day).
const FAKE_TIME_MS = process.argv[4]
  ? Date.parse(process.argv[4])
  : Date.now() - 24 * 3600 * 1000;

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Warm pass so the recorded context loads near-instantly.
  const warm = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const wp = await warm.newPage();
  await wp.goto(BASE + '/results', { waitUntil: 'networkidle', timeout: 180_000 });
  await wp.goto(BASE + '/track-record', { waitUntil: 'networkidle', timeout: 60_000 });
  await warm.close();

  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: OUT, size: { width: 393, height: 852 } },
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ role, fakeMs }) => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
    // Shift the clock: Date reports fakeMs-anchored time; timers keep running.
    const Real = Date;
    const offset = fakeMs - Real.now();
    // @ts-ignore
    window.Date = class extends Real {
      constructor(...args: any[]) {
        if (args.length === 0) super(Real.now() + offset);
        // @ts-ignore
        else super(...args);
      }
      static now() { return Real.now() + offset; }
    };
  }, { role: ROLE, fakeMs: FAKE_TIME_MS });

  const t0 = Date.now();
  const mark = (label: string) => console.log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);

  await page.goto(BASE + '/results', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2_500);
  await page.mouse.move(196, 550);
  mark('LEDGER settled — one slow scroll');

  // ONE slow deliberate scroll (~4.5s, 45px every 140ms) — the MATCH badge
  // card sits at the top of the ledger and exits the frame during the drift.
  for (let i = 0; i < 32; i++) {
    await page.mouse.wheel(0, 45);
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(800);
  mark('transition to TRACK RECORD');

  // Prefer an in-app SPA transition (no white reload). Fall back to hard goto.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/track-record');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });
  await page.waitForTimeout(1_500);
  const spaWorked = await page.getByText('Verified Track Record').isVisible().catch(() => false);
  if (!spaWorked) {
    mark('SPA transition failed — hard goto fallback');
    await page.goto(BASE + '/track-record', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByText('Verified Track Record').waitFor({ timeout: 60_000 });
  }
  await page.mouse.move(196, 550);
  mark('TRACK RECORD — beat on stats');
  await page.waitForTimeout(2_200);

  mark('one slow receipt scroll');
  for (let i = 0; i < 21; i++) {
    await page.mouse.wheel(0, 45);
    await page.waitForTimeout(140);
  }
  mark('final hold');
  await page.waitForTimeout(3_000);
  mark('end');

  await page.close();
  const video = await page.video()?.path();
  await ctx.close();
  await browser.close();
  if (video) {
    const dest = join(OUT, `clip_v2_ledger-tap-trackrecord_${ROLE}.webm`);
    renameSync(video, dest);
    console.log(`recorded ${dest}`);
  }
})();
