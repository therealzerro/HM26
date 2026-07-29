// MKT-02 Phase 1 — "Yesterday's Receipts" UI segment renderer.
//
// Renders ui_verify_YYYYMMDD.mp4 (1080x1920, 60fps, exactly 6.3s = 378 frames)
// from the live Verified Track Record screen, positioned at YESTERDAY's (ET)
// day group. Deterministic frame capture (MKT-01 pattern): eased scroll
// positions computed per frame, no wall-clock recording.
//
// Segment beat map (MKT-25 — restaged; total frame count UNCHANGED at 378):
//   f000-f059  0.0-1.0s  static — summary stats band + yesterday header visible
//   f060-f119  1.0-2.0s  eased scroll to the first featured row
//   f120-f199  2.0-3.3s  HOLD on it, with a slow push-in
//   f200-f239  3.3-4.0s  ease out and travel to the second featured row
//   f240-f319  4.0-5.3s  HOLD on it, with a slow push-in
//   f320-f377  5.3-6.3s  ease back out and settle
//
// WHY THIS REPLACED A SINGLE 4.3s SCROLL (operator: "the verify reel is boring").
// A continuous crawl gives the eye nothing to land on, and every row passes at
// the same weight — so the strongest evidence reads exactly like the weakest.
// Holding on two rows lets a viewer actually READ one, and each ledger row
// already carries both halves of the claim on one line ("681 · BOX All Day ·
// Drew 186 in CT evening" is the call AND the outcome).
//
// FRAME COUNT IS DELIBERATELY UNCHANGED. `carrierNeed = uiDur + 2.9` against a
// 10.005s verif_carrier caps the body at 7.105s, so there is only 0.81s of
// headroom; restaging had to happen INSIDE the existing 6.3s rather than extend
// it. Keeping 378 frames means the carrier, the reel length and the stamp
// window are all untouched by this change.
//
// STRAIGHTS ARE FEATURED FIRST. They are the strongest evidence on the screen,
// and they are scarce — 2026-07-28 had 11 matched rows and only 2 straights.
//
// THE BEAT MAP IS DATA-ADAPTIVE, unlike every other reel in the pipeline. Slate
// reels always have exactly 6 picks; verify has whatever yesterday produced.
// With 2+ featurable rows it holds on two; with 1 it holds on that one for both
// beats (a longer, slower push rather than a jump to nothing); with 0 rows the
// script already aborts and no reel is made.
//
// REAL DATA ONLY: if yesterday has no confirmed matches (no day group in the
// rendered DOM), this script ABORTS with exit code 1 and renders nothing.
//
// Usage: tsx scripts/render-verification-reel.ts [outDir]   (default assets/marketing/verify_reels)
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { provenanceArgs } from './reel-provenance';

const BASE = 'http://localhost:8081';
const OUT_DIR = resolve(process.argv[2] ?? 'assets/marketing/verify_reels');
const FPS = 60;
const VIEW_H = 960;                     // CSS px @2 DPR => 1920
const SCROLL_FRAMES = 258;              // 4.3s (legacy single-scroll path)
/** MKT-25 beat boundaries, in frames. Sum must stay 378. */
const B = { hold0: 60, travel1: 120, hold1: 200, travel2: 240, hold2: 320, end: 378 };
/** Push-in at the peak of a hold. Modest on purpose — this is a ledger, not a
 *  reveal, and a hard zoom on a receipts reel reads as salesmanship. */
const ZOOM_MAX = 1.28;
const MAX_SCROLL = 1.5 * VIEW_H * (4.3 / 4);   // spec rate cap over the scroll window
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;

function yesterdayET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

(async () => {
  const dateISO = yesterdayET();
  const stamp = dateISO.replace(/-/g, '');
  const WORK = join(tmpdir(), `reel-frames-${stamp}`);
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const outMp4 = join(OUT_DIR, `ui_verify_${stamp}.mp4`);
  const fname = (i: number) => join(WORK, `frame_${String(i).padStart(4, '0')}.png`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 540, height: VIEW_H },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('user', JSON.stringify({ id: 'default', role: 'premium' }));
      window.localStorage.setItem('hm:theme-mode', 'dark');
      window.localStorage.setItem('onboarding_complete', 'true');
    } catch {}
  });

  await page.goto(BASE + '/track-record', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.getByText('Verified Track Record').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4_000);     // queries + count-ups fully settle

  // Locate yesterday's day group and the following group in the rendered DOM.
  const layout = await page.evaluate((iso: string) => {
    const divs = Array.from(document.querySelectorAll('div'));
    let scroller: HTMLDivElement | null = null;
    for (const d of divs) {
      if (d.scrollHeight > d.clientHeight + 50 && (!scroller || d.scrollHeight > scroller.scrollHeight)) scroller = d;
    }
    if (!scroller) return null;
    (scroller.style as any).scrollBehavior = 'auto';
    (window as any).__adScroll = scroller;
    const sRect = scroller.getBoundingClientRect();
    // Day-group date labels render the ISO date as their own text node.
    const isoRe = /^\d{4}-\d{2}-\d{2}$/;
    const labels = divs.filter(d => isoRe.test((d.textContent ?? '').trim()) && d.children.length === 0);
    const yEl = labels.find(d => (d.textContent ?? '').trim() === iso);
    if (!yEl) return { found: false, scrollHeight: scroller.scrollHeight };
    const yTop = yEl.getBoundingClientRect().top - sRect.top + scroller.scrollTop;
    const after = labels
      .map(d => ({ iso: (d.textContent ?? '').trim(), top: d.getBoundingClientRect().top - sRect.top + scroller.scrollTop }))
      .filter(l => l.top > yTop + 10)
      .sort((a, b) => a.top - b.top);
    // Row count: the "N matches" chip that sits on yesterday's header line
    // (match by vertical proximity to the date label, not by document order).
    const chips = divs
      .filter(d => /^\d+ match(es)?$/.test((d.textContent ?? '').trim()) && d.children.length === 0)
      .map(d => ({ n: Number((d.textContent ?? '').trim().split(' ')[0]), top: d.getBoundingClientRect().top - sRect.top + scroller!.scrollTop }));
    const chip = chips.find(c => Math.abs(c.top - yTop) < 60);
    // MKT-25: locate yesterday's individual matched rows so the beat map can
    // hold on them.
    //
    // ⚠ ANCHOR ON THE COMBO, NOT THE BADGE — two earlier attempts failed here.
    // (1) Matching any element containing /STRAIGHT|BOX/ found only the 8400-char
    //     page wrappers, because the row itself carries no such text node.
    // (2) Matching a bare STRAIGHT/BOX leaf found exactly two, both at y=60 —
    //     the summary band's stat tiles, above the day header.
    // The row badge is a nested <span>, which querySelectorAll('div') cannot
    // see at all. The COMBO is the stable anchor: a 3-digit leaf ~23px tall,
    // one per row, and semantically the thing the row is about.
    const groupEnd = after[0]?.top ?? scroller.scrollHeight;
    const rows: Array<{ top: number; height: number; straight: boolean }> = [];
    const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    const combos = all.filter(d => d.children.length === 0 && /^\d{3}$/.test((d.textContent ?? '').trim()));
    for (const leaf of combos) {
      const lr = leaf.getBoundingClientRect();
      if (lr.height < 16 || lr.height > 34) continue;              // combo-sized
      const lTop = lr.top - sRect.top + scroller!.scrollTop;
      if (lTop < yTop || lTop >= groupEnd) continue;               // yesterday only
      // Walk up to the row container so the hold frames the whole line, not
      // just the digits.
      let el: HTMLElement | null = leaf, row: HTMLElement | null = null;
      for (let hop = 0; el && hop < 6; hop++) {
        const h = el.getBoundingClientRect().height;
        if (h >= 36 && h <= 160) { row = el; break; }
        el = el.parentElement;
      }
      const target = row ?? leaf;
      const r = target.getBoundingClientRect();
      const top = r.top - sRect.top + scroller!.scrollTop;
      if (rows.some(x => Math.abs(x.top - top) < 20)) continue;
      // STRAIGHT is read from the row's full text, which DOES include the
      // nested span even though the span is not itself selectable as a div.
      rows.push({ top, height: r.height, straight: /\bSTRAIGHT\b/.test((target.textContent ?? '').trim()) });
    }
    rows.sort((a, b) => a.top - b.top);
    return {
      found: true,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      yTop,
      nextTop: groupEnd,
      rowCount: chip ? chip.n : -1,
      rows,
    };
  }, dateISO);

  if (!layout) { console.error('ABORT: no scrollable container on /track-record'); process.exit(1); }
  if (!(layout as any).found) {
    console.error(`ABORT: no confirmed matches for ${dateISO} — no reel today.`);
    await browser.close();
    process.exit(1);
  }
  const L = layout as {
    scrollHeight: number; clientHeight: number; yTop: number; nextTop: number; rowCount: number;
    rows: Array<{ top: number; height: number; straight: boolean }>;
  };

  // Anchor: keep the stats band in frame when yesterday's header is already
  // near the top; otherwise pull the header to ~45% of the viewport.
  const HEADER_MARGIN = 40;
  const HEADER_TOP_PAD = 90;
  const anchor = L.yTop <= 0.85 * VIEW_H ? 0 : Math.max(0, L.yTop - 0.45 * VIEW_H);
  // Scroll end — the larger of:
  //   (a) yesterday's last row near the bottom of the viewport (big groups), or
  //   (b) yesterday's header glided up to near the top (small groups that fit
  //       one viewport — guarantees gentle motion instead of a frozen segment).
  const endTargetRaw = Math.max(L.nextTop - VIEW_H + HEADER_MARGIN, L.yTop - HEADER_TOP_PAD, anchor);
  const maxEnd = Math.min(anchor + MAX_SCROLL, L.scrollHeight - L.clientHeight);
  const endTarget = Math.min(endTargetRaw, maxEnd);
  const dist = endTarget - anchor;
  console.log(`date=${dateISO} rows=${L.rowCount} anchor=${Math.round(anchor)} scroll=${Math.round(dist)}px`);

  const setScroll = (px: number) =>
    page.evaluate(y => { const el = (window as any).__adScroll; if (el) el.scrollTop = y; }, px);

  /**
   * Zoom by CSS transform on the scroller, NOT by cropping the captured frame.
   *
   * The browser re-rasterises text at the transformed scale, so a held row stays
   * crisp; cropping a 1080x1920 capture and scaling it back up would soften
   * exactly the text the hold exists to let someone read. `transform-origin` is
   * set to the row's centre so the push-in converges on it rather than on the
   * middle of the viewport.
   */
  const setZoom = (k: number, originYpx: number) =>
    page.evaluate(({ k, y }) => {
      const el = (window as any).__adScroll as HTMLElement | undefined;
      if (!el) return;
      el.style.transformOrigin = `50% ${y}px`;
      el.style.transform = k === 1 ? '' : `scale(${k})`;
    }, { k, y: originYpx });

  // MKT-25: choose the featured rows — straights first, then the earliest boxes,
  // and always in document order once chosen so the camera never travels
  // backwards up the ledger (which reads as a mistake, not a beat).
  const straights = L.rows.filter(r => r.straight);
  const boxes = L.rows.filter(r => !r.straight);
  const featured = [...straights, ...boxes].slice(0, 2).sort((a, b) => a.top - b.top);
  const restaged = featured.length >= 1;
  console.log(
    `date=${dateISO} rows=${L.rowCount} detected=${L.rows.length} ` +
    `(straight=${straights.length}) featured=${featured.length} anchor=${Math.round(anchor)}`,
  );

  if (!restaged) {
    // No row was detectable — fall back to the legacy single scroll rather than
    // produce a frozen segment. The DOM shape is the only thing that can break
    // this, and a boring reel beats no reel.
    console.log('NOTE: no rows detected — falling back to the legacy single scroll.');
    await setScroll(anchor);
    await page.waitForTimeout(400);
    await page.screenshot({ path: fname(0) });
    for (let f = 1; f < 60; f++) copyFileSync(fname(0), fname(f));
    for (let f = 60; f < 60 + SCROLL_FRAMES; f++) {
      await setScroll(anchor + dist * easeInOut((f - 60) / (SCROLL_FRAMES - 1)));
      await page.screenshot({ path: fname(f) });
    }
    for (let f = 318; f < 378; f++) copyFileSync(fname(317), fname(f));
  } else {
    // With one featurable row, both holds land on it — a single longer, slower
    // push rather than a travel to nothing.
    const rowA = featured[0];
    const rowB = featured[1] ?? featured[0];
    // Scroll position that puts a row at ~42% of the viewport: high enough to
    // read, low enough that the rows above it still give context.
    const parkFor = (r: { top: number; height: number }) =>
      Math.max(0, Math.min(r.top + r.height / 2 - 0.42 * VIEW_H, L.scrollHeight - L.clientHeight));
    const parkA = parkFor(rowA), parkB = parkFor(rowB);
    const originFor = (r: { top: number; height: number }, park: number) => r.top + r.height / 2 - park;

    const shoot = async (f: number, scroll: number, k: number, origin: number) => {
      await setScroll(scroll);
      await setZoom(k, origin);
      await page.screenshot({ path: fname(f) });
    };

    // f000-f059 — static at anchor, no zoom. The stats band is the credibility
    // frame; it should not be moving or magnified.
    await setScroll(anchor);
    await setZoom(1, 0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: fname(0) });
    for (let f = 1; f < B.hold0; f++) copyFileSync(fname(0), fname(f));

    // f060-f119 — ease from the anchor to row A.
    for (let f = B.hold0; f < B.travel1; f++) {
      const t = easeInOut((f - B.hold0) / (B.travel1 - B.hold0 - 1));
      await shoot(f, anchor + (parkA - anchor) * t, 1, originFor(rowA, parkA));
    }
    // f120-f199 — hold on row A, easing the push-in across the whole hold.
    for (let f = B.travel1; f < B.hold1; f++) {
      const t = easeInOut((f - B.travel1) / (B.hold1 - B.travel1 - 1));
      await shoot(f, parkA, 1 + (ZOOM_MAX - 1) * t, originFor(rowA, parkA));
    }
    // f200-f239 — release the zoom and travel to row B.
    for (let f = B.hold1; f < B.travel2; f++) {
      const t = easeInOut((f - B.hold1) / (B.travel2 - B.hold1 - 1));
      await shoot(f, parkA + (parkB - parkA) * t, ZOOM_MAX + (1 - ZOOM_MAX) * t, originFor(rowA, parkA));
    }
    // f240-f319 — hold on row B with its own push-in.
    for (let f = B.travel2; f < B.hold2; f++) {
      const t = easeInOut((f - B.travel2) / (B.hold2 - B.travel2 - 1));
      await shoot(f, parkB, 1 + (ZOOM_MAX - 1) * t, originFor(rowB, parkB));
    }
    // f320-f377 — ease back out and settle, so the cut to the endcard lands on
    // a still, unmagnified frame rather than mid-move.
    for (let f = B.hold2; f < B.end; f++) {
      const t = easeInOut((f - B.hold2) / (B.end - B.hold2 - 1));
      await shoot(f, parkB, ZOOM_MAX + (1 - ZOOM_MAX) * t, originFor(rowB, parkB));
    }
    await setZoom(1, 0);
  }

  await browser.close();

  execSync(
    `ffmpeg -y -loglevel error -framerate ${FPS} -i "${join(WORK, 'frame_%04d.png')}" ` +
    `-frames:v 378 -c:v libx264 -pix_fmt yuv420p -r ${FPS} -crf 18 ` +
    // MKT-18: same provenance tag as the slate bodies — the verify assembler
    // had the identical gap (stamp from argv, existence check only).
    `${provenanceArgs(dateISO)} "${outMp4}"`,
    { stdio: 'inherit' },
  );
  rmSync(WORK, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outMp4}"`).toString().trim();
  console.log(`ui segment: ${outMp4} · date ${dateISO} · ${L.rowCount} rows · ${dur}s`);
})();
