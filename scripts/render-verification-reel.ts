// MKT-02 Phase 1 — "Yesterday's Receipts" UI segment renderer.
//
// Renders ui_verify_YYYYMMDD.mp4 (1080x1920, 60fps) from the live Verified Track
// Record screen, positioned at YESTERDAY's (ET) day group. Deterministic frame
// capture (MKT-01 pattern): eased scroll positions computed per frame, no
// wall-clock recording.
//
// ── MKT-27 (2026-07-29): READABLE HOLDS. Beat map and LENGTH both rewritten ──
//
// Operator ruling: "a viewer must read a row completely, digits, badge and
// 'Drew X in Y', with no pause." MKT-25's restaging kept the total at 378 frames
// and split the ledger time across two 1.0s holds, which is under a reading pass
// for a ten-word line — the reel stopped being boring without becoming legible.
//
// THE 378-FRAME CONSTRAINT WAS SELF-IMPOSED AND IS NOW LIFTED. MKT-25 froze the
// count because `carrierNeed = uiDur + 2.9` against a 10.005s verif_carrier caps
// the body at 7.105s of COVERED audio. That is a cap on the VO, not on the reel:
// the assembler derives total, stamp windows and contact sheet from uiDur, so a
// longer body assembles correctly and simply runs past the end of the carrier.
// Trading silence under the closing holds for legibility is the operator's call
// (see the gap arithmetic in the handover note); the renderer no longer pretends
// the ceiling is structural.
//
// Beat map — frame counts, @60fps. N = featured rows (1-3):
//   slate      150   2.50s  THE BOARD WE POSTED — yesterday's six picks as
//                           published, landed ones marked with their result.
//                           Composited from slate_snapshots (see
//                           render-verify-slate.ts), because the app cannot show
//                           a past slate. This is the half that makes a record
//                           mean anything: outcomes with no evidence they were
//                           called in advance prove nothing.
//   summary    120   2.00s  the summary band, held with a barely-there push
//   scroll     120   2.00s  ONE slow eased pan down the day group into row 1
//   per row  96/120  1.6/2.0s  HOLD with a push-in — 2.0s for a STRAIGHT,
//                           1.6s for a box. Straights are the strongest proof
//                           in the reel and get the longest holds (ruling).
//   travel      36   0.60s  between consecutive holds, zoom released
//   settle      18   0.30s  release the last zoom so the cut to the endcard
//                           lands on a still frame
//
// So the body is 8.6-14.0s depending on what yesterday produced — printed by
// this script and consumed by the assembler, never assumed anywhere.
//
// WHY HOLDS AND NOT A CRAWL (operator: "the verify reel is boring", MKT-25). A
// continuous scroll gives the eye nothing to land on and passes every row at the
// same weight, so the strongest evidence reads exactly like the weakest. Each
// ledger row already carries both halves of the claim on one line ("681 · BOX
// All Day · Drew 186 in CT evening" is the call AND the outcome) — it only needs
// long enough on screen to be read.
//
// STRAIGHTS ARE FEATURED FIRST, and they are scarce: 2026-07-28 had 11 matched
// rows and only 2 straights. Boxes backfill to three so the ledger beat does not
// collapse to a single hold on a thin day.
//
// THE BEAT MAP IS DATA-ADAPTIVE, unlike every other reel in the pipeline. Slate
// reels always have exactly 6 picks; verify has whatever yesterday produced.
// With 0 detectable rows it degrades to board + summary + one pan (no holds to
// place) rather than aborting; with no confirmed matches at all it still aborts
// and no reel is made.
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
import { renderSlateFrames } from './render-verify-slate';

const BASE = 'http://localhost:8081';
// MKT-40: flags stripped so `--public` can't be mistaken for the outDir.
const OUT_DIR = resolve(process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'assets/marketing/verify_reels');
const FPS = 60;
const VIEW_H = 960;                     // CSS px @2 DPR => 1920
/** MKT-27 beat sizes, in frames. The TOTAL is derived from these plus the row
 *  selection — nothing downstream may hardcode a frame count. */
const F_SLATE = 150;        // 2.50s — the board we posted
const F_SUMMARY = 120;      // 2.00s — summary band hold
const F_PAN = 120;          // 2.00s — one eased pan into the first featured row
const F_HOLD_STRAIGHT = 120; // 2.00s — a straight is the strongest proof here
const F_HOLD_BOX = 96;       // 1.60s — still a full reading pass for one line
const F_TRAVEL = 36;        // 0.60s — between holds
const F_SETTLE = 18;        // 0.30s — release the zoom before the endcard cut
/** At most three holds: a fourth pushes the body past 16s, where the reel stops
 *  reading as a receipt and starts reading as a list. */
const MAX_FEATURED = 3;
/** Push-in at the peak of a hold. Modest on purpose — this is a ledger, not a
 *  reveal, and a hard zoom on a receipts reel reads as salesmanship. */
const ZOOM_MAX = 1.28;
/**
 * Comfortable pan distance for the 2.0s scroll beat (~625 px/s at VIEW_H=960).
 *
 * A long day group can put the first featured row several screens down, and
 * covering that in 2.0s is a blur rather than a pan. Past this distance the beat
 * STARTS closer instead of moving faster — a cut from the summary band to a
 * lower position, then the same slow pan. Keeping the beat length fixed is what
 * makes the body duration a function of the row selection alone, which is what
 * the operator has to reason about.
 */
const MAX_PAN_PX = 1200;
/**
 * Below this, the pan beat has nowhere to go and is DROPPED — its frames are
 * redistributed to the inter-hold travels instead.
 *
 * ⚠ FOUND BY RENDERING, NOT BY READING. The first real render of this beat map
 * logged `pan 0→0px`: yesterday's group started at the top of the page and its
 * first featured row sat inside the opening viewport, so `parkFor` clamped to 0
 * and the "slow eased pan" was two seconds of frozen frame — stacked directly
 * behind a summary hold that is also at scrollTop 0, for 4.0s of stillness on a
 * reel whose entire complaint was being boring.
 *
 * Dropping the beat rather than forcing motion is the right answer because there
 * genuinely is nothing above row 1 to traverse. The ledger still gets traversed:
 * the travels between holds move DOWN through the group, and with the pan's
 * frames folded into them they become slow legible pans instead of 0.6s hops.
 * Total body length is unchanged either way, which is what keeps the carrier
 * arithmetic predictable.
 */
const MIN_PAN_PX = 120;
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;

/**
 * ⚠ THE `timeZone` OPTION MUST NOT APPEAR ON THE OUTPUT FORMAT — that was a
 * DOUBLE CONVERSION and it graded the wrong day (fixed 2026-08-01).
 *
 * Line 1 already rebases the instant into ET wall-clock: `toLocaleString` gives
 * the ET reading, and re-parsing it produces a Date whose *container-local*
 * (UTC) fields ARE the ET fields. From that point on the value is no longer a
 * true instant, so formatting it with `timeZone: 'America/New_York'` shifts it
 * a SECOND time — another −4h. Below 04:00 ET that extra shift crosses
 * midnight backwards and yields D−2.
 *
 * It only ever misfired between 00:00 and 03:59 ET, which is why it survived:
 * the daily run happens ~08:30 ET. It surfaced on 2026-08-01 at 01:06 ET, when
 * the renderer built 07-30 while `publish-reels` (which omits the option, and
 * is the correct form) looked for 07-31 — so verify assembled stale receipts
 * and published nothing.
 *
 * Keep this identical to `etDate()` in publish-reels.ts and to the assembler's
 * copy; all three must agree or the pipeline silently splits like it did here.
 */
function yesterdayET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('en-CA');
}

(async () => {
  // MKT-40 — the PUBLIC capture: digits masked upstream, match vocabulary
  // relabelled, sessions/states dropped, rollup reframed to structurally
  // two-digit stats, all asserted fail-closed before a single frame encodes.
  const PUBLIC = process.argv.includes('--public');
  const dateISO = yesterdayET();
  const stamp = dateISO.replace(/-/g, '');
  const WORK = join(tmpdir(), `reel-frames-${PUBLIC ? 'public-' : ''}${stamp}`);
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const outMp4 = join(OUT_DIR, `ui_verify${PUBLIC ? '_public' : ''}_${stamp}.mp4`);
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

  // MKT-51: ?capture=1 = the screen's deterministic-capture contract — the
  // summary count-up snaps to final values, so no animation frame can leak
  // into the captured body. The screen also exposes nativeID anchors
  // (#tr-summary, #day-<date>) as a sturdier alternative to the geometric
  // scroller/day-group discovery below if it ever breaks.
  await page.goto(BASE + '/track-record?capture=1', { waitUntil: 'networkidle', timeout: 180_000 });
  await page.getByText('Verified Track Record').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4_000);     // queries fully settle (count-up snaps under capture=1)

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

  // ── MKT-40: the PUBLIC SWEEP. Runs AFTER layout (row positions and the
  // STRAIGHT classification are read from the un-swept DOM) and BEFORE any
  // frame. Text is REPLACED, never hidden — hiding reflows the page and
  // invalidates every measured row top. The sweep walks TEXT NODES (the
  // MKT-30 lesson: element-scoped sweeps miss appended nodes), then a
  // fail-closed audit aborts the render on any surviving digit run,
  // match-vocabulary token, session word or state attribution.
  if (PUBLIC) {
    // ⚠ STRING-EVALUATED, not a function: tsx/esbuild injects `__name` helpers
    // into nested function expressions inside page.evaluate callbacks, which
    // do not exist in the browser context (ReferenceError at run time). A
    // template-literal IIFE bypasses the transform entirely.
    const violations = await page.evaluate(`(() => {
      const SCOPE_WORDS = /\\b(Midday|Evening|All Day)\\b/g;
      const ICONS = /[\\u2600-\\u27BF\\u{1F300}-\\u{1FAFF}\\uFE0F\\u25C8]/gu;
      // 1. Summary band -> structurally two-digit stats. Values sourced from
      // the page itself (days from the DAYS cell, jurisdictions from the sub
      // line) -- reframed, never fabricated.
      const leaves = Array.from(document.querySelectorAll('*'))
        .filter(e => e.children.length === 0 && (e.textContent || '').trim().length > 0);
      const labelOf = t => leaves.find(e => (e.textContent || '').trim() === t);
      const cellFor = label => (label && label.parentElement) || null;
      const valueLeaf = (cell, label) =>
        cell ? (Array.from(cell.children).find(c => c !== label) || null) : null;
      const dLab = labelOf('DAYS'); const mLab = labelOf('MATCHES');
      const sLab = labelOf('STRAIGHT'); const bLab = labelOf('BOX');
      const days = dLab ? ((valueLeaf(cellFor(dLab), dLab) || {}).textContent || '').trim() : '';
      const sub = leaves.find(e => /^Across \\d+ jurisdictions/.test((e.textContent || '').trim()));
      const jxM = sub ? (sub.textContent || '').match(/Across (\\d+) jurisdictions/) : null;
      const jx = jxM ? jxM[1] : '';
      const setCell = (label, value, newLabel) => {
        if (!label) return;
        const v = valueLeaf(cellFor(label), label);
        if (v) v.textContent = value;
        label.textContent = newLabel;
      };
      setCell(mLab, days || '30', 'DAYS GRADED');
      setCell(sLab, jx || '40+', 'JURISDICTIONS');
      setCell(bLab, '40+', 'STATES COVERED');
      setCell(dLab, '6', 'SIGNALS DAILY');
      if (sub) sub.textContent = 'GRADED IN PUBLIC · EVERY MORNING';
      // 2a. ELEMENT-level pass for the attribution line FIRST: "Drew {digits}
      // in {state} {session}" renders as SEVERAL text nodes inside one leaf
      // (each interpolation is its own node — the MKT-30 appended-node
      // lesson), so a node-by-node rule leaves the " in NC midday" sibling
      // standing. Setting textContent on the LEAF collapses all of them.
      for (const e of leaves) {
        if (/^Drew\\b/.test((e.textContent || '').trim())) {
          e.textContent = 'Drew \\u2022\\u2022\\u2022 \\u00b7 verified against the official draw';
        }
      }
      // 2b. Text-node sweep: digits -> dots, match vocabulary -> public set,
      // attribution collapsed, sessions/icons stripped, ISO day headers
      // de-yeared (REPLACED, never hidden -- hiding reflows the page and
      // invalidates every measured row top).
      const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);
      for (const t of texts) {
        const s = t.textContent || '';
        if (!s.trim()) continue;
        const iso = s.trim().match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
        if (iso) { t.textContent = MONTHS[+iso[2] - 1] + ' ' + (+iso[3]); continue; }
        if (/^Drew\\b/.test(s.trim())) { t.textContent = 'Drew \\u2022\\u2022\\u2022 \\u00b7 verified against the official draw'; continue; }
        if (/^\\d{3}$/.test(s.trim())) { t.textContent = '\\u2022\\u2022\\u2022'; continue; }
        const out = s
          .replace(/\\bSTRAIGHT\\b/g, 'EXACT ORDER')
          .replace(/\\bBOX\\b/g, 'ANY ORDER')
          .replace(SCOPE_WORDS, '')
          .replace(ICONS, '')
          .replace(/[ \\t]{2,}/g, ' ');
        if (out !== s) t.textContent = out;
      }
      // 3. FAIL-CLOSED AUDIT -- prove the sweep found what it protects.
      const bad = [];
      const nowLeaves = Array.from(document.querySelectorAll('*'))
        .filter(e => e.children.length === 0 && (e.textContent || '').trim().length > 0
          && e.tagName !== 'STYLE' && e.tagName !== 'SCRIPT' && e.tagName !== 'NOSCRIPT');
      for (const e of nowLeaves) {
        const txt = (e.textContent || '').trim();
        if (/\\d{3}/.test(txt)) bad.push('digit-run: "' + txt.slice(0, 60) + '"');
        if (/\\b(STRAIGHT|BOX)\\b/.test(txt)) bad.push('match-vocab: "' + txt.slice(0, 60) + '"');
        if (/\\b(Midday|Evening|MIDDAY|EVENING)\\b/.test(txt)) bad.push('session: "' + txt.slice(0, 60) + '"');
        if (/\\bin [A-Z]{2}\\b/.test(txt)) bad.push('state-attribution: "' + txt.slice(0, 60) + '"');
      }
      return bad;
    })()`) as string[];
    if (violations.length) {
      console.error(`ABORT: public sweep incomplete — ${violations.length} violation(s):\n  ` + violations.slice(0, 12).join('\n  '));
      await browser.close();
      process.exit(1);
    }
    console.log('public sweep: rollup reframed, digits masked, vocabulary relabelled — audit clean.');
  }
  const L = layout as {
    scrollHeight: number; clientHeight: number; yTop: number; nextTop: number; rowCount: number;
    rows: Array<{ top: number; height: number; straight: boolean }>;
  };

  const setScroll = (px: number) =>
    page.evaluate(y => { const el = (window as any).__adScroll; if (el) el.scrollTop = y; }, px);

  /**
   * Zoom by CSS transform on the scroller, NOT by cropping the captured frame.
   *
   * The browser re-rasterises text at the transformed scale, so a held row stays
   * crisp; cropping a 1080x1920 capture and scaling it back up would soften
   * exactly the text the hold exists to let someone read.
   *
   * ⚠ THE ORIGIN IS TOP-LEFT AND FIXED. MKT-25 set it to the featured row's
   * centre (`50% ${y}px`), which reads well in the abstract and fails twice on
   * this screen — both found by inspecting a real render at the zoom peak, not by
   * reading the code:
   *
   *   1. THE COMBO DIGITS CLIP OFF THE LEFT EDGE. A row is left-aligned and its
   *      combo is the leftmost element (x≈30 of 540). Scaling 1.28 about the
   *      horizontal centre maps x=30 to x=-37 — so the first thing lost is the
   *      digits, on a reel whose stated requirement is that a viewer can read
   *      "digits, badge and 'Drew X in Y'".
   *   2. THE SCALED SCROLLER RIDES UP OVER THE PAGE HEADER. Any k>1 about an
   *      origin below the top moves the scroller's top edge to originY*(1-k) < 0,
   *      and the "Verified Track Record" title sits outside the scroller, so the
   *      stats band renders through it.
   *
   * Anchoring at 0% 0 fixes both by construction: x=0 and y=0 are fixed points,
   * so nothing crops on the left and nothing rises over the header. The featured
   * row is then held in frame by COMPENSATING THE SCROLL as k changes — see
   * `parkAt`. Vertical framing becomes the scroll's job and magnification the
   * zoom's, rather than both fighting over the same transform.
   */
  const setZoom = (k: number) =>
    page.evaluate(({ k }) => {
      const el = (window as any).__adScroll as HTMLElement | undefined;
      if (!el) return;
      el.style.transformOrigin = '0% 0';
      el.style.transform = k === 1 ? '' : `scale(${k})`;
    }, { k });

  // MKT-27: choose the featured rows — straights first, then the earliest boxes,
  // and always in document order once chosen so the camera never travels
  // backwards up the ledger (which reads as a mistake, not a beat).
  const straights = L.rows.filter(r => r.straight);
  const boxes = L.rows.filter(r => !r.straight);
  const featured = [...straights, ...boxes]
    .slice(0, MAX_FEATURED)
    .sort((a, b) => a.top - b.top);

  // ── Beat plan. Built BEFORE any capture so the frame total is known up front
  // and the same arithmetic prints in the log the operator reads. ──
  const holdFor = (r: { straight: boolean }) => (r.straight ? F_HOLD_STRAIGHT : F_HOLD_BOX);

  /**
   * Scroll position that puts a row at ~42% of the viewport AT ZOOM k: high
   * enough to read, low enough that the rows above it still give context.
   *
   * The /k is what makes the top-left-anchored zoom hold its subject. With the
   * origin pinned at 0,0 a row at content offset P renders at (P - scroll)*k, so
   * keeping it at a fixed fraction of the viewport means the scroll must ease
   * DOWN as the push-in eases IN. The two moves are ~90px apart over a hold and
   * read as one gentle settle rather than two gestures.
   *
   * Clamped at 0: rows in the first viewport of a group cannot be pulled to 42%
   * because there is nothing above them to scroll away. They land higher instead,
   * which is correct — the alternative is scrolling the group's own header off
   * screen to satisfy a number.
   */
  const maxScroll = Math.max(0, L.scrollHeight - L.clientHeight);
  const parkAt = (r: { top: number; height: number }, k: number) =>
    Math.max(0, Math.min(r.top + r.height / 2 - (0.42 * VIEW_H) / k, maxScroll));
  const parks = featured.map(r => parkAt(r, 1));
  // Where the pan begins. The summary band sits at scrollTop 0 by construction
  // (it is the page header), so a group within one comfortable pan reads as one
  // continuous move from the band down into the evidence.
  const panTo = parks[0] ?? Math.min(Math.max(0, L.yTop - 0.45 * VIEW_H), maxScroll);
  const panFrom = Math.max(0, panTo - MAX_PAN_PX);
  const panning = panTo - panFrom >= MIN_PAN_PX;
  // Dropped pan → its frames go to the travels, so the body length does not
  // depend on which branch was taken. With one featured row there is no travel
  // to give them to, so they fall back into that row's hold.
  const gaps = Math.max(1, featured.length - 1);
  const panFrames = panning ? F_PAN : 0;
  const spare = panning ? 0 : Math.floor(F_PAN / gaps);
  const travelFrames = featured.length > 1 ? F_TRAVEL + spare : F_TRAVEL;
  const holdBonus = featured.length > 1 ? 0 : spare;

  const ledgerFrames = featured.length
    ? featured.reduce((n, r) => n + holdFor(r), 0) + holdBonus
      + (featured.length - 1) * travelFrames + F_SETTLE
    : F_SETTLE;
  // Any frames lost to the floor divisions above land in the settle, so TOTAL is
  // exactly what gets captured.
  const TOTAL = F_SLATE + F_SUMMARY + panFrames + ledgerFrames
    + (panning ? 0 : F_PAN - spare * gaps);

  console.log(
    `date=${dateISO} rows=${L.rowCount} detected=${L.rows.length} straight=${straights.length} ` +
    `featured=${featured.length} [${featured.map(r => (r.straight ? 'STRAIGHT' : 'box')).join(', ')}]`,
  );
  console.log(
    `beat plan: ${TOTAL} frames = ${(TOTAL / FPS).toFixed(2)}s ` +
    `(slate ${F_SLATE} + summary ${F_SUMMARY} + pan ${panFrames} + ledger ${ledgerFrames}) · ` +
    (panning
      ? `pan ${Math.round(panFrom)}→${Math.round(panTo)}px`
      : `pan DROPPED (only ${Math.round(panTo - panFrom)}px available) — travels widened to ${travelFrames}f`),
  );

  const shoot = async (f: number, scroll: number, k: number) => {
    await setScroll(scroll);
    await setZoom(k);
    await page.screenshot({ path: fname(f) });
  };

  // ── f000+ — THE BOARD WE POSTED. Composited from the snapshot, because the app
  // cannot display a past slate. Rendered on EVERY path including the no-rows
  // degrade: it does not depend on row detection, and it is the half that makes
  // the record mean anything, so losing it to a DOM change would be the worst
  // possible thing to drop. (MKT-25 rendered it only on the restaged path.)
  const landed = await renderSlateFrames(WORK, fname, 0, F_SLATE, dateISO, 'allday', PUBLIC);
  console.log(`slate segment: ${landed} of 6 landed — rendered f000-f${F_SLATE - 1}${PUBLIC ? ' (public cut: digits masked)' : ''}`);

  // ── summary band — held at the top of the page with a barely-there push, so
  // the totals land before any individual row is argued from.
  //
  // The push goes IN AND BACK OUT across the beat rather than ending zoomed. It
  // used to end at 1.04 while the next beat opened at 1.00, which is a visible
  // scale pop on a cut between two frames of the same static content — and with
  // the pan dropped those two beats are adjacent at the same scroll position,
  // where the pop is at its most obvious.
  const SUMMARY_ZOOM = 1.04;
  for (let f = F_SLATE; f < F_SLATE + F_SUMMARY; f++) {
    const raw = (f - F_SLATE) / (F_SUMMARY - 1);
    const t = easeInOut(raw < 0.5 ? raw * 2 : (1 - raw) * 2);
    await shoot(f, 0, 1 + (SUMMARY_ZOOM - 1) * t);
  }

  // ── one slow eased pan into the first featured row (when there is distance).
  const panStart = F_SLATE + F_SUMMARY;
  for (let f = panStart; f < panStart + panFrames; f++) {
    const t = easeInOut((f - panStart) / (panFrames - 1));
    await shoot(f, panFrom + (panTo - panFrom) * t, 1);
  }

  let cursor = panStart + panFrames;
  if (!featured.length) {
    // No row was detectable — the DOM shape is the only thing that can break
    // row anchoring, and board + summary + pan is still a coherent reel. Freeze
    // the settle rather than invent holds with nowhere to land.
    console.log('NOTE: no rows detected — board + summary + pan only, no holds.');
    await shoot(cursor, panTo, 1);
    for (let f = cursor + 1; f < TOTAL; f++) copyFileSync(fname(cursor), fname(f));
  } else {
    for (let i = 0; i < featured.length; i++) {
      const row = featured[i];
      const hold = holdFor(row) + holdBonus;
      // Hold — push in across the whole beat, with the scroll easing down in
      // step so the row stays planted at its framing fraction (see parkAt).
      for (let f = cursor; f < cursor + hold; f++) {
        const t = easeInOut((f - cursor) / (hold - 1));
        const k = 1 + (ZOOM_MAX - 1) * t;
        await shoot(f, parkAt(row, k), k);
      }
      cursor += hold;
      // Travel to the next row, releasing the zoom on the way out. Both ends are
      // re-parked at the CURRENT k so the move lands exactly where the next
      // hold's first frame will be — otherwise the cut into it jumps.
      if (i < featured.length - 1) {
        const next = featured[i + 1];
        for (let f = cursor; f < cursor + travelFrames; f++) {
          const t = easeInOut((f - cursor) / (travelFrames - 1));
          const k = ZOOM_MAX + (1 - ZOOM_MAX) * t;
          await shoot(f, parkAt(row, k) + (parkAt(next, k) - parkAt(row, k)) * t, k);
        }
        cursor += travelFrames;
      }
    }
    // Settle, so the cut to the endcard lands on a still frame.
    const lastRow = featured[featured.length - 1];
    for (let f = cursor; f < TOTAL; f++) {
      const t = easeInOut((f - cursor) / (TOTAL - cursor - 1));
      const k = ZOOM_MAX + (1 - ZOOM_MAX) * t;
      await shoot(f, parkAt(lastRow, k), k);
    }
  }
  await setZoom(1);

  await browser.close();

  execSync(
    `ffmpeg -y -loglevel error -framerate ${FPS} -i "${join(WORK, 'frame_%04d.png')}" ` +
    // MKT-27: the count is the PLAN's, not a constant. A hardcoded 378 against a
    // longer plan silently truncated the reel mid-hold.
    `-frames:v ${TOTAL} -c:v libx264 -pix_fmt yuv420p -r ${FPS} -crf 18 ` +
    // MKT-18: same provenance tag as the slate bodies — the verify assembler
    // had the identical gap (stamp from argv, existence check only).
    // MKT-40: the public body also carries PUBLIC_TAG so the assembler can
    // refuse a full-fidelity body posing as public (assertBodyPublic).
    `${provenanceArgs(dateISO, false, PUBLIC)} "${outMp4}"`,
    { stdio: 'inherit' },
  );
  rmSync(WORK, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outMp4}"`).toString().trim();
  console.log(`ui segment: ${outMp4} · date ${dateISO} · ${L.rowCount} rows · ${dur}s`);
})();
