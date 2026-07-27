// MKT-07 — reel "slate stamp": the burned-in day · scope · purpose chip.
//
// Renders a transparent 1080x1920 PNG carrying the reel's provenance so every
// cut (9:16 and the crop=1080:1080:0:420 1:1) shows WHICH day the content is
// for and WHY the viewer is looking at it. The stamp is an overlay layer
// composited at assembly time — never part of a carrier/endcard/VO, so those
// assets stay date-agnostic and rotate freely.
//
// The chip sits at y=470, inside the band that survives the 1:1 crop
// (420-1500) and below the 9:16 platform top UI. Position/type never rotate —
// only the accent color changes by purpose (drop=cyan, verify=green).
//
// Text derives from the same YYYYMMDD stamp the assemblers validate against
// slate_snapshots — never hand-typed, so it cannot disagree with the data.
//
// Usage: tsx scripts/render-reel-stamp.ts <drop|verify> <YYYYMMDD> <scope|-> <out.png>
//   scope "-" omits the scope tag (the verify reel is cross-scope).
import { chromium } from 'playwright';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PURPOSES = {
  drop:   { eyebrow: "TODAY'S DATA DROP", accent: '#2bffcc' },
  verify: { eyebrow: '✓ VERIFIED RESULTS', accent: '#34c759' },
} as const;

const [, , purposeArg, ymd, scopeArg, outArg] = process.argv;
const purpose = PURPOSES[purposeArg as keyof typeof PURPOSES];
if (!purpose || !/^\d{8}$/.test(ymd ?? '') || !scopeArg || !outArg) {
  console.error('Usage: tsx scripts/render-reel-stamp.ts <drop|verify> <YYYYMMDD> <scope|-> <out.png>');
  process.exit(1);
}
const out = resolve(outArg);

// Date-only math in UTC — no clock/timezone involvement, deterministic.
const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dateLine = [`${DAYS[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`]
  .concat(scopeArg === '-' ? [] : [scopeArg.toUpperCase()])
  .join(' · ');

const FONT_DIR = resolve('node_modules/@expo-google-fonts/jetbrains-mono');
const mono700 = `${FONT_DIR}/700Bold/JetBrainsMono_700Bold.ttf`;
const mono500 = `${FONT_DIR}/500Medium/JetBrainsMono_500Medium.ttf`;
if (!existsSync(mono700) || !existsSync(mono500)) {
  console.error(`ABORT: JetBrains Mono ttf not found under ${FONT_DIR} — stamp must use the app's mono face.`);
  process.exit(1);
}

const html = `<!doctype html><html><head><style>
  @font-face { font-family: JBM; src: url('file://${mono700}'); font-weight: 700; }
  @font-face { font-family: JBM; src: url('file://${mono500}'); font-weight: 500; }
  * { margin: 0; padding: 0; }
  body { width: 1080px; height: 1920px; background: transparent; overflow: hidden; }
  .chip {
    position: absolute; top: 470px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 7px;
    padding: 20px 40px; border-radius: 24px;
    background: rgba(8, 10, 22, 0.74);
    border: 2px solid ${purpose.accent}59;
    box-shadow: 0 0 34px rgba(0, 0, 0, 0.45);
    white-space: nowrap;
  }
  .eyebrow {
    font: 500 27px JBM; letter-spacing: 5px; color: ${purpose.accent};
    text-shadow: 0 0 18px ${purpose.accent}66;
  }
  .date { font: 700 42px JBM; letter-spacing: 3px; color: #ffffff; }
</style></head><body>
  <div class="chip"><div class="eyebrow">${purpose.eyebrow}</div><div class="date">${dateLine}</div></div>
</body></html>`;

(async () => {
  // Serve the page from a real file — file:// @font-face URLs are blocked
  // from setContent's about:blank origin and fall back to a serif silently.
  const tmpHtml = join(tmpdir(), `reel-stamp-${ymd}-${purposeArg}.html`);
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts.ready);
  const loaded = await page.evaluate(() => (document as any).fonts.check('700 42px JBM'));
  await page.screenshot({ path: out, omitBackground: true });
  await browser.close();
  rmSync(tmpHtml, { force: true });
  if (!loaded) {
    console.error('ABORT: JetBrains Mono failed to load — stamp would render in a fallback face.');
    process.exit(1);
  }
  console.log(`stamp: ${out} · "${purpose.eyebrow}" · "${dateLine}"`);
})();
