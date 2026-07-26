// Render App-Store-style framed shots (1290x2796) from appstore-shots.html.
// Usage: tsx scripts/render-appstore-shots.ts <html> <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const NAMES = ['01_home', '02_signals', '03_ledger', '04_track_record', '05_number_book', '06_pattern_explorer'];

(async () => {
  const html = resolve(process.argv[2]);
  const out = resolve(process.argv[3]);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 2900 }, deviceScaleFactor: 1 });
  await page.goto('file://' + html, { waitUntil: 'networkidle' });
  for (let i = 0; i < NAMES.length; i++) {
    const el = page.locator(`#s${i + 1}`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await el.screenshot({ path: join(out, `${NAMES[i]}.png`) });
    console.log(`rendered ${NAMES[i]}.png`);
  }
  await browser.close();
})();
