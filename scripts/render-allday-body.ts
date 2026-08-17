// MKT-03 Phase 1 (rev 2, operator-directed) — signal-drop body.
//
// MKT-13: scope-parameterized. `--scope=midday|evening` renders that session's
// board instead; with no flag this is the All-Day renderer exactly as before
// (same scope filter, same tab, same ui_allday_* output, same directory).
//
// Renders ui_<scope>_YYYYMMDD.mp4 (1080x1920, 60fps, exactly 19.0s = 1140 frames)
// from the live HOME screen in COFFEE MODE (MKT-57, 2026-08-16 — was the Slates
// screen GRID view; the operator ruled the Slates surface too complicated for
// new members, so all three scopes now capture the ultra-minimal coffee Home:
// scope switcher · NEXT DRAW · 2×3 pick tiles · black space), premium view:
//
//   f0000-f0599  0.0-10.0s  coffee Home 2x3 pick grid — STATIC still, no motion.
//                           MKT-56 (2026-08-16): members write the six picks
//                           down off this frame; the previous 4.0s Ken Burns
//                           push-in (1.00→1.10 zoompan) drifted the digits and
//                           was too short to notate from. Zoom REMOVED, hold
//                           widened 4.0→10.0s.
//   then, per pick 1..6 (rank order): real tile tap → PickDetailModal settles →
//   1.5s hold on modal top (digits · energy · confidence · breakdown) → close.
//   Hard cuts between modals. Body = 19.0s = 1140 frames — the total is
//   unchanged from the 4.0s+6×2.5s layout so every downstream timing (VO
//   window, stamp fades, endcard mix, check-reel-assets BODY) is untouched;
//   the grid gain is paid for entirely by the modal holds (2.5→1.5s each).
//
// REAL DATA ONLY. Aborts (exit 1) if today's (ET) slate for the scope is absent
// (anon REST precheck + rendered-DOM guards).
//
// Usage: tsx scripts/render-allday-body.ts [outDir] [YYYY-MM-DD] [--scope=…]
//   outDir default assets/marketing/<scope>_reels; optional date re-anchors the
//   browser clock to that day 7:30 PM ET (real data for that slate date —
//   used for off-hours sample renders; daily production omits it).
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { REEL_SCOPES, parseScopeFlag, positionals, bodyFileFor, bodyFileForMode } from './reel-scopes';
import { provenanceArgs } from './reel-provenance';
import { installRedaction, assertNoDigits } from './reel-redact';
import { installRelabel, assertPublicClean, RELABEL_SLOTS } from './reel-relabel';
import { installNotation, removeNotation, notationTimerFilter } from './reel-notation';

const BASE = 'http://localhost:8081';
const ARGS = positionals(process.argv.slice(2));
const SCOPE = parseScopeFlag(process.argv);
/**
 * MKT-15 P2 — `--redact` masks every rendering of the combination in the
 * captured DOM. Used by the FREE-GROUP session reels, whose whole conversion
 * frame is that the board is shown and the numbers are not.
 *
 * The app is not modified: this is DOM injection, so there is no code path a
 * real subscriber can reach and no flag to leak.
 */
const REDACT = process.argv.includes('--redact');
/**
 * MKT-15 P2 — `--relabel` produces the PUBLIC cut: redaction PLUS the tier-1
 * copy swaps, session-label drops, state-code suppression and the bolt-over-
 * placeholder look. Implies redaction; refuse a relabel-only invocation — a
 * relabelled capture with live digits is not a thing any surface may consume.
 */
const RELABEL = process.argv.includes('--relabel');
if (RELABEL && !REDACT) {
  console.error('ABORT: --relabel requires --redact — the public cut is redact + relabel, never relabel alone.');
  process.exit(1);
}
const SPEC = REEL_SCOPES[SCOPE];
// MKT-26: `--redact` on a scope that has no redacted variant would render a
// masked capture nothing will ever read — and, before bodyFileFor keyed the
// name on the capture mode, would have written it OVER the full-fidelity body
// that scope's reels do read. Refuse rather than produce an orphan.
//
// The PUBLIC capture is exempt from that gate ON PURPOSE: it writes a
// mode-keyed name that collides with nothing, and since MKT-16 registration
// (2026-07-30) `allday_public` consumes it — the assembler asserts both the
// REDACT and PUBLIC container tags before stamping it.
if (REDACT && !RELABEL && !(SPEC.redactedVariants ?? []).length) {
  console.error(
    `ABORT: --redact passed for scope "${SCOPE}", which declares no redacted variants.\n` +
    `       Nothing would consume the masked capture. Add the variant to redactedVariants\n` +
    `       in scripts/reel-scopes.ts first, or drop the flag.`,
  );
  process.exit(1);
}
const OUT_DIR = resolve(ARGS[0] ?? `assets/marketing/${SPEC.dir}`);
const FPS = 60;
const VIEW_H = 960;
const GRID_FRAMES = 600;        // 10.0s STATIC grid hold (MKT-56: was a 4.0s
                                // zoompan push-in — members could not notate
                                // the six picks off a moving 4s frame)
const MODAL_HOLD = 90;          // 1.5s per pick modal (MKT-56: 2.5→1.5s pays
                                // for the wider grid hold; MKT-09 had widened
                                // 2.0→2.5s for the ~19.5s carriers, and TOTAL
                                // is still 19.0s so that VO window is intact)
const PICKS = 6;
const TOTAL = GRID_FRAMES + PICKS * MODAL_HOLD;   // 1140 = 19.0s (unchanged)

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function slateExists(dateISO: string): Promise<boolean> {
  const env = readFileSync(resolve('.env'), 'utf8');
  const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(\S+)/)?.[1];
  const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(\S+)/)?.[1];
  if (!url || !key) return false;
  const res = await fetch(
    `${url}/rest/v1/slate_snapshots?scope=eq.${SCOPE}&mode=eq.balanced&slate_date=eq.${dateISO}&deleted_at=is.null&select=top_k_straights_json`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.some((r: any) => Array.isArray(r.top_k_straights_json) && r.top_k_straights_json.length === 6);
}

const initScript = (fakeMs: number | null) => {
  try {
    window.localStorage.setItem('user', JSON.stringify({ id: 'default', role: 'premium' }));
    window.localStorage.setItem('hm:theme-mode', 'dark');
    window.localStorage.setItem('onboarding_complete', 'true');
    // MKT-57: capture the coffee-mode Home (AsyncStorage on web = localStorage,
    // key from hooks/useCoffeeMode.tsx). Capture-side only — no app change.
    window.localStorage.setItem('coffee_mode_enabled_v1', '1');
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

async function openCoffeeHome(page: import('playwright').Page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.waitForTimeout(5_000);
  const tab = page.getByRole('tab', { name: SPEC.tab }).first();
  await tab.click();
  await page.waitForTimeout(3_000);
  // MKT-15 P2 — install the mask BEFORE any frame is captured, and keep it
  // installed: a MutationObserver re-masks as React re-mounts digits when each
  // of the six modals opens. Installed after the scope tab so the board it
  // masks is the board that will be captured.
  if (REDACT) {
    await installRedaction(page);
    await page.waitForTimeout(800);
    // Assert immediately rather than at the end. A leak found after 960 frames
    // is a leak that already exists on disk; found here, nothing was written.
    await assertNoDigits(page, `${SCOPE} coffee grid (pre-capture)`);
    console.log(`REDACTED capture — board masked and asserted clean before frame 0.`);
  }
  if (RELABEL) {
    await installRelabel(page);
    await page.waitForTimeout(800);
  }
  // MKT-13: the ONLY way this lane can go wrong quietly is capturing one scope's
  // board into another scope's filename — so assert the tab actually took.
  // Read the LABEL, not aria-selected (react-native-web folds accessibilityState
  // into the accessible name: "🌙 Evening scope, selected").
  const label = (await tab.getAttribute('aria-label')) ?? '';
  if (!/,\s*selected\b/.test(label)) {
    console.error(
      `ABORT: the ${SPEC.stampLabel} scope tab did not become selected (aria-label="${label}") — ` +
      `the capture would show a different scope's board under a ${SCOPE} filename.`,
    );
    process.exit(1);
  }
  // MKT-57: assert we are on the COFFEE Home, not the full Home — the full
  // Home renders a hero band / banners / sparkline and no "NEXT DRAW" block.
  const coffee = await page.evaluate(() => {
    const t = document.body.innerText;
    return t.includes('NEXT DRAW') && (t.match(/^#[1-6]$/gm) ?? []).length === 6;
  });
  if (!coffee) { console.error('ABORT: coffee-mode Home did not render (no NEXT DRAW block / six rank tiles) — capture surface is wrong.'); process.exit(1); }
  if (RELABEL) {
    await assertPublicClean(page, `${SCOPE} coffee grid (pre-capture)`);
    console.log(`PUBLIC capture — relabelled and lint-audited clean before frame 0.`);
  }
}

/**
 * MKT-57: tile centers are READ from the DOM (the "#N" rank leaf's parent is
 * the tappable tile), sorted visually — no hardcoded coordinates, so a layout
 * change in the coffee grid moves the taps with it. Works identically on the
 * redacted cut (rank labels are never masked).
 */
async function coffeeTileCenters(page: import('playwright').Page): Promise<Array<[number, number]>> {
  const tiles: Array<[number, number, number]> = await page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('*')).filter(e => !e.children.length);
    return leaves
      .filter(e => /^#[1-6]$/.test((e.textContent || '').trim()))
      .map(e => { const r = (e.parentElement as HTMLElement).getBoundingClientRect(); return [Number((e.textContent || '').trim().slice(1)), r.left + r.width / 2, r.top + r.height / 2] as [number, number, number]; })
      .sort((a, b) => a[0] - b[0]);
  });
  if (tiles.length !== 6) { console.error(`ABORT: found ${tiles.length} rank tiles on the coffee Home (expected 6).`); process.exit(1); }
  return tiles.map(t => [t[1], t[2]]);
}

(async () => {
  const dateISO = ARGS[1] ?? todayET();
  const stamp = dateISO.replace(/-/g, '');
  // Shift the browser clock when rendering a non-current date (23:30 UTC = 7:30 PM ET).
  const fakeMs = ARGS[1] ? Date.parse(`${dateISO}T23:30:00Z`) : null;

  if (!(await slateExists(dateISO))) {
    console.error(`ABORT: no ${SPEC.stampLabel} slate for ${dateISO} — run the Daily Workflow first; no reel body rendered.`);
    process.exit(1);
  }

  const WORK = join(tmpdir(), `${SCOPE}-frames-${stamp}`);
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  // MKT-26: a redacted capture is a DIFFERENT body, not the same body with a
  // flag — pro and free session reels need both to exist for the same scope and
  // date. `bodyFile` keeps the full-fidelity name exactly as it was, so nothing
  // that already works changes name.
  const outMp4 = join(OUT_DIR, RELABEL ? bodyFileForMode(SCOPE, 'public', stamp) : bodyFileFor(SCOPE, REDACT, stamp));
  const fname = (i: number) => join(WORK, `frame_${String(i).padStart(4, '0')}.png`);

  const browser = await chromium.launch();

  // ── Single capture context (2x = native 1080x1920 frames) ──
  // MKT-56: the grid is a static hold now, so the separate 3x-resolution
  // still + zoompan pass is gone — the grid frame is captured here, in the
  // same context the modals open from, and copied across its hold.
  const ctx = await browser.newContext({
    viewport: { width: 540, height: VIEW_H }, deviceScaleFactor: 2,
    colorScheme: 'dark', isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(initScript, fakeMs);
  await openCoffeeHome(page);
  const gridCheck = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'));
    let scroller: HTMLDivElement | null = null;
    for (const d of divs) if (d.scrollHeight > d.clientHeight + 20 && (!scroller || d.scrollHeight > scroller.scrollHeight)) scroller = d;
    return { overflow: scroller ? scroller.scrollHeight - scroller.clientHeight : 0 };
  });
  if (gridCheck.overflow > 8) {
    console.error(`ABORT: coffee Home unexpectedly scrolls (${gridCheck.overflow}px overflow) — not a one-screen surface.`);
    process.exit(1);
  }
  // MKT-56b: member-legibility layer (emboss + notation strip) on the
  // FULL-FIDELITY still only — never on a masked cut, where the digits are the
  // thing being withheld. Read back from the rendered grid, so it cannot
  // disagree with the tiles; abort if it does not find exactly six.
  if (!REDACT) {
    const combos = await installNotation(page, SPEC.stampLabel);
    if (combos.length !== 6) { console.error(`ABORT: notation layer read ${combos.length} combos from the grid (expected 6).`); process.exit(1); }
    await page.waitForTimeout(150);
    console.log(`notation layer installed · ${combos.join(' ')}`);
  }
  await page.screenshot({ path: fname(0) });   // 1080x1920, no zoom headroom needed
  if (!REDACT) await removeNotation(page);     // the modals must not carry the strip
  for (let f = 1; f < GRID_FRAMES; f++) copyFileSync(fname(0), fname(f));
  console.log(`captured grid still hold (${GRID_FRAMES} frames, ${(GRID_FRAMES / FPS).toFixed(1)}s, static)`);

  // Tile centers (CSS px, read from the DOM — MKT-57) and the modal close button.
  const TILES = await coffeeTileCenters(page);
  const CLOSE: [number, number] = [36, 63];

  const setScroll = (px: number) =>
    page.evaluate(y => { const el = (window as any).__adScroll; if (el) el.scrollTop = y; }, px);

  for (let i = 0; i < PICKS; i++) {
    await page.mouse.click(TILES[i][0], TILES[i][1]);
    await page.waitForTimeout(2_000);   // slide-up + queries settle
    // Under --relabel the injected swaps have already rewritten the header by
    // the time this reads it, so the assertion targets the PUBLIC strings —
    // asserting PICK/BEST STRAIGHT would fail on exactly the frames that are
    // correct.
    const marks = RELABEL
      ? { head: `${RELABEL_SLOTS.cardHeader}${i + 1}`, label: RELABEL_SLOTS.bestLabel }
      : { head: `PICK #${i + 1}`, label: 'BEST STRAIGHT' };
    const modal = await page.evaluate(({ head, label }: { head: string; label: string }) => {
      const text = document.body.innerText;
      const ok = text.includes(head) && new RegExp(label, 'i').test(text);
      const divs = Array.from(document.querySelectorAll('div'));
      let scroller: HTMLDivElement | null = null;
      for (const d of divs) if (d.scrollHeight > d.clientHeight + 50 && (!scroller || d.scrollHeight > scroller.scrollHeight)) scroller = d;
      if (scroller) { (scroller.style as any).scrollBehavior = 'auto'; (window as any).__adScroll = scroller; }
      return { ok, vocab: (text.match(/\b(partial|exact)\b/gi) ?? []).length };
    }, marks);
    if (!modal.ok) { console.error(`ABORT: ${marks.head} modal did not open from its coffee tile.`); process.exit(1); }
    if (modal.vocab > 0) { console.error('ABORT: banned match-status vocabulary rendered in modal — BRAND-04 blocking stop.'); process.exit(1); }
    // Public cut: every modal is a fresh mount, so the audit runs per modal —
    // the acceptance bar is zero violations across every captured frame.
    if (RELABEL) await assertPublicClean(page, `${SCOPE} modal #${i + 1}`);

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

  // ── One frame sequence (grid hold + six modal holds) → body ──
  execSync(
    `ffmpeg -y -loglevel error -start_number 0 -framerate ${FPS} -i "${join(WORK, 'frame_%04d.png')}" ` +
    `-frames:v ${TOTAL} ` +
    // MKT-56b: hold-timer bar drains across the still on the full-fidelity cut.
    (REDACT ? '' : `-filter_complex "${notationTimerFilter(GRID_FRAMES / FPS, FPS)}" -map "[v]" `) +
    `-c:v libx264 -pix_fmt yuv420p -r ${FPS} -crf 18 ` +
    // MKT-18: record WHICH DATE these pixels are of, inside the file, so the
    // assembler can refuse to stamp a different one over them.
    // MKT-26: record WHETHER these pixels are masked, for the same reason —
    // so the assembler can refuse to hand a full-fidelity body to a free
    // session kind. The filename says it too; the tag is what makes the
    // assertion about the capture rather than the path.
    `${provenanceArgs(dateISO, REDACT, RELABEL)} "${outMp4}"`,
    { stdio: 'inherit' },
  );
  rmSync(WORK, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outMp4}"`).toString().trim();
  console.log(`${SCOPE} body: ${outMp4} · date ${dateISO} · grid still 10.0s (6 picks, no zoom)+six modals 1.5s · ${dur}s`);
})();
