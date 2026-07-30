import { chromium } from 'playwright';
import { installRedaction } from './reel-redact';
import { installRelabel } from './reel-relabel';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 540, height: 960 }, deviceScaleFactor: 2,
    colorScheme: 'dark', isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role: 'premium' }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
  });
  await page.goto('http://localhost:8081/explore', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.waitForTimeout(5_000);
  await page.getByRole('tab', { name: /All Day/ }).first().click();
  await page.waitForTimeout(3_000);
  await installRedaction(page);
  await page.waitForTimeout(500);
  await installRelabel(page);
  await page.waitForTimeout(500);
  await page.getByText('Grid', { exact: true }).first().click();
  await page.waitForTimeout(3_000);
  await page.mouse.click(150, 777);
  await page.waitForTimeout(2_500);
  const before = await page.evaluate(() => {
    const hits: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.children.length && /\bstraight\b/i.test(el.textContent || '')) hits.push(el.textContent || '');
    }
    return hits;
  });
  console.log('BEFORE manual sweep:', JSON.stringify(before));
  // manually re-apply the swap to that element and see if it takes
  const after = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.children.length && /\bstraight\b/i.test(el.textContent || '')) {
        const t = (el.textContent || '').replace(/\bstraights?\b/gi, 'in order');
        el.textContent = t;
        out.push(el.textContent || '');
      }
    }
    return out;
  });
  console.log('AFTER manual swap:', JSON.stringify(after));
  await page.waitForTimeout(1000);
  const later = await page.evaluate(() => {
    const hits: string[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.children.length && /\bstraight\b/i.test(el.textContent || '')) hits.push(el.textContent || '');
    }
    return hits;
  });
  console.log('1s LATER (did React revert?):', JSON.stringify(later));
  await browser.close();
})();
