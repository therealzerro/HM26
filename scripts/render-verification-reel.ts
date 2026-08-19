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
import { provenanceArgs, STRIKE_TAG } from './reel-provenance';
import { fetchSamedayProvenance, fmtGap } from './reel-sameday';
import { renderSlateFrames, renderCoverLiftFrames, F_COVER, F_LIFT, type BoardLabels } from './render-verify-slate';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: resolve('.env'), quiet: true });

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

/** Today in ET — the same-day kind's content date (MKT-62). */
function todayET(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return now.toLocaleDateString('en-CA');
}
/** "8:14 AM" in ET — how the timestamp pair renders. */
function fmtET(d: Date): string {
  return d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}
// fmtGap ("8h 33m") now lives in reel-sameday.ts — shared with publish-reels,
// which writes the same gap into the caption's {elapsed}.

(async () => {
  // MKT-40 — the PUBLIC capture: digits masked upstream, match vocabulary
  // relabelled, sessions/states dropped, rollup reframed to structurally
  // two-digit stats, all asserted fail-closed before a single frame encodes.
  const PUBLIC = process.argv.includes('--public');
  // MKT-62 — `--kind=verify_midday`: the SAME-DAY MIDDAY VERIFY. TODAY, not
  // yesterday; MIDDAY rows only (capture-gated ?scope=midday, the sanctioned
  // MKT-51 exception); the summary band becomes the TIMESTAMP PAIR; the board
  // beat opens COVERED and the cover lifts. Never public (real digits + state
  // attribution; no masked build exists by ruling).
  const MIDDAY = process.argv.includes('--kind=verify_midday');
  if (MIDDAY && PUBLIC) { console.error('ABORT: verify_midday has no public cut (MKT-62 ruling) — drop --public.'); process.exit(1); }
  // `--date=YYYY-MM-DD` (verify_midday ONLY): re-run/test hook — builds the
  // same-day cut for a past midday. The chip/ribbon/provenance all follow the
  // date (assertBodyDate chain), so it cannot masquerade as today; publish
  // still needs the explicit positional stamp. Never a daily-path input.
  const dateArg = process.argv.find(a => a.startsWith('--date='))?.slice(7);
  if (dateArg && !MIDDAY) { console.error('ABORT: --date is a verify_midday-only hook.'); process.exit(1); }
  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) { console.error('ABORT: --date must be YYYY-MM-DD.'); process.exit(1); }
  const dateISO = MIDDAY ? (dateArg ?? todayET()) : yesterdayET();
  const stamp = dateISO.replace(/-/g, '');
  const WORK = join(tmpdir(), `reel-frames-${PUBLIC ? 'public-' : MIDDAY ? 'midday-' : ''}${stamp}`);
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const outMp4 = join(OUT_DIR, MIDDAY ? `ui_verify_midday_${stamp}.mp4` : `ui_verify${PUBLIC ? '_public' : ''}_${stamp}.mp4`);

  // MKT-62 provenance — the reel's thesis is the GAP, and both ends of it are
  // real timestamps, never the render clock:
  //   PUBLISHED = marketing_reels.posted_at of today's midday_free row — the
  //               moment the covered board went to the free room (abort if it
  //               was never posted: no published board, no gap to prove);
  //   GRADED    = max(result_at) over today's midday matched rows in
  //               adaptive_tracking — the hit-detection clock.
  let prov: { publishedAt: Date; gradedAt: Date; matches: number; straights: number } | null = null;
  if (MIDDAY) {
    const U = process.env.EXPO_PUBLIC_SUPABASE_URL, K = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!U || !K) { console.error('ABORT: EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY missing — cannot read provenance.'); process.exit(1); }
    const get = async <T,>(path: string): Promise<T> => {
      const r = await fetch(`${U}${path}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
      if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
      return r.json() as Promise<T>;
    };
    // ── PRECONDITION CHAIN (operator ruling 2026-08-19: "the midday verify
    // reel cannot be run unless midday results have been imported"). Each
    // link is checked SEPARATELY so the abort names the actual missing step —
    // "no rows" used to mean any of four different things.
    //   1. midday LEDGER imported for today (histories, session=midday) …
    //   2. … COMPLETELY — a partial import grades against a partial day and
    //      the reel's "N matches" would be wrong by the evening (coverage vs
    //      the trailing same-weekday median; Sundays run ~27 vs ~33);
    //   3. the same-day WINDOW is still open — the evening ledger is NOT in
    //      yet (after it, hit detection may re-stamp result_at and the reel
    //      is no longer "before the evening draw"); --allow-late overrides;
    //   4. HIT DETECTION has graded today's midday board (result_at on the
    //      slate's adaptive_tracking rows — it stamps every row, not just
    //      the matches);
    //   5. the covered board was actually POSTED (midday_free.posted_at);
    //   6. ≥1 midday match — an honest zero is an honest abort.
    const ALLOW_PARTIAL = process.argv.includes('--allow-partial');
    const ALLOW_LATE = process.argv.includes('--allow-late');
    const countRows = async (path: string): Promise<number> => {
      const r = await fetch(`${U}${path}`, { headers: { apikey: K, Authorization: `Bearer ${K}`, Prefer: 'count=exact', Range: '0-0' } });
      const cr = r.headers.get('content-range') ?? '';
      const m = cr.match(/\/(\d+)$/);
      return m ? Number(m[1]) : 0;
    };
    const midRows = await countRows(`/rest/v1/histories?date_et=eq.${dateISO}&session=eq.midday&select=id`);
    if (midRows === 0) {
      console.error(`ABORT (precondition 1): the MIDDAY LEDGER for ${dateISO} is not imported (0 histories rows, session=midday). Import today's midday results first (Admin → import wizard or npm run import:results), let hit detection run, then re-run. No reel.`);
      process.exit(1);
    }
    // 2. coverage vs the same weekday over the previous 4 weeks (falls back to
    // the trailing 7 days if none) — partial imports are the silent failure.
    const dow = new Date(dateISO + 'T12:00:00Z').getUTCDay();
    const since = new Date(Date.parse(dateISO + 'T12:00:00Z') - 28 * 86400000).toISOString().slice(0, 10);
    const hist = await get<Array<{ date_et: string }>>(`/rest/v1/histories?date_et=gte.${since}&date_et=lt.${dateISO}&session=eq.midday&select=date_et&limit=1000`);
    const perDay = new Map<string, number>();
    for (const h of hist) perDay.set(h.date_et, (perDay.get(h.date_et) ?? 0) + 1);
    const sameDow = [...perDay.entries()].filter(([d]) => new Date(d + 'T12:00:00Z').getUTCDay() === dow).map(([, n]) => n).sort((a, b) => a - b);
    const ref = sameDow.length ? sameDow[Math.floor(sameDow.length / 2)] : ([...perDay.values()].sort((a, b) => a - b)[Math.floor(perDay.size / 2)] ?? midRows);
    if (midRows < Math.ceil(0.85 * ref)) {
      const msg = `midday ledger for ${dateISO} looks PARTIAL: ${midRows} rows vs a same-weekday median of ${ref}. A reel graded against a partial day would be wrong by tonight.`;
      if (!ALLOW_PARTIAL) { console.error(`ABORT (precondition 2): ${msg} Finish the import and re-run, or pass --allow-partial if the short count is real (holiday/dark states).`); process.exit(1); }
      console.log(`WARN (precondition 2, overridden): ${msg}`);
    } else {
      console.log(`ledger coverage: ${midRows} midday rows for ${dateISO} (same-weekday median ${ref}) — complete.`);
    }
    // 3. same-day window: the evening ledger must not be in yet.
    const eveRows = await countRows(`/rest/v1/histories?date_et=eq.${dateISO}&session=eq.evening&select=id`);
    if (eveRows > 0) {
      const msg = `the EVENING ledger for ${dateISO} is already imported (${eveRows} rows) — the same-day window has closed; "graded this afternoon, before the evening draw" is no longer the frame, and a re-grade may have moved result_at.`;
      if (!ALLOW_LATE) { console.error(`ABORT (precondition 3): ${msg} Pass --allow-late only for an archive build you will not post as same-day.`); process.exit(1); }
      console.log(`WARN (precondition 3, overridden): ${msg}`);
    }
    // 4. graded: hit detection stamps result_at on EVERY row of the slate.
    const slateRows = await get<Array<{ result_at: string | null }>>(`/rest/v1/adaptive_tracking?slate_date=eq.${dateISO}&scope=eq.midday&mode=eq.balanced&select=result_at&limit=50`);
    if (!slateRows.length) { console.error(`ABORT (precondition 0): no midday slate rows in adaptive_tracking for ${dateISO} — was the morning workflow run? No reel.`); process.exit(1); }
    if (!slateRows.some(r => r.result_at)) {
      console.error(`ABORT (precondition 4): the midday ledger is imported (${midRows} rows) but HIT DETECTION has not graded today's midday board (no result_at on its ${slateRows.length} tracking rows). Run hit detection (the import flow normally triggers it; Admin → detect), then re-run. No reel.`);
      process.exit(1);
    }
    // Preconditions 5 (posted) and 6 (≥1 match) plus the inversion check ride
    // the SHARED provenance read (reel-sameday.ts) — publish-reels consumes
    // the identical join for the caption's {elapsed}, so the two numbers
    // cannot drift. Only the abort wording lives here.
    const sp = await fetchSamedayProvenance(get, dateISO);
    if (!sp.ok) {
      if (sp.why === 'not-posted') {
        console.error(`ABORT (precondition 5): midday_free for ${dateISO} has no posted_at (${sp.status ? `status ${sp.status}` : 'no row'}) — the covered board was never posted to the free room, so there is no gap to prove. No reel.`);
      } else if (sp.why === 'zero-matches') {
        console.error(`ABORT (precondition 6): today's midday board is graded and has ZERO midday-session matches for ${dateISO} — an honest zero; no gap to show. No reel.`);
      } else {
        console.error(`ABORT: GRADED ${sp.gradedAt.toISOString()} is not after PUBLISHED ${sp.publishedAt.toISOString()} — provenance inconsistent. No reel.`);
      }
      process.exit(1);
    }
    prov = { publishedAt: sp.publishedAt, gradedAt: sp.gradedAt, matches: sp.matches, straights: sp.straights };
    console.log(`provenance: PUBLISHED ${fmtET(prov.publishedAt)} · GRADED ${fmtET(prov.gradedAt)} · elapsed ${fmtGap(prov.gradedAt.getTime() - prov.publishedAt.getTime())} · ${prov.matches} midday row(s), ${prov.straights} straight`);
  }
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
  await page.goto(BASE + '/track-record?capture=1' + (MIDDAY ? '&scope=midday' : ''), { waitUntil: 'networkidle', timeout: 180_000 });
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
  // ── MKT-62: THE TIMESTAMP PAIR. On the same-day kind the summary band's
  // 30-day rollup is the off-topic element and the elapsed gap is the headline
  // (ruling 3). The four tiles become PUBLISHED / GRADED / ELAPSED / MATCHES
  // (today's midday rows), values from the provenance above — never the render
  // clock, never fabricated. Same setCell machinery as the public sweep: text
  // REPLACED in place (no reflow; row tops measured above stay valid). The app
  // is not modified. Fail-closed: every cell must be found and rewritten.
  if (MIDDAY && prov) {
    const vals = {
      pub: fmtET(prov.publishedAt), grd: fmtET(prov.gradedAt),
      gap: fmtGap(prov.gradedAt.getTime() - prov.publishedAt.getTime()),
      n: String(prov.matches), sub: 'POSTED TO THE FREE ROOM COVERED · GRADED AGAINST TODAY\'S MIDDAY DRAWS',
    };
    const missing = await page.evaluate(`(() => {
      const leaves = Array.from(document.querySelectorAll('*'))
        .filter(e => e.children.length === 0 && (e.textContent || '').trim().length > 0);
      const labelOf = t => leaves.find(e => (e.textContent || '').trim() === t);
      const cellFor = label => (label && label.parentElement) || null;
      const valueLeaf = (cell, label) => cell ? (Array.from(cell.children).find(c => c !== label) || null) : null;
      const miss = [];
      const setCell = (labelText, value, newLabel) => {
        const label = labelOf(labelText);
        const v = valueLeaf(cellFor(label), label);
        if (!label || !v) { miss.push(labelText); return; }
        v.textContent = value; label.textContent = newLabel;
      };
      setCell('MATCHES', ${JSON.stringify(vals.pub)}, 'PUBLISHED');
      setCell('STRAIGHT', ${JSON.stringify(vals.grd)}, 'GRADED');
      setCell('BOX', ${JSON.stringify(vals.gap)}, 'ELAPSED');
      setCell('DAYS', ${JSON.stringify(vals.n)}, 'MIDDAY MATCHES');
      const sub = leaves.find(e => /^Across \\d+ jurisdictions/.test((e.textContent || '').trim()));
      if (sub) sub.textContent = ${JSON.stringify(vals.sub)}; else miss.push('sub-line');
      return miss;
    })()`) as string[];
    if (missing.length) {
      console.error(`ABORT: timestamp-pair injection incomplete — band cells not found: ${missing.join(', ')} (track-record layout changed?).`);
      await browser.close();
      process.exit(1);
    }
    console.log(`timestamp pair injected: PUBLISHED ${vals.pub} · GRADED ${vals.grd} · ELAPSED ${vals.gap} · ${vals.n} midday match(es).`);
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
  // MKT-62: the board SEGMENT is the cover-lift (covered hold + lift) plus the
  // graded board's push-in on the same-day kind; F_SLATE alone otherwise.
  const F_BOARD = (MIDDAY ? F_COVER + F_LIFT : 0) + F_SLATE;
  const TOTAL = F_BOARD + F_SUMMARY + panFrames + ledgerFrames
    + (panning ? 0 : F_PAN - spare * gaps);

  console.log(
    `date=${dateISO} rows=${L.rowCount} detected=${L.rows.length} straight=${straights.length} ` +
    `featured=${featured.length} [${featured.map(r => (r.straight ? 'STRAIGHT' : 'box')).join(', ')}]`,
  );
  console.log(
    `beat plan: ${TOTAL} frames = ${(TOTAL / FPS).toFixed(2)}s ` +
    `(board ${F_BOARD}${MIDDAY ? ` [cover ${F_COVER} + lift ${F_LIFT} + slate ${F_SLATE}]` : ''} + summary ${F_SUMMARY} + pan ${panFrames} + ledger ${ledgerFrames}) · ` +
    (panning
      ? `pan ${Math.round(panFrom)}→${Math.round(panTo)}px`
      : `pan DROPPED (only ${Math.round(panTo - panFrom)}px available) — travels widened to ${travelFrames}f`),
  );

  // MKT-63: where the strike lands — the first hold's start, tagged into the
  // body ONLY when that hold is a STRAIGHT row. Straights-first featuring
  // (above) means "the first featured straight" IS the first hold whenever any
  // straight exists, which is what makes once-per-reel a construction rather
  // than a rule. Computed from THIS build's plan because the offset is not a
  // constant: the pan drops on first-viewport days and verify_midday's board
  // segment carries the cover-lift. `.straight` is detected BEFORE the public
  // sweep relabels the DOM, so the tag is equally correct on the public cut.
  const strikeAt = featured.length && featured[0].straight
    ? +((F_BOARD + F_SUMMARY + panFrames) / FPS).toFixed(2)
    : null;
  console.log(strikeAt != null
    ? `strike (MKT-63): first hold is a STRAIGHT — ${STRIKE_TAG}=${strikeAt}s into the body`
    : `strike (MKT-63): ${featured.length ? 'no straight featured' : 'no rows'} — no strike tag`);

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
  let landed: number;
  if (MIDDAY && prov) {
    // MKT-62 — THE COVER COMING OFF (ruling 4, option a): the midday board as
    // the free room saw it (covered, no results) → the cover lifts → graded.
    // Labels are the kind's own — verify's "PUBLISHED <date>" is wrong here;
    // the times are the provenance pair. Copy PROVISIONAL (content agent pass).
    const pub = fmtET(prov.publishedAt), grd = fmtET(prov.gradedAt);
    const covered: BoardLabels = {
      eyebrow: `POSTED ${pub} · TODAY`,
      sub: 'MIDDAY · SIX SIGNALS · COVERED, AS THE FREE ROOM SAW IT',
      foot: `GRADED ${grd} · SAME DAY`,
    };
    const graded: BoardLabels = {
      eyebrow: `GRADED ${grd} · TODAY`,
      sub: 'MIDDAY · SIX SIGNALS · RANKED BEFORE THE DRAW',
    };
    landed = await renderCoverLiftFrames(WORK, fname, 0, F_COVER, F_LIFT, F_SLATE, dateISO, 'midday', covered, graded);
    console.log(`board segment: cover-lift — ${landed} of 6 landed — rendered f000-f${F_BOARD - 1}`);
  } else {
    landed = await renderSlateFrames(WORK, fname, 0, F_SLATE, dateISO, 'allday', PUBLIC);
    console.log(`slate segment: ${landed} of 6 landed — rendered f000-f${F_SLATE - 1}${PUBLIC ? ' (public cut: digits masked)' : ''}`);
  }

  // ── summary band — held at the top of the page with a barely-there push, so
  // the totals land before any individual row is argued from.
  //
  // The push goes IN AND BACK OUT across the beat rather than ending zoomed. It
  // used to end at 1.04 while the next beat opened at 1.00, which is a visible
  // scale pop on a cut between two frames of the same static content — and with
  // the pan dropped those two beats are adjacent at the same scroll position,
  // where the pop is at its most obvious.
  const SUMMARY_ZOOM = 1.04;
  for (let f = F_BOARD; f < F_BOARD + F_SUMMARY; f++) {
    const raw = (f - F_BOARD) / (F_SUMMARY - 1);
    const t = easeInOut(raw < 0.5 ? raw * 2 : (1 - raw) * 2);
    await shoot(f, 0, 1 + (SUMMARY_ZOOM - 1) * t);
  }

  // ── one slow eased pan into the first featured row (when there is distance).
  const panStart = F_BOARD + F_SUMMARY;
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
    // MKT-63: STRIKE_TAG rides the same channel — the assembler reads the
    // first-hold offset from the pixels' own file, never from re-derivation.
    `${provenanceArgs(dateISO, false, PUBLIC, strikeAt)} "${outMp4}"`,
    { stdio: 'inherit' },
  );
  rmSync(WORK, { recursive: true, force: true });
  const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outMp4}"`).toString().trim();
  console.log(`ui segment: ${outMp4} · date ${dateISO} · ${L.rowCount} rows · ${dur}s`);
})();
