// MKT-86 — THE STRAIGHT STATE STAMP (operator order, 2026-10-15: "when a
// straight is matched we need an exaggerated stamp naming the state in the
// body of the verify reels").
//
// A transparent 1080x1920 overlay carrying ONLY the stamp:
//
//        STRAIGHT MATCH
//          WISCONSIN
//
// gold on a dark plate, rotated, big. The verify assembler composites it over
// the FIRST FEATURED HOLD on verify / verify_midday when that hold is a
// STRAIGHT row (the same condition as the MKT-63 strike; the stamp lands
// 0.35s after the bolt and rides to the end of the hold). NEVER on the public
// cut: tier 1 forbids state names and "STRAIGHT" (MKT-30/MKT-40).
//
// GEOMETRY (measured on the 2026-10-13 verify_midday build, body frame at
// strike+0.9s): the featured row's band starts at y≈890 on the 1920px frame
// at the hold's first frame, with the combo digits at x≈75–230 and the badge
// + "Drew … in <ST> <session>" attribution to their right. Two cases follow
// from the renderer's parkAt: a PARKED row stays put (centre ≈946) through
// the push-in; a FIRST-VIEWPORT row (pan dropped, scroll clamped at 0) drifts
// DOWN with the top-left-anchored zoom (top 890 → ~1140 at 1.28×). A stamp
// fixed in the frame therefore cannot ride the row — it sits JUST ABOVE it:
// the plate's BOTTOM EDGE is pinned at y=880 (--bottom=), so the digits, the
// badge and the attribution stay clear at every zoom in both cases, and the
// plate reads as slammed onto the ledger over the rows above (context rows,
// never the featured proof). Centred on x=640 to stay right of the digits
// column at the window's start; rotated −9°.
//
// Usage: tsx scripts/render-straight-stamp.ts <CODE> <out.png> [--bottom=880]
import { chromium } from 'playwright';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { jurisdictionNameUpper } from '../lib/jurisdictionNames';

const [, , codeArg, outArg] = process.argv;
if (!codeArg || !outArg) {
  console.error('Usage: tsx scripts/render-straight-stamp.ts <CODE> <out.png> [--y=880]');
  process.exit(1);
}
const bArg = process.argv.find(a => a.startsWith('--bottom='))?.slice(9);
const BOTTOM_Y = bArg && /^\d+$/.test(bArg) ? Number(bArg) : 880;
const out = resolve(outArg);
const stateName = jurisdictionNameUpper(codeArg);

// Tier-2/4 vocabulary only ("STRAIGHT MATCH" is the ruled match-status word,
// BRAND-04). The stamp never carries digits — it names the state, nothing else.
if (/\d/.test(stateName)) { console.error(`ABORT(straight-stamp): state name "${stateName}" carries a digit.`); process.exit(1); }

// Type scales with the name so the longest ("DISTRICT OF COLUMBIA") still sits
// between the digits column and the right edge; short names get the full size.
const nameSize = stateName.length <= 9 ? 92 : stateName.length <= 14 ? 66 : 50;

const FONT_DIR = resolve('node_modules/@expo-google-fonts/jetbrains-mono');
const mono700 = `${FONT_DIR}/700Bold/JetBrainsMono_700Bold.ttf`;
const mono500 = `${FONT_DIR}/500Medium/JetBrainsMono_500Medium.ttf`;
if (!existsSync(mono700) || !existsSync(mono500)) {
  console.error(`ABORT: JetBrains Mono ttf not found under ${FONT_DIR} — stamp must use the app's mono face.`);
  process.exit(1);
}

const GOLD = '#FBBF24';
const html = `<!doctype html><html><head><style>
  @font-face { font-family: JBM; src: url('file://${mono700}'); font-weight: 700; }
  @font-face { font-family: JBM; src: url('file://${mono500}'); font-weight: 500; }
  * { margin: 0; padding: 0; }
  body { width: 1080px; height: 1920px; background: transparent; overflow: hidden; }
  .wrap { position: absolute; left: 0; width: 1080px; top: 0px; display: flex; justify-content: center; }
  .plate {
    margin-left: 200px; /* keeps the plate right of the combo digits column */
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 22px 48px 26px; border-radius: 18px;
    background: rgba(8, 10, 22, 0.84);
    border: 7px solid ${GOLD};
    box-shadow: 0 0 0 4px rgba(8, 10, 22, 0.9), 0 0 60px ${GOLD}66, 0 0 120px ${GOLD}33;
    transform: rotate(-9deg);
    white-space: nowrap;
  }
  .eyebrow { font: 700 40px JBM; letter-spacing: 11px; color: ${GOLD}; text-shadow: 0 0 22px ${GOLD}99; }
  .state { font: 700 ${nameSize}px JBM; letter-spacing: 6px; color: #ffffff; text-shadow: 0 0 30px ${GOLD}88, 0 2px 0 #000; }
  .rule { width: 72%; height: 4px; background: ${GOLD}; opacity: .85; border-radius: 2px; }
</style></head><body>
  <div class="wrap"><div class="plate">
    <div class="eyebrow">STRAIGHT MATCH</div>
    <div class="rule"></div>
    <div class="state">${stateName}</div>
  </div></div>
</body></html>`;

(async () => {
  const tmpHtml = join(tmpdir(), `straight-stamp-${codeArg.replace(/[^A-Za-z]/g, '')}.html`);
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts.ready);
  const loaded = await page.evaluate(() => (document as any).fonts.check('700 40px JBM'));
  // Pin the plate's BOTTOM edge (rotated bounding box) at BOTTOM_Y: measure
  // once at top 0, shift the wrapper by the difference, re-measure.
  const box = await page.evaluate((bottom: number) => {
    const wrap = document.querySelector('.wrap') as HTMLElement;
    const r0 = document.querySelector('.plate')!.getBoundingClientRect();
    wrap.style.top = `${bottom - r0.bottom}px`;
    const r = document.querySelector('.plate')!.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom };
  }, BOTTOM_Y);
  await page.screenshot({ path: out, omitBackground: true });
  await browser.close();
  rmSync(tmpHtml, { force: true });
  if (!loaded) { console.error('ABORT: JetBrains Mono failed to load — stamp would render in a fallback face.'); process.exit(1); }
  if (box.r > 1080 || box.l < 0) { console.error(`ABORT(straight-stamp): plate overflows the frame (x ${Math.round(box.l)}–${Math.round(box.r)}) for "${stateName}".`); process.exit(1); }
  console.log(`straight stamp: ${out} · "STRAIGHT MATCH · ${stateName}" · plate x ${Math.round(box.l)}–${Math.round(box.r)} y ${Math.round(box.t)}–${Math.round(box.b)} (bottom pinned ${BOTTOM_Y})`);
})();
