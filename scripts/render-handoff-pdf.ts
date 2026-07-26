// Render the marketing handoff HTML to PDF. Usage: tsx scripts/render-handoff-pdf.ts <html> <pdf>
import { chromium } from 'playwright';
import { resolve } from 'node:path';

(async () => {
  const html = resolve(process.argv[2]);
  const pdf = resolve(process.argv[3]);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + html, { waitUntil: 'networkidle' });
  await page.pdf({ path: pdf, format: 'Letter', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  await browser.close();
  console.log('wrote ' + pdf);
})();
