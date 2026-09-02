// MKT-66 — PUBLIC COLD OPEN: the receipts hook card that replaces the anchor
// intro + stinger on the public All-Day cut.
//
// Why: Meta's page analytics (operator, 2026-09-02) put average watch time at
// 5–8s on the 34s public reels. The public cut's board did not appear until
// 8.7s (6.0s intro + 2.7s stinger), so the median cold viewer never saw data —
// they watched the brand open and scrolled. Meta's own suggestion was to lead
// with "the what" (a result) instead of "the how" (the method). This card IS
// the what: yesterday's All-Day board result, structural stats only.
//
// Tier-1 discipline (public surface): NO digits, NO state names, NO session
// words, NO match-type vocabulary. Every string on the card runs through the
// real lintCaption(…, 1) and the render FAILS CLOSED on a blocking violation —
// a card that cannot pass the lint does not get composited.
//
// Output: a HOOK_DUR-second 1080x1920 H.264 clip WITH a silent AAC track, so the
// assembler can consume it through the existing intro path unchanged (the
// intro graph reads [0:v] and [0:a]).
//
// Usage: tsx scripts/render-public-hook.ts <YYYYMMDD> <out.mp4>
//   <YYYYMMDD> is the DROP date (the reel's stamp); the card grades D−1.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { lintCaption } from '../lib/social/brandLint';
import { shiftDate } from './reel-captions';

import { HOOK_DUR } from './public-hook-config';

const [, , ymd, outArg] = process.argv;
if (!/^\d{8}$/.test(ymd ?? '') || !outArg) {
  console.error('Usage: tsx scripts/render-public-hook.ts <YYYYMMDD> <out.mp4>');
  process.exit(1);
}
const out = resolve(outArg);
const dropISO = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const rcptISO = shiftDate(dropISO, -1);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
if (!SUPABASE_URL || !ANON) {
  console.error('ABORT: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing (load .env).');
  process.exit(1);
}
async function sbGet<T = any>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json() as Promise<T>;
}

/** All-Day board only (the public cut shows the All-Day board; sessions are
 *  blocking on public surfaces so a cross-board "of 18" would need session
 *  words to explain). allday = ANY draw of the day counts (feedback_allday_semantics). */
async function alldayReceipts(date: string): Promise<{ total: number; verified: number; verified30d: number }> {
  const from30 = shiftDate(date, -29);
  const slates = await sbGet<Array<{ slate_date: string; top_k_straights_json: any }>>(
    `/rest/v1/slate_snapshots?select=slate_date,top_k_straights_json&scope=eq.allday&slate_date=gte.${from30}&slate_date=lte.${date}` +
    `&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=slate_date.asc,id.asc&limit=100`,
  );
  const hist: Array<{ date_et: string; comboset_sorted: string }> = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await sbGet<typeof hist>(
      `/rest/v1/histories?select=date_et,comboset_sorted&date_et=gte.${from30}&date_et=lte.${date}&order=date_et.asc,id.asc&limit=1000&offset=${offset}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    hist.push(...page);
    if (page.length < 1000) break;
  }
  const setsByDate = new Map<string, Set<string>>();
  for (const h of hist) {
    if (!setsByDate.has(h.date_et)) setsByDate.set(h.date_et, new Set());
    setsByDate.get(h.date_et)!.add(h.comboset_sorted);
  }
  let total = 0, verified = 0, verified30d = 0;
  for (const s of slates) {
    const raw = typeof s.top_k_straights_json === 'string' ? JSON.parse(s.top_k_straights_json) : s.top_k_straights_json;
    if (!Array.isArray(raw)) continue;
    const drawn = setsByDate.get(s.slate_date) ?? new Set<string>();
    for (const p of raw) {
      const set = String(p?.comboSet ?? p?.combo_set ?? '');
      if (!set) continue;
      const hit = drawn.has(set);
      if (hit) verified30d++;
      if (s.slate_date !== date) continue;
      total++;
      if (hit) verified++;
    }
  }
  return { total, verified, verified30d };
}

/** Card copy. Three shapes, all count-only (no rate, no digits, no states):
 *   normal day   → YESTERDAY'S BOARD · "2 of 6" · SIGNALS VERIFIED
 *   zero day     → LAST 30 DAYS · "41" · SIGNALS VERIFIED
 *   no data      → EVERY MORNING · GRADED IN THE OPEN (never a fabricated number) */
function cardCopy(r: { total: number; verified: number; verified30d: number } | null) {
  if (r && r.total > 0 && r.verified > 0) {
    return { eyebrow: "YESTERDAY'S BOARD", big: `${r.verified} of ${r.total}`, line: 'SIGNALS VERIFIED', sub: '40+ STATES & PROVINCES · CHECKED AGAINST OFFICIAL RESULTS' };
  }
  if (r && r.verified30d > 0) {
    return { eyebrow: 'LAST 30 DAYS', big: `${r.verified30d}`, line: 'SIGNALS VERIFIED', sub: '40+ STATES & PROVINCES · CHECKED AGAINST OFFICIAL RESULTS' };
  }
  return { eyebrow: 'EVERY MORNING', big: 'GRADED', line: 'IN THE OPEN', sub: '40+ STATES & PROVINCES · PUBLISHED BEFORE THE DRAW' };
}

(async () => {
  let receipts: { total: number; verified: number; verified30d: number } | null = null;
  try {
    receipts = await alldayReceipts(rcptISO);
    console.log(`NOTE(hook): All-Day receipts for ${rcptISO}: ${receipts.verified} of ${receipts.total} verified · 30d ${receipts.verified30d}.`);
  } catch (e) {
    console.log(`NOTE(hook): receipts fetch failed (${e instanceof Error ? e.message : String(e)}) — falling back to the no-data card.`);
  }
  const copy = cardCopy(receipts);

  // Fail-closed public lint on every string the card shows.
  for (const s of [copy.eyebrow, copy.big, copy.line, copy.sub]) {
    const res = lintCaption(s, 1);
    const blocking = res.violations.filter(v => v.blocking);
    if (blocking.length) {
      console.error(`ABORT(hook): "${s}" fails the tier-1 lint: ${blocking.map(v => `${v.term} (${v.rule})`).join(', ')}.`);
      process.exit(1);
    }
    if (/\d{3}/.test(s)) { console.error(`ABORT(hook): "${s}" contains a 3-digit run — never on a public card.`); process.exit(1); }
  }

  const FONT_DIR = resolve('node_modules/@expo-google-fonts/jetbrains-mono');
  const mono700 = `${FONT_DIR}/700Bold/JetBrainsMono_700Bold.ttf`;
  const mono500 = `${FONT_DIR}/500Medium/JetBrainsMono_500Medium.ttf`;
  if (!existsSync(mono700) || !existsSync(mono500)) { console.error(`ABORT(hook): JetBrains Mono not found under ${FONT_DIR}.`); process.exit(1); }
  const boltSrc = resolve('assets/marketing/bolt_mark.svg');
  const boltPath = (readFileSync(boltSrc, 'utf8').match(/ d="([^"]+)"/) ?? [])[1];
  if (!boltPath) { console.error('ABORT(hook): bolt_mark.svg path not found.'); process.exit(1); }
  const ACCENT = '#2bffcc'; // drop cyan — the reel is a data drop; gold is verify's
  const GOLD = '#FBBF24';   // the receipts number itself carries the results-desk gold

  const html = `<!doctype html><html><head><style>
    @font-face { font-family: JBM; src: url('file://${mono700}'); font-weight: 700; }
    @font-face { font-family: JBM; src: url('file://${mono500}'); font-weight: 500; }
    * { margin: 0; padding: 0; }
    body { width: 1080px; height: 1920px; overflow: hidden; background: #080a16;
           background-image: radial-gradient(ellipse 900px 700px at 50% 42%, rgba(43,255,204,0.10), rgba(8,10,22,0) 70%); }
    .wrap { position: absolute; left: 0; right: 0; top: 560px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
    .eyebrow { font: 500 40px JBM; letter-spacing: 8px; color: ${ACCENT}; text-shadow: 0 0 22px ${ACCENT}66; }
    .big { font: 700 236px JBM; letter-spacing: -4px; line-height: 1; color: ${GOLD}; text-shadow: 0 0 60px ${GOLD}55; margin-top: 18px; }
    .line { font: 700 78px JBM; letter-spacing: 8px; color: #ffffff; }
    .rule { width: 520px; height: 3px; background: ${ACCENT}66; margin: 26px 0 6px; }
    .sub { font: 500 30px JBM; letter-spacing: 3px; color: rgba(255,255,255,0.72); text-align: center; max-width: 900px; line-height: 1.5; }
    .brand { position: absolute; left: 0; right: 0; bottom: 250px; display: flex; justify-content: center; align-items: center; gap: 12px;
             font: 700 34px JBM; letter-spacing: 4px; color: rgba(255,255,255,0.85); }
    .bolt { width: 34px; height: 34px; }
  </style></head><body>
    <div class="wrap">
      <div class="eyebrow">${copy.eyebrow}</div>
      <div class="big">${copy.big}</div>
      <div class="line">${copy.line}</div>
      <div class="rule"></div>
      <div class="sub">${copy.sub}</div>
    </div>
    <div class="brand"><svg class="bolt" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="${boltPath}" fill="${ACCENT}"/></svg>HITMASTER ZK6</div>
  </body></html>`;

  const tmpHtml = join(tmpdir(), `hm_hook_${ymd}.html`);
  const png = out.replace(/\.mp4$/, '.png');
  writeFileSync(tmpHtml, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`file://${tmpHtml}`);
  await page.evaluate(() => (document as any).fonts.ready);
  await page.screenshot({ path: png, type: 'png' });
  await browser.close();
  rmSync(tmpHtml, { force: true });

  // PNG → HOOK_DUR clip with a silent stereo track (the assembler's intro graph needs [0:a]).
  execSync(
    `ffmpeg -y -loglevel error -loop 1 -framerate 60 -t ${HOOK_DUR} -i "${png}" ` +
    `-f lavfi -t ${HOOK_DUR} -i anullsrc=r=48000:cl=stereo ` +
    `-vf "format=yuv420p" -r 60 -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000 -shortest ` +
    `-metadata hm_hook_copy="${copy.eyebrow} | ${copy.big} | ${copy.line}" "${out}"`,
    { stdio: 'inherit' },
  );
  console.log(`NOTE(hook): ${out} · ${HOOK_DUR}s · "${copy.eyebrow} · ${copy.big} ${copy.line}"`);
})().catch(e => { console.error('ABORT(hook):', e instanceof Error ? e.message : String(e)); process.exit(1); });
