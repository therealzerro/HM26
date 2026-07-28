// MKT-03 Phase 1 (rev 2, operator-directed) — All-Day signal-drop body.
//
// Renders ui_allday_YYYYMMDD.mp4 (1080x1920, 60fps, exactly 16.0s = 960 frames)
// from the live Slates screen, All Day scope, premium view, GRID mode:
//
//   f000-f239  0.0-4.0s   full 2x3 slate grid — slow eased push-in (Ken Burns
//                         1.00→1.10 from a 3x-resolution still; never upscales)
//   then, per pick 1..6 (rank order): real tile tap → PickDetailModal settles →
//   2.0s hold on modal top (digits · energy · confidence · breakdown) → close.
//   Hard cuts between modals. Body = 16.0s = 960 frames.
//
// REAL DATA ONLY. Aborts (exit 1) if today's (ET) All-Day slate is absent
// (anon REST precheck + rendered-DOM guards).
//
// Usage: tsx scripts/render-allday-body.ts [outDir] [YYYY-MM-DD]
//   outDir default assets/marketing/allday_reels; optional date re-anchors the
//   browser clock to that day 7:30 PM ET (real data for that slate date —
//   used for off-hours sample renders; daily production omits it).
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = 'http://localhost:8081';
const OUT_DIR = resolve(process.argv[2] ?? 'assets/marketing/allday_reels');
const FPS = 60;
const VIEW_H = 960;
const GRID_FRAMES = 240;        // 4.0s zoompan segment
const MODAL_HOLD = 120;         // 2.0s per pick modal
const PICKS = 6;
const TOTAL = GRID_FRAMES + PICKS * MODAL_HOLD;   // 960 = 16.0s
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function slateExists(dateISO: string): Promise<boolean> {
  const env = readFileSync(resolve('.env'), 'utf8');
  const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(\S+)/)?.[1];
  const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(\S+)/)?.[1];
  if (!url || !key) return false;
  const res = await fetch(
    `${url}/rest/v1/slate_snapshots?scope=eq.allday&mode=eq.balanced&slate_date=eq.${dateISO}&deleted_at=is.null&select=top_k_straights_json`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.some((r: any) => Array.isArray(r.top_k_straights_json) && r.top_k_straights_json.length === 6);
}

const initScript = (fakeMs: number | null) => {
  try {
    window.localStorage.setItem('user', JSON.stringify({ id: 'default', role: 'premium' }));
    // MKT-11: unlocks the rotating promo panel in the pick-detail modal. ONLY
    // set here — the shipped app never sets it, so subscribers never see a
    // panel. Panels are served from public/reel-panels/ by the dev server.
    window.localStorage.setItem('hm:reel-capture', '1');
    window.localStorage.setItem('hm:theme-mode', 'dark');
    window.localStorage.setItem('onboarding_complete', 'true');
  } catch {}
  if (fakeMs) {
    const Real = Date;
    const offset = fakeMs - Real.now();
    // @ts-ignore
    window.Date = class extends Real {
      constructor(...args: any[]) {
        if (args.length === 0) super(Real.now() + offset);
        // @ts-ignore
        else super(...args);
      }
      static now() { return Real.now() + offset; }
    };
  }
};

async function openAlldayGrid(page: import('playwright').Page) {
  await page.goto(BASE + '/explore', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.waitForTimeout(5_000);
  await page.getByRole('tab', { name: /All Day/ }).first().click();
  await page.waitForTimeout(3_000);
  await page.getByText('Grid', { exact: true }).first().click();
  await page.waitForTimeout(3_000);
}

(async () => {
  const dateISO = process.argv[3] ?? todayET();
  const stamp = dateISO.replace(/-/g, '');
  // Shift the browser clock when rendering a non-current date (23:30 UTC = 7:30 PM ET).
  const fakeMs = process.argv[3] ? Date.parse(`${dateISO}T23:30:00Z`) : null;

  if (!(await slateExists(dateISO))) {
    console.error(`ABORT: no All-Day slate for ${dateISO} — run the Daily Workflow first; no reel body rendered.`);
    process.exit(1);
  }

  const WORK = join(tmpdir(), `allday-frames-${stamp}`);
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const outMp4 = join(OUT_DIR, `ui_allday_${stamp}.mp4`);
  const gridStill = join(WORK, 'grid_still.png');
  const fname = (i: number) => join(WORK, `frame_${String(i).padStart(4, '0')}.png`);

  const browser = await chromium.launch();

  // ── Pass 1: 3x-resolution grid still (zoom headroom for the push-in) ──
  {
    const ctx = await browser.newContext({
      viewport: { width: 540, height: VIEW_H }, deviceScaleFactor: 3,
      colorScheme: 'dark', isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.addInitScript(initScript, fakeMs);
    await openAlldayGrid(page);
    const gridCheck = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      let scroller: HTMLDivElement | null = null;
      for (const d of divs) if (d.scrollHeight > d.clientHeight + 20 && (!scroller || d.scrollHeight > scroller.scrollHeight)) scroller = d;
      return { overflow: scroller ? scroller.scrollHeight - scroller.clientHeight : 0 };
    });
    if (gridCheck.overflow > 8) {
      console.error(`ABORT: grid view unexpectedly scrolls (${gridCheck.overflow}px overflow) — not the one-screen slate surface.`);
      process.exit(1);
    }
    await page.screenshot({ path: gridStill });   // 1620x2880
    await ctx.close();
  }

  // ── Grid segment: eased Ken Burns push-in from the still ──
  execSync(
    `ffmpeg -y -loglevel error -loop 1 -i "${gridStill}" -vf ` +
    `"zoompan=z='1+0.10*(0.5-0.5*cos(PI*min(on/${GRID_FRAMES - 1},1)))'` +
    `:x='iw/2-(iw/zoom/2)':y='ih*0.55-(ih/zoom/2)':d=${GRID_FRAMES}:s=1080x1920:fps=${FPS}" ` +
    `-frames:v ${GRID_FRAMES} -c:v libx264 -pix_fmt yuv420p -crf 18 "${join(WORK, 'grid_seg.mp4')}"`,
    { stdio: 'inherit' },
  );

  // ── Pass 2: modal capture (2x context = native 1080x1920 frames) ──
  const ctx = await browser.newContext({
    viewport: { width: 540, height: VIEW_H }, deviceScaleFactor: 2,
    colorScheme: 'dark', isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(initScript, fakeMs);
  await openAlldayGrid(page);

  // Grid tile centers (2x3, CSS px) and the modal close button.
  const TILES: Array<[number, number]> = [
    [150, 310], [405, 310],
    [150, 550], [405, 550],
    [150, 777], [405, 777],
  ];
  const CLOSE: [number, number] = [36, 63];

  const setScroll = (px: number) =>
    page.evaluate(y => { const el = (window as any).__adScroll; if (el) el.scrollTop = y; }, px);

  for (let i = 0; i < PICKS; i++) {
    await page.mouse.click(TILES[i][0], TILES[i][1]);
    await page.waitForTimeout(2_000);   // slide-up + queries settle
    const modal = await page.evaluate((rank: number) => {
      const text = document.body.innerText;
      const ok = new RegExp(`PICK #${rank}`).test(text) && /BEST STRAIGHT/i.test(text);
      const divs = Array.from(document.querySelectorAll('div'));
      let scroller: HTMLDivElement | null = null;
      for (const d of divs) if (d.scrollHeight > d.clientHeight + 50 && (!scroller || d.scrollHeight > scroller.scrollHeight)) scroller = d;
      if (scroller) { (scroller.style as any).scrollBehavior = 'auto'; (window as any).__adScroll = scroller; }
      return { ok, vocab: (text.match(/\b(partial|exact)\b/gi) ?? []).length };
    }, i + 1);
    if (!modal.ok) { console.error(`ABORT: PICK #${i + 1} modal did not open from its grid tile.`); process.exit(1); }
    if (modal.vocab > 0) { console.error('ABORT: banned match-status vocabulary rendered in modal — BRAND-04 blocking stop.'); process.exit(1); }

    await setScroll(0);
    await page.waitForTimeout(300);
    const base = GRID_FRAMES + i * MODAL_HOLD;
    await page.screenshot({ path: fname(base) });
    for (let f = base + 1; f < base + MODAL_HOLD; f++) copyFileSync(fname(base), fname(f));
    console.log(`captured PICK #${i + 1} modal hold`);

    await page.mouse.click(CLOSE[0], CLOSE[1]);
    await page.waitForTimeout(1_000);   // close animation settles before next tap
  }
  await browser.close();

  // ── Modal segment + concat with the grid segment ──
  execSync(
    `ffmpeg -y -loglevel error -start_number ${GRID_FRAMES} -framerate ${FPS} -i "${join(WORK, 'frame_%04d.png')}" ` +
    `-frames:v ${TOTAL - GRID_FRAMES} -c:v libx264 -pix_fmt yuv420p -r ${FPS} -crf 18 "${join(WORK, 'modal_seg.mp4')}"`,
    { stdio: 'inherit' },
  );
  execSync(
    `ffmpeg -y -loglevel error -i "${join(WORK, 'grid_seg.mp4')}" -i "${join(WORK, 'modal_seg.mp4')}" ` +
    `-filter_complex "[0:v]settb=AVTB[a];[1:v]settb=AVTB[b];[a][b]concat=n=2:v=1:a=0[v]" -map "[v]" ` +
    `-r ${FPS} -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart "${outMp4}"`,
    { stdio: 'inherit' },
  );
  rmSync(WORK, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outMp4}"`).toString().trim();
  console.log(`allday body: ${outMp4} · date ${dateISO} · grid(6 picks)+pick#1 modal · ${dur}s`);
})();
