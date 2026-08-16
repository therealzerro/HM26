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
// MKT-14 — the chip also carries the BRAND LINE, which is why this file is the
// attribution surface for the whole reel. The stamp rides the entire body
// (~56% of a slate reel, ~50% of a verify cut), and the body is the part that
// gets clipped and reposted; the intro/stinger/endcard already carry the
// wordmark. So every frame containing a board, a ledger or a pick is attributed
// without a second overlay. The measured chip band grows 432-651 -> 432-697,
// still inside the 1:1 keep band, with the width unchanged.
//
// Text derives from the same YYYYMMDD stamp the assemblers validate against
// slate_snapshots — never hand-typed, so it cannot disagree with the data.
//
// Usage: tsx scripts/render-reel-stamp.ts <drop|verify> <YYYYMMDD> <scope|-> <out.png>
//   scope "-" omits the scope tag (the verify reel is cross-scope).
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PURPOSES = {
  // MKT-56c (2026-08-16) — `top` per purpose. The drop chip used to sit at
  // y=470, which after MKT-56b's 1.3× tile digits put it squarely over picks
  // #1/#2 (operator smoke test). It now sits in the empty middle of tile row 1
  // (chip core 187px tall; free zone ≈605–790 between the nudged {a,b,c} set
  // labels and the signal bars). Verify keeps 470 — different layout, and the
  // 1:1 keep-band note above is history (1:1 cut retired, MKT-39).
  drop:   { eyebrow: "TODAY'S DATA DROP", accent: '#2bffcc', top: 604 },
  // MKT-31 items 2+4 — the verify stamp IS the persistent date ribbon:
  // "YESTERDAY'S RECEIPTS · <day> · <date>", gold (the results-desk accent —
  // verify's subject is the gold moment; every slate surface leads cyan).
  // The assembler keeps it up for the FULL body and fades it into the close.
  verify: { eyebrow: "YESTERDAY'S RECEIPTS", accent: '#FBBF24', top: 470 },
} as const;

// MKT-14 — the brand string, ruled 2026-07-31. "ZK6", not the version-agnostic
// "HITMASTER ZK" the parked work order mandated: within a single reel the
// stinger (5.7-8.7s) and the endcard lockup (32.2-34.2s) both already render
// "HITMASTER ZK6", so a body stamp reading "HITMASTER ZK" would disagree with
// its own bookends. If the wordmark ever moves off ZK6, this line and those two
// surfaces change together — that is the reason they are named here.
const BRAND_STRING = 'HITMASTER ZK6';

const [, , purposeArg, ymd, scopeArg, outArg] = process.argv;
const purpose = PURPOSES[purposeArg as keyof typeof PURPOSES];
if (!purpose || !/^\d{8}$/.test(ymd ?? '') || !scopeArg || !outArg) {
  console.error('Usage: tsx scripts/render-reel-stamp.ts <drop|verify> <YYYYMMDD> <scope|-> <out.png>');
  process.exit(1);
}
const out = resolve(outArg);

// MKT-14 — the bolt, inlined from assets/marketing/bolt_mark.svg (tracked since
// MKT-17). Inlined rather than <img src="file://...">: the mark has to take the
// chip's accent, and an external SVG cannot be recoloured from the host page.
// The path is the delivered geometry verbatim; only the fill is parameterised.
// Read from disk so the asset stays the single source of the shape — a silent
// copy here would drift the moment the mark is redrawn.
const BOLT_PATH = 'M600 102 L217 560 L470 560 L424 922 L807 464 L554 464 Z';
const boltSrc = resolve('assets/marketing/bolt_mark.svg');
if (!existsSync(boltSrc)) {
  console.error(`ABORT: bolt mark not found at ${boltSrc} — MKT-14 brand line cannot render.`);
  process.exit(1);
}
const boltDisk = readFileSync(boltSrc, 'utf8');
const boltMatch = boltDisk.match(/ d="([^"]+)"/);
if (!boltMatch || boltMatch[1].replace(/\s+/g, ' ').trim() !== BOLT_PATH) {
  console.error(
    'ABORT: bolt_mark.svg geometry no longer matches the path MKT-14 measured the chip against.\n' +
    `  on disk: ${boltMatch ? boltMatch[1] : '<no path found>'}\n` +
    `  expected: ${BOLT_PATH}\n` +
    'Re-measure the chip band (Phase 0 §4) and update BOLT_PATH together.',
  );
  process.exit(1);
}
const BOLT_SVG =
  `<svg class="bolt" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">` +
  `<path d="${BOLT_PATH}" fill="${purpose.accent}"/></svg>`;

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
    position: absolute; top: ${purpose.top}px; left: 50%; transform: translateX(-50%);
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
  /* MKT-14 — brand attribution. BELOW the date line, never above: the chip
     already starts at y432 against the 1:1 keep band's y420 ceiling, so a
     kicker line above it would breach the band (the parked order's alternative
     is dead on that measurement). 28px is ~67% of the date line, which keeps
     the chip's WIDTH unchanged — the brand line is the shorter of the two, so
     no new safe-zone work falls out of this. */
  .brand {
    display: flex; align-items: center; gap: 9px;
    font: 700 28px JBM; letter-spacing: 3.5px; color: rgba(255, 255, 255, 0.82);
  }
  .bolt { width: 26px; height: 26px; flex: none; display: block; }
</style></head><body>
  <div class="chip">
    <div class="eyebrow">${purpose.eyebrow}</div>
    <div class="date">${dateLine}</div>
    <div class="brand">${BOLT_SVG}${BRAND_STRING}</div>
  </div>
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
  console.log(`stamp: ${out} · "${purpose.eyebrow}" · "${dateLine}" · "${BRAND_STRING}"`);
})();
