// MKT-02 Phase 1 — "Yesterday's Receipts" UI segment renderer.
//
// Renders ui_verify_YYYYMMDD.mp4 (1080x1920, 60fps, exactly 6.3s = 378 frames)
// from the live Verified Track Record screen, positioned at YESTERDAY's (ET)
// day group. Deterministic frame capture (MKT-01 pattern): eased scroll
// positions computed per frame, no wall-clock recording.
//
// Segment beat map:
//   f000-f059  0.0-1.0s  static — summary stats band + yesterday header visible
//   f060-f317  1.0-5.3s  one eased scroll through yesterday's receipt rows
//                        (rate-capped at 1.5 viewport-heights per 4s)
//   f318-f377  5.3-6.3s  static — last rows
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
const SCROLL_FRAMES = 258;              // 4.3s
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
    return {
      found: true,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      yTop,
      nextTop: after[0]?.top ?? scroller.scrollHeight,
      rowCount: chip ? chip.n : -1,
    };
  }, dateISO);

  if (!layout) { console.error('ABORT: no scrollable container on /track-record'); process.exit(1); }
  if (!(layout as any).found) {
    console.error(`ABORT: no confirmed matches for ${dateISO} — no reel today.`);
    await browser.close();
    process.exit(1);
  }
  const L = layout as { scrollHeight: number; clientHeight: number; yTop: number; nextTop: number; rowCount: number };

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

  // f000-f059: static hold at anchor.
  await setScroll(anchor);
  await page.waitForTimeout(400);
  await page.screenshot({ path: fname(0) });
  for (let f = 1; f < 60; f++) copyFileSync(fname(0), fname(f));

  // f060-f317: eased scroll.
  for (let f = 60; f < 60 + SCROLL_FRAMES; f++) {
    await setScroll(anchor + dist * easeInOut((f - 60) / (SCROLL_FRAMES - 1)));
    await page.screenshot({ path: fname(f) });
  }

  // f318-f377: static hold on last rows.
  for (let f = 318; f < 378; f++) copyFileSync(fname(317), fname(f));

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
