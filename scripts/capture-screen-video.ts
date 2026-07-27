// Record clean scripted screen videos of the Expo web build (phone viewport)
// for marketing footage. One .webm per screen, smooth scroll-through.
// Usage: tsx scripts/capture-screen-video.ts <outDir> [role]
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:8081';
const OUT = process.argv[2] ?? './screenvideos';
const ROLE = process.argv[3] ?? 'premium';

// [name, route, scroll steps (wheel ticks of 300px)]
const ROUTES: Array<[string, string, number]> = [
  ['home', '/', 14],
  ['slates', '/explore', 12],
  ['results', '/results', 12],
  ['track-record', '/track-record', 12],
  ['book', '/book', 6],
  ['pattern-explorer', '/pattern-explorer', 6],
];

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const [name, route, steps] of ROUTES) {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: OUT, size: { width: 393, height: 852 } },
    });
    const page = await ctx.newPage();
    await page.addInitScript(role => {
      try {
        window.localStorage.setItem('user', JSON.stringify({ id: 'default', role }));
        window.localStorage.setItem('hm:theme-mode', 'dark');
        window.localStorage.setItem('onboarding_complete', 'true');
      } catch {}
    }, ROLE);

    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 180_000 });
    await page.waitForTimeout(6_000);   // data + skeletons settle; opening hold
    await page.mouse.move(196, 550);    // wheel targets the pointer position

    // Smooth scroll down, hold, and drift back up.
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1_500);
    for (let i = 0; i < Math.ceil(steps / 2); i++) {
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(1_500);

    await page.close();
    const video = await page.video()?.path();
    await ctx.close();
    if (video) {
      const dest = join(OUT, `${ROLE}_${name}.webm`);
      renameSync(video, dest);
      console.log(`recorded ${ROLE}_${name}.webm`);
    }
  }

  await browser.close();
})();
