// One continuous marketing clip: Results Ledger slow scroll → cut to
// Verified Track Record (stats count-up) → one scroll → hold.
// Usage: tsx scripts/capture-clip-ledger-track.ts <outDir> [role]
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:8081';
const OUT = process.argv[2] ?? './screenvideos';
const ROLE = process.argv[3] ?? 'premium';

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Warm pass (no recording) so the recorded context loads near-instantly.
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
  await page.addInitScript(role => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
  }, ROLE);

  const t0 = Date.now();
  const mark = (label: string) => console.log(`t=${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);

  await page.goto(BASE + '/results', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(2_500);
  // Wheel events fire at the pointer position — park it over the list body
  // (default (0,0) targets the non-scrollable header and nothing moves).
  await page.mouse.move(196, 550);
  mark('LEDGER settled — slow scroll begins');

  // ~5s slow drift down the ledger (80px every 160ms).
  for (let i = 0; i < 31; i++) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(160);
  }
  mark('cut to TRACK RECORD');

  await page.goto(BASE + '/track-record', { waitUntil: 'networkidle', timeout: 60_000 });
  // RN-web fully reboots on hard navigation — wait for real content before
  // the hold so the white reload gap stays trimmable at the cut point.
  await page.getByText('Verified Track Record').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  mark('TRACK RECORD rendered — stats hold');
  await page.mouse.move(196, 550);
  await page.waitForTimeout(2_800);   // stats count-up plays; hold on summary
  mark('one scroll');

  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(2_200);   // final hold
  mark('end hold done');

  await page.close();
  const video = await page.video()?.path();
  await ctx.close();
  await browser.close();
  if (video) {
    const dest = join(OUT, `clip_ledger-to-trackrecord_${ROLE}.webm`);
    renameSync(video, dest);
    console.log(`recorded ${dest}`);
  }
})();
