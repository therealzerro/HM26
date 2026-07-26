// Capture consumer screens from the Expo web build with a phone viewport.
// Usage: tsx capture-screens.ts <outDir> [role]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:8081';
const OUT = process.argv[2] ?? './screencaps';
const ROLE = process.argv[3] ?? 'free'; // 'free' | 'premium'

const ROUTES: Array<[string, string]> = [
  ['home', '/'],
  ['slates', '/explore'],
  ['results', '/results'],
  ['book', '/book'],
  ['learn', '/learn'],
  ['account', '/account'],
  ['track-record', '/track-record'],
  ['paywall', '/paywall'],
  ['pattern-explorer', '/pattern-explorer'],
];

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  // Prime localStorage (AsyncStorage web backend) before app scripts run.
  await page.addInitScript(role => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
  }, ROLE);

  // First load bundles the app — allow plenty of time.
  console.log('loading app (first bundle can take ~60s)...');
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.waitForTimeout(12_000);

  for (const [name, route] of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(6_000); // let queries resolve + skeletons clear
      await page.screenshot({ path: join(OUT, `${ROLE}_${name}.png`) });
      console.log(`captured ${ROLE}_${name}.png`);
    } catch (e) {
      console.error(`FAILED ${name}: ${(e as Error).message.split('\n')[0]}`);
    }
  }

  await browser.close();
})();
