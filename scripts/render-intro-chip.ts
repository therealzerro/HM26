// MKT-22 — the intro identity chip.
//
// A small plate over the anchor's right shoulder naming which drop this is, so
// the day's reels are distinguishable from their first second instead of from
// the stinger headline at 2.7s.
//
// WHY THIS EXISTS RATHER THAN MORE INTROS. Every lane rotates on the date, and
// once spread across kinds the intro pool covers 5 of 6 kinds distinctly — the
// sixth collides permanently because `verify` is pinned to `anchor_intro.mp4`
// and a slate kind draws that same file every day. Closing that with footage
// costs a generation; closing it with a chip costs nothing and additionally
// LABELS the reel, which no intro does today. The two are complementary: the
// chip ships now, and powerup's regeneration still removes the footage
// collision when it lands.
//
// ⚠ PUBLIC KINDS TAKE "THE FULL BOARD", NEVER A SESSION WORD. The MKT-15 copy
// brief ruled session vocabulary BLOCKING for public surfaces — slots 6 and 7
// drop the scope tag and slot 8 replaces the stinger headline precisely so that
// ALL-DAY / MIDDAY / EVENING never reach a public cut. A chip is a new way to
// put that vocabulary back on screen, so it is bound by the same ruling and
// LABELS below encodes it rather than leaving it to the call site.
import { chromium } from 'playwright';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHIP_LABELS, datedChipExcluded } from './intro-chip-config';


const [, , kindArg, outArg, stampArg] = process.argv;
const spec = CHIP_LABELS[kindArg ?? ''];
if (!spec || !outArg) {
  console.error(`Usage: tsx scripts/render-intro-chip.ts <kind> <out.png> [YYYYMMDD]\n  kinds: ${Object.keys(CHIP_LABELS).join(', ')}`);
  process.exit(1);
}
if (stampArg && !/^\d{8}$/.test(stampArg)) {
  console.error(`ABORT: stamp must be YYYYMMDD, got "${stampArg}". The date line comes from the assembler's provenance-asserted stamp, never a clock.`);
  process.exit(1);
}
const out = resolve(outArg);

// MKT-35 Phase 3 — the date line. Format is exactly "THU · JUL 31" (no year).
// Verify's stamp is yesterday — the receipts' content date — so the chip
// agrees with its own YESTERDAY'S RESULTS heading by construction. Ad kinds
// are excluded in config (datedChipExcluded): evergreen footage must never
// carry a date (the MKT-18 false-claim class).
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
let dateLine: string | null = null;
if (stampArg && !datedChipExcluded(kindArg)) {
  const d = new Date(`${stampArg.slice(0, 4)}-${stampArg.slice(4, 6)}-${stampArg.slice(6, 8)}T12:00:00Z`);
  dateLine = `${DAYS[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const FONT_DIR = resolve('node_modules/@expo-google-fonts/jetbrains-mono');
const mono700 = `${FONT_DIR}/700Bold/JetBrainsMono_700Bold.ttf`;
if (!existsSync(mono700)) {
  console.error(`ABORT: JetBrains Mono ttf not found under ${FONT_DIR} — the chip must use the app's mono face.`);
  process.exit(1);
}

/**
 * Geometry, measured against the real intros rather than guessed.
 *
 * RIGHT edge at x=1008 (72px margin) and vertical centre ~y=600 puts the plate
 * over the viewer's-right shoulder. That side is chosen because the LEFT is
 * occupied in three of the four rotation members — the phone in `anchor_intro`
 * and `arrival`, the sheet in `deadpan`.
 *
 * y 500-700 sits inside the 1:1 centre-crop band (y 420-1500), so the chip
 * survives the square cutdown. That was checked, not assumed: an overlay a few
 * hundred px higher would vanish from every 1x1 cut.
 *
 * THE PLATE IS NOT DECORATION — it is the contrast guarantee. The underlay is
 * not consistent across the set: `deadpan` is a calm studio wall, `monitors` is
 * a bright high-contrast screen bank (it opens on the wall and the anchor does
 * not arrive until ~2.0s, so there is no shoulder under the chip for its first
 * third). Bare text would be legible on one and marginal on the other. Same
 * ruling as MKT-21's bolt: a mark over an unknown underlay gets a scrim.
 */
const html = `<!doctype html><html><head><style>
  @font-face { font-family: JBM; src: url('file://${mono700}'); font-weight: 700; }
  html, body { margin: 0; padding: 0; width: 1080px; height: 1920px; background: transparent; }
  .wrap { position: absolute; right: 72px; top: 664px; }
  .chip {
    display: inline-flex; align-items: center; gap: 16px;
    padding: 16px 26px 16px 20px; border-radius: 14px;
    background: rgba(8, 10, 22, 0.78);
    border: 1px solid ${spec.accent}4d;
    box-shadow: 0 0 26px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
  }
  .bar { width: 5px; height: ${dateLine ? 58 : 30}px; border-radius: 3px; background: ${spec.accent}; box-shadow: 0 0 12px ${spec.accent}aa; }
  .col { display: flex; flex-direction: column; gap: 6px; }
  .txt { font: 700 30px JBM; letter-spacing: 3px; color: #ffffff; }
  .date { font: 700 22px JBM; letter-spacing: 4px; color: #FBBF24; }
</style></head><body>
  <div class="wrap"><div class="chip"><div class="bar"></div><div class="col"><div class="txt">${spec.text}</div>${dateLine ? `<div class="date">${dateLine}</div>` : ''}</div></div></div>
</body></html>`;

(async () => {
  // Serve from a real file — file:// @font-face URLs are blocked from
  // setContent's about:blank origin and fall back to a serif SILENTLY (MKT-10).
  const tmpHtml = join(tmpdir(), `intro-chip-${kindArg}.html`);
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts.ready);
  const loaded = await page.evaluate(() => (document as any).fonts.check('700 30px JBM'));
  await page.screenshot({ path: out, omitBackground: true });
  await browser.close();
  rmSync(tmpHtml, { force: true });
  if (!loaded) {
    console.error('ABORT: JetBrains Mono failed to load — the chip would render in a fallback face.');
    process.exit(1);
  }
  console.log(`intro chip: ${out} · ${kindArg} · "${spec.text}"${dateLine ? ` · "${dateLine}"` : ' · undated'}`);
})();
