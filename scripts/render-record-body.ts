// MKT-79 — render the RECORD BODY: the 30-day strip of the Verified Track
// Record, as a 7.4s 1080×1920 clip the record assembler dissolves into after
// the hook card.
//
//   body t   reel t
//   0.0      2.0    frame 0 (black field, brand) — cloned under the dissolve
//   0.4–0.9  2.4–2.9  thirty tiles appear together, ALL DIM; range label above
//   0.9–3.9  2.9–5.9  gold marks land on the MATCHED days, left→right, ~0.1s apart
//   3.9–4.9  5.9–6.9  the count resolves large beneath:  N OF 30 DAYS
//   4.9–6.4  6.9–8.4  secondary stats, gold:  E EXACT-ORDER MATCHES · J STATES & PROVINCES
//   6.4–7.4  8.4–9.4  hold; the rightmost tile carries a faint pulse
//
// ⛔ UNMATCHED DAYS STAY DIM AND VISIBLE. Never hidden, never removed. The
// misses on screen are the honesty; a strip with no dim tile is a REJECT and
// this renderer aborts on it unless --allow-all-matched is passed for a day
// the record genuinely reads 30 of 30. Do not "clean them up".
//
// DATA: scripts/reel-record-stats.ts — the SAME computation the track-record
// screen's summary band runs (query, scope gate, dedupe, summary), over the
// 30 complete days ending the stamp date (D−1). Every stat is asserted < 100
// (three-digit assert, non-negotiable on a tier-1 surface) and the gold-mark
// count is asserted equal to the DAYS figure (the count gate) — two renders
// from one source, and the assembler re-asserts them from the container tags.
//
// Deterministic: every frame is a pure function of (stats, t). No CSS
// animations, no clocks — frame f is `setT(f / fps)` then a screenshot.
//
// Usage: tsx scripts/render-record-body.ts [YYYYMMDD] [--allow-all-matched] [--parity]
//   YYYYMMDD = the window's LAST day = the reel's stamp (default: yesterday ET).
//   --parity prints the same computation over the SCREEN's own 30d window
//   (today−29..today) so the operator can compare it with the app's band.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { config as loadEnv } from 'dotenv';
import { lintCaption } from '../lib/social/brandLint';
import { provenanceArgs, recordTagArgs } from './reel-provenance';
import {
  fetchTrackRecordSummary, recordWindow, rangeLabel, screenWindow, screenDaysDenominator,
} from './reel-record-stats';
import {
  RECORD_DIR, RECORD_WINDOW_DAYS, RECORD_BODY_DUR, RECORD_BEATS, RECORD_GRID, RECORD_STAT_MAX, RECORD_RENDER_FPS,
} from './record-config';

loadEnv({ path: resolve('.env'), quiet: true });

const ASSETS = resolve('assets/marketing');
const REELS = join(ASSETS, RECORD_DIR);
mkdirSync(REELS, { recursive: true });
const sh = (c: string) => execSync(c, { stdio: 'inherit' });

function etDate(offsetDays: number): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString('en-CA');
}
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const stamp = positional[0] ?? etDate(-1).replace(/-/g, '');
if (!/^\d{8}$/.test(stamp)) { console.error('Usage: tsx scripts/render-record-body.ts [YYYYMMDD] [--allow-all-matched] [--parity]'); process.exit(1); }
const untilISO = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
const ALLOW_ALL = process.argv.includes('--allow-all-matched');
const PARITY = process.argv.includes('--parity');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
if (!SUPABASE_URL || !ANON) { console.error('ABORT(record): EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing (load .env).'); process.exit(1); }
// The SAME credentials the screen uses (anon + RLS) — not the service role —
// so the rows this reads are the rows a member's screen reads.
async function sbGet<T = any>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) throw new Error(`GET ${path.split('?')[0]} → ${r.status}`);
  return r.json() as Promise<T>;
}

const GOLD = '#FBBF24';

(async () => {
  const win = recordWindow(untilISO, RECORD_WINDOW_DAYS);
  const sum = await fetchTrackRecordSummary(sbGet, win.since, win.until);
  console.log(`NOTE(record): window ${sum.since} → ${sum.until} (${sum.windowDays} days) · matches ${sum.matches} · exact-order ${sum.straights} · days ${sum.days}/${sum.windowDays} · jurisdictions ${sum.juris}${sum.truncated ? ' · TRUNCATED' : ''}`);

  if (PARITY) {
    const today = etDate(0);
    const sw = screenWindow(today);
    const ss = await fetchTrackRecordSummary(sbGet, sw.since, sw.until);
    console.log(`PARITY(record): the SCREEN's 30d band right now (${sw.since} → ${sw.until}) computes MATCHES ${ss.matches} · STRAIGHT ${ss.straights} · BOX ${ss.box} · DAYS ${ss.days}/${screenDaysDenominator(ss, today)} · "Across ${ss.juris} jurisdictions" — compare against /track-record in the app.`);
  }

  // ── Gates, in the order they must fire ────────────────────────────────────
  if (sum.windowDays !== RECORD_WINDOW_DAYS) { console.error(`ABORT(record): window is ${sum.windowDays} days, expected ${RECORD_WINDOW_DAYS}.`); process.exit(1); }
  if (sum.truncated) { console.error(`ABORT(record): the screen's fetch cap (1000 rows) truncated the window — the oldest days would fall off and the strip would under-claim. Not building.`); process.exit(1); }
  if (sum.days < 1) { console.error(`ABORT(record): no matched day in ${sum.since} → ${sum.until} — nothing to show; no reel today.`); process.exit(1); }
  // ⛔ THREE-DIGIT ASSERT (Phase 0 item 2). Value in the error, always.
  for (const [k, v] of Object.entries({ days: sum.days, of: sum.windowDays, exact: sum.straights, juris: sum.juris })) {
    if (!Number.isFinite(v) || v < 0 || v > RECORD_STAT_MAX) {
      console.error(`ABORT(record): THREE-DIGIT ASSERT — stat "${k}" = ${v} is outside 0..${RECORD_STAT_MAX}. A three-digit run on a tier-1 surface is the class of defect that takes the page down. Not building.`);
      process.exit(1);
    }
  }
  if (sum.days > sum.windowDays) { console.error(`ABORT(record): days ${sum.days} > window ${sum.windowDays}.`); process.exit(1); }
  // ⛔ ALL-MATCHED = REJECT (the honesty beat has nothing to show).
  if (sum.days === sum.windowDays && !ALLOW_ALL) {
    console.error(`ABORT(record): every one of the ${sum.windowDays} tiles would be gold — no dim tile on screen. The order treats an all-matched render as a REJECT. If the record genuinely reads ${sum.days} of ${sum.windowDays}, re-run with --allow-all-matched (operator decision, stated).`);
    process.exit(1);
  }

  // ── Per-tile state from the ONE summary object ───────────────────────────
  const dates: string[] = [];
  for (let i = 0; i < sum.windowDays; i++) {
    const d = new Date(sum.since + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const matchedSet = new Set(sum.matchedDates);
  const matched: boolean[] = dates.map(d => matchedSet.has(d));
  // COUNT GATE, render side: the tile flags (what the strip paints) vs the
  // summary's DAYS figure (what the count line prints). One source, two
  // derivations — they must agree before a single frame exists.
  const marks = matched.filter(Boolean).length;
  if (marks !== sum.days) { console.error(`ABORT(record): COUNT GATE — ${marks} gold tiles vs DAYS ${sum.days}. Not building.`); process.exit(1); }
  const dimDates = dates.filter((d, i) => !matched[i]);
  console.log(`NOTE(record): ${marks} gold · ${dimDates.length} dim (${dimDates.join(', ') || 'none'}) — the dim tiles are the design.`);

  // ── Strings on the body — tier-1 linted, fail-closed ─────────────────────
  const range = rangeLabel(sum.since, sum.until);
  const strings = {
    eyebrow: 'LAST 30 DAYS',
    range,
    count: `${sum.days} OF ${sum.windowDays} DAYS`,
    // One line at 30px mono + 2px tracking: 45 chars ≈ 900px, inside 1080
    // with margins (36px + wide separators clipped "PROVINCES" on the first
    // render — measured at feed width, 2026-09-11).
    stats: `${sum.straights} EXACT-ORDER ${sum.straights === 1 ? 'MATCH' : 'MATCHES'} · ${sum.juris} STATES & PROVINCES`,
    brand: 'HITMASTER ZK6',
  };
  for (const s of Object.values(strings)) {
    const res = lintCaption(s, 1);
    const blocking = res.violations.filter(v => v.blocking);
    if (blocking.length) { console.error(`ABORT(record): "${s}" fails the tier-1 lint: ${blocking.map(v => `${v.term} (${v.rule})`).join(', ')}.`); process.exit(1); }
    if (/\d{3}/.test(s)) { console.error(`ABORT(record): "${s}" contains a 3-digit run — never on a public body.`); process.exit(1); }
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  const FONT_DIR = resolve('node_modules/@expo-google-fonts/jetbrains-mono');
  const mono700 = `${FONT_DIR}/700Bold/JetBrainsMono_700Bold.ttf`;
  const mono500 = `${FONT_DIR}/500Medium/JetBrainsMono_500Medium.ttf`;
  if (!existsSync(mono700) || !existsSync(mono500)) { console.error(`ABORT(record): JetBrains Mono not found under ${FONT_DIR}.`); process.exit(1); }
  const boltPath = (readFileSync(resolve('assets/marketing/bolt_mark.svg'), 'utf8').match(/ d="([^"]+)"/) ?? [])[1];
  if (!boltPath) { console.error('ABORT(record): bolt_mark.svg path not found.'); process.exit(1); }

  const G = RECORD_GRID;
  const gridW = G.cols * G.tile + (G.cols - 1) * G.gap;
  const gridH = G.rows * G.tile + (G.rows - 1) * G.gap;
  const left = Math.round((1080 - gridW) / 2);
  // Landing schedule: the k-th matched tile (date order = left→right, row by
  // row) lands at marksFrom + k·step; step shrinks only if 30 marks would not
  // fit before marksTo (they do at 0.1s: 0.9 + 29×0.1 = 3.8 ≤ 3.9).
  const B = RECORD_BEATS;
  const step = Math.min(B.markStep, (B.marksTo - B.marksFrom - 0.25) / Math.max(1, marks - 1));
  let k = 0;
  const landAt: (number | null)[] = matched.map(m => (m ? +(B.marksFrom + (k++) * step).toFixed(3) : null));

  const tilesHtml = dates.map((d, i) =>
    `<div class="tile${matched[i] ? ' gold' : ' dim'}${i === dates.length - 1 ? ' last' : ''}" data-i="${i}" data-land="${landAt[i] ?? ''}"></div>`).join('');

  const html = `<!doctype html><html><head><style>
    @font-face { font-family: JBM; src: url('file://${mono700}'); font-weight: 700; }
    @font-face { font-family: JBM; src: url('file://${mono500}'); font-weight: 500; }
    * { margin: 0; padding: 0; }
    body { width: 1080px; height: 1920px; overflow: hidden; background: #080a16;
           background-image: radial-gradient(ellipse 900px 700px at 50% 44%, rgba(251,191,36,0.08), rgba(8,10,22,0) 70%); }
    .eyebrow { position: absolute; left: 0; right: 0; top: 500px; text-align: center; font: 500 30px JBM; letter-spacing: 7px; color: ${GOLD}; text-shadow: 0 0 18px ${GOLD}55; }
    .range { position: absolute; left: 0; right: 0; top: 552px; text-align: center; font: 700 40px JBM; letter-spacing: 5px; color: rgba(255,255,255,0.78); }
    .grid { position: absolute; left: ${left}px; top: ${G.top}px; width: ${gridW}px; height: ${gridH}px;
            display: grid; grid-template-columns: repeat(${G.cols}, ${G.tile}px); grid-auto-rows: ${G.tile}px; gap: ${G.gap}px; }
    .tile { width: ${G.tile}px; height: ${G.tile}px; border-radius: 12px; box-sizing: border-box;
            background: rgba(255,255,255,0.13); border: 2px solid rgba(255,255,255,0.40); }
    .tile.gold.on { background: ${GOLD}; border-color: ${GOLD}; box-shadow: 0 0 26px ${GOLD}88; }
    .count { position: absolute; left: 0; right: 0; top: ${G.top + gridH + 78}px; text-align: center; white-space: nowrap; }
    .count .n { font: 700 196px JBM; letter-spacing: -6px; color: ${GOLD}; text-shadow: 0 0 60px ${GOLD}55; vertical-align: baseline; }
    .count .of { font: 700 66px JBM; letter-spacing: 6px; color: #ffffff; margin-left: 22px; vertical-align: baseline; }
    .stats { position: absolute; left: 0; right: 0; top: ${G.top + gridH + 78 + 250}px; text-align: center; font: 500 30px JBM; letter-spacing: 2px; color: ${GOLD}; white-space: nowrap; }
    .brand { position: absolute; left: 0; right: 0; bottom: 250px; display: flex; justify-content: center; align-items: center; gap: 12px;
             font: 700 34px JBM; letter-spacing: 4px; color: rgba(255,255,255,0.85); }
    .bolt { width: 34px; height: 34px; }
  </style></head><body>
    <div class="eyebrow" id="eyebrow">${strings.eyebrow}</div>
    <div class="range" id="range">${strings.range}</div>
    <div class="grid" id="grid">${tilesHtml}</div>
    <div class="count" id="count"><span class="n" id="n">0</span><span class="of">OF ${sum.windowDays} DAYS</span></div>
    <div class="stats" id="stats">${strings.stats.replace(/&/g, '&amp;')}</div>
    <div class="brand"><svg class="bolt" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="${boltPath}" fill="${GOLD}"/></svg>${strings.brand}</div>
    <script>
      // Every frame is a pure function of t. No transitions, no timers.
      const BEATS = ${JSON.stringify(B)};
      const N = ${sum.days};
      const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
      const span = (t, a, b) => ease((t - a) / (b - a));
      window.__setT = function (t) {
        const tilesIn = span(t, BEATS.tilesIn[0], BEATS.tilesIn[1]);
        document.getElementById('eyebrow').style.opacity = tilesIn;
        document.getElementById('range').style.opacity = tilesIn;
        const grid = document.getElementById('grid');
        grid.style.opacity = tilesIn;
        grid.style.transform = 'translateY(' + ((1 - tilesIn) * 14).toFixed(2) + 'px)';
        for (const el of grid.children) {
          const land = el.dataset.land === '' ? null : parseFloat(el.dataset.land);
          let s = 1, on = false;
          if (land !== null && t >= land) {
            on = true;
            const p = span(t, land, land + 0.25);
            s = 1.18 - 0.18 * p;               // lands slightly large, settles to 1
          }
          el.classList.toggle('on', on);
          // The rightmost tile: a faint pulse from BEATS.pulseFrom (gold or dim).
          if (el.classList.contains('last') && t >= BEATS.pulseFrom) {
            const w = 0.5 + 0.5 * Math.sin((t - BEATS.pulseFrom) * Math.PI * 2 / 1.2);
            const a = (0.25 + 0.35 * w).toFixed(3);
            el.style.boxShadow = '0 0 ' + (18 + 14 * w).toFixed(1) + 'px rgba(251,191,36,' + a + ')';
            s = s * (1 + 0.025 * w);
          } else {
            el.style.boxShadow = '';
          }
          el.style.transform = 'scale(' + s.toFixed(4) + ')';
        }
        // Count: resolves over countIn — counts up 0→N with ease-out, opacity in.
        const cIn = span(t, BEATS.countIn[0], BEATS.countIn[1]);
        const count = document.getElementById('count');
        count.style.opacity = Math.min(1, cIn * 2.5).toFixed(3);
        count.style.transform = 'translateY(' + ((1 - cIn) * 18).toFixed(2) + 'px)';
        document.getElementById('n').textContent = String(Math.round(N * cIn));
        // Stats: fade in over the first 0.5s of statsIn, hold.
        const sIn = span(t, BEATS.statsIn[0], BEATS.statsIn[0] + 0.5);
        const stats = document.getElementById('stats');
        stats.style.opacity = sIn.toFixed(3);
        stats.style.transform = 'translateY(' + ((1 - sIn) * 12).toFixed(2) + 'px)';
        return Array.from(grid.children).filter(e => e.classList.contains('on')).length;
      };
    </script>
  </body></html>`;

  const tmpHtml = join(tmpdir(), `hm_record_${stamp}.html`);
  writeFileSync(tmpHtml, html);
  const framesDir = join(tmpdir(), `hm_record_frames_${stamp}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`file://${tmpHtml}`);
  await page.evaluate(() => (document as any).fonts.ready);
  const fps = RECORD_RENDER_FPS;
  const nFrames = Math.round(RECORD_BODY_DUR * fps);
  let lastOn = 0;
  for (let f = 0; f < nFrames; f++) {
    const t = f / fps;
    lastOn = await page.evaluate(`window.__setT(${t})`) as number;
    await page.screenshot({ path: join(framesDir, `f${String(f).padStart(4, '0')}.png`), type: 'png' });
  }
  // COUNT GATE, pixel side: the tiles the page actually painted gold on the
  // final frame — read back from the DOM, not from the flags array.
  if (lastOn !== sum.days) { await browser.close(); console.error(`ABORT(record): COUNT GATE — final frame paints ${lastOn} gold tiles, DAYS says ${sum.days}.`); process.exit(1); }
  // The feed-size eyeball: the resolved frame at ~380px wide (Phase 2 item 9).
  const feedPng = join(REELS, `record_public_${stamp}_feed.png`);
  await page.screenshot({ path: join(framesDir, 'final.png'), type: 'png' });
  await browser.close();
  rmSync(tmpHtml, { force: true });
  sh(`ffmpeg -y -loglevel error -i "${join(framesDir, 'final.png')}" -vf "scale=380:-1:flags=lanczos" "${feedPng}"`);

  const out = join(REELS, `record_body_${stamp}.mp4`);
  sh(
    `ffmpeg -y -loglevel error -framerate ${fps} -i "${join(framesDir, 'f%04d.png')}" ` +
    `-vf "format=yuv420p" -c:v libx264 -profile:v high -crf 18 -pix_fmt yuv420p ` +
    provenanceArgs(sum.until, false, true) +
    recordTagArgs({ days: sum.days, of: sum.windowDays, exact: sum.straights, juris: sum.juris, marks, range, since: sum.since, until: sum.until }) +
    ` "${out}"`,
  );
  rmSync(framesDir, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${out}"`).toString().trim();
  console.log(`record body: ${out} · ${dur}s · ${nFrames} frames @${fps}fps · "${strings.count}" · "${strings.stats}" · range "${range}" · feed preview ${feedPng.split('/').pop()}`);
})().catch(e => { console.error('ABORT(record):', e instanceof Error ? e.message : String(e)); process.exit(1); });
