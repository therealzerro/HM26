// MKT-25 option 2 — the "before" half of the receipts reel.
//
// Draws yesterday's PUBLISHED board as a composited segment: the six picks
// exactly as they went out, with the ones that landed marked and their actual
// result shown. The verify reel then cuts from this to the ledger, so it reads
// as "here is what we said" → "here is what happened".
//
// WHY THIS IS COMPOSITED RATHER THAN CAPTURED. The app cannot show a past slate:
// `useSnapshot()` returns the current one and `explore.tsx` queries
// `slate_date=eq.${todayStr}`, hardcoded. Capturing yesterday's board would mean
// changing a consumer data path, which this lane does not do. Drawing it from
// `slate_snapshots` sidesteps that entirely — and the snapshot IS the record of
// what was published, which is the more honest source for a receipts reel
// anyway.
//
// ⚠ TWO SOURCES, CROSS-CHECKED, AND A DISAGREEMENT IS FATAL. Per-pick match
// status comes from the snapshot's own `hitType`/`hitResult` fields; the ledger
// segment that follows is rendered from `adaptive_tracking`. If those two ever
// disagree the reel would contradict itself ON SCREEN — the single worst failure
// available to an asset whose entire purpose is to be checkable. So the matched
// COMBO SET is verified against `adaptive_tracking` before a frame is drawn, and
// a mismatch aborts. Verified for 2026-07-28: snapshot {425,758,681} ==
// adaptive_tracking {425,758,681}. The row COUNTS differ (6 rows vs 3 picks)
// and that is expected, not a disagreement — one pick can match in several
// states, and the ledger lists each.
import { chromium } from 'playwright';
import { config as loadEnv } from 'dotenv';
import { writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

loadEnv({ path: resolve('.env'), quiet: true });
const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export interface SlatePick {
  rank: number; combo: string; bestOrder?: string; comboSet?: string; energy?: number;
  hitType?: string; hitState?: string; hitResult?: string; hitSession?: string;
}

async function rest<T>(path: string): Promise<T> {
  if (!URL_BASE || !KEY) throw new Error('EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not set');
  const r = await fetch(`${URL_BASE}${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

/** Yesterday's published board plus the cross-check. Throws on disagreement. */
export async function loadSlate(dateISO: string, scope = 'allday'): Promise<SlatePick[]> {
  const snaps = await rest<Array<{ top_k_straights_json: SlatePick[] }>>(
    `/rest/v1/slate_snapshots?slate_date=eq.${dateISO}&scope=eq.${scope}&deleted_at=is.null` +
    `&select=top_k_straights_json&order=updated_at_et.desc&limit=1`,
  );
  const picks = snaps[0]?.top_k_straights_json ?? [];
  if (!picks.length) throw new Error(`no published slate for ${dateISO} / ${scope}`);

  const at = await rest<Array<{ combo: string; hit_straight: boolean }>>(
    `/rest/v1/adaptive_tracking?slate_date=eq.${dateISO}&scope=eq.${scope}&mode=eq.balanced` +
    `&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo,hit_straight&limit=200`,
  );
  const fromLedger = new Set(at.map(r => r.combo));
  const fromSnapshot = new Set(picks.filter(p => p.hitType).map(p => p.combo));
  const only = (a: Set<string>, b: Set<string>) => [...a].filter(x => !b.has(x));
  const missA = only(fromSnapshot, fromLedger), missB = only(fromLedger, fromSnapshot);
  if (missA.length || missB.length) {
    throw new Error(
      `ABORT: the slate snapshot and adaptive_tracking DISAGREE on which picks matched for ${dateISO}/${scope}.\n` +
      `       snapshot-only: ${missA.join(', ') || 'none'} · ledger-only: ${missB.join(', ') || 'none'}\n` +
      `       A receipts reel must not contradict its own ledger on screen. Fix the data, do not render.`,
    );
  }

  // MKT-35: the cross-check must agree on the match TYPE, not just the set.
  // The board renders straights gold and the ledger segment renders them
  // "⭐ STRAIGHT" from adaptive_tracking — a type disagreement puts two
  // different claims about the same pick on screen in one reel. A combo
  // counts as straight in the ledger if ANY of its state rows is straight
  // (the snapshot's hitType is the straight-preferred primary).
  const straightInLedger = new Set(at.filter(r => r.hit_straight).map(r => r.combo));
  for (const p of picks) {
    if (!p.hitType) continue;
    const ledgerStraight = straightInLedger.has(p.combo);
    const snapStraight = p.hitType === 'straight';
    if (ledgerStraight !== snapStraight) {
      throw new Error(
        `ABORT: match TYPE disagreement for ${p.combo} (${dateISO}/${scope}): ` +
        `snapshot says ${p.hitType}, adaptive_tracking says ${ledgerStraight ? 'straight' : 'box'}. ` +
        `Fix the data, do not render.`,
      );
    }
  }

  // MKT-35 fail-closed assert: a pick whose POSTED permutation (bestOrder is
  // what every consumer surface displays; combo is the engine enumeration
  // index) equals the draw MUST carry the straight annotation, and a straight
  // annotation MUST mean posted == drawn. This is the claim the reel makes —
  // "matches marked" — and the one thing a viewer can check frame by frame.
  for (const p of picks) {
    if (!p.hitType || !p.hitResult) continue;
    const posted = p.bestOrder ?? p.combo;
    if (posted === p.hitResult && p.hitType !== 'straight') {
      throw new Error(
        `ABORT: posted ${posted} equals draw ${p.hitResult} but hitType is '${p.hitType}' ` +
        `(rank ${p.rank}, ${dateISO}/${scope}). A posted-exact match must render STRAIGHT. Fix the data, do not render.`,
      );
    }
    if (p.hitType === 'straight' && posted !== p.hitResult) {
      throw new Error(
        `ABORT: hitType 'straight' but posted ${posted} != draw ${p.hitResult} ` +
        `(rank ${p.rank}, ${dateISO}/${scope}). The straight claim must be checkable on screen. Fix the data, do not render.`,
      );
    }
  }

  return picks.sort((a, b) => a.rank - b.rank);
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * MKT-62 — per-board copy overrides for the same-day midday verify. The
 * default board (verify) reads PUBLISHED <date> / SIX SIGNALS · RANKED BEFORE
 * THE DRAW / N OF 6 LANDED · RECEIPTS BELOW. The midday kind supplies its own
 * eyebrow/sub/foot per layer (covered vs graded) — copy is PROVISIONAL pending
 * the content agent's pass (work order item 11).
 */
export interface BoardLabels { eyebrow?: string; sub?: string; foot?: string }

/** MKT-62 cover-lift beat, in frames at 60fps: covered hold + the lift. Both
 *  the renderer (frame plan) and the assembler (ribbon per-segment placement
 *  — the board segment is longer on this kind) read these, so they cannot
 *  drift apart. */
export const F_COVER = 120;   // 2.00s — the board as the free room saw it, static
export const F_LIFT = 30;     // 0.50s — the cover comes off (eased opacity)
export const COVER_LIFT_SECONDS = (F_COVER + F_LIFT) / 60;

/**
 * `covered` (MKT-62): the board AS POSTED to the free room — digits and set
 * masked, NO result column (the draw has not happened in this frame), the
 * cover the member scrolled past this morning. Distinct from `publicCut`,
 * which masks a GRADED board for a tier-1 surface. Only one may be set.
 */
function html(picks: SlatePick[], dateISO: string, publicCut = false, covered = false, labels: BoardLabels = {}, layerId = ''): string {
  if (publicCut && covered) throw new Error('html(): publicCut and covered are mutually exclusive');
  const d = new Date(dateISO + 'T12:00:00Z');
  const when = `${DAYS[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const FONT = resolve('node_modules/@expo-google-fonts/jetbrains-mono');
  const landed = picks.filter(p => p.hitType).length;
  const rows = picks.map(p => {
    // covered: nothing is graded yet in this frame — no hit styling, no result.
    const hit = !covered && Boolean(p.hitType);
    // MKT-35: straights are the board's strongest proof and must be identified
    // AS straights here, upstream of the ledger's holds — gold, matching the
    // verify identity (MKT-31) and the ledger's ⭐ STRAIGHT. Box stays green.
    const straight = p.hitType === 'straight';
    // MKT-40 public cut: digits NEVER render — placeholder dots upstream (the
    // MKT-30 pattern: a placeholder is a fact, a blur is a judgement). Match
    // vocabulary relabels to the public set (EXACT ORDER, per the shipped
    // BEST ORDER / ANY ORDER slots); state + session attribution drops
    // (tier-1 blocks both). The gold/green treatment survives, which is what
    // keeps the MKT-35 hierarchy readable on the masked cut.
    const digitSrc = (p.bestOrder ?? p.combo).split('');
    const masked = publicCut || covered;
    const digits = digitSrc.map(c => `<i>${masked ? '•' : c}</i>`).join('');
    const setChip = masked ? '{ • • • }' : (p.comboSet ?? '');
    const drewVal = publicCut ? '•••' : (p.hitResult ?? '');
    const drewLab = straight ? (publicCut ? 'DREW · EXACT ORDER' : 'DREW · STRAIGHT') : 'DREW';
    const right = covered
      ? `<div class="res pending"><div class="rlab">COVERED</div></div>`
      : hit
      ? `<div class="res"><div class="rlab">${drewLab}</div><div class="rval">${drewVal}</div>
         ${publicCut ? '' : `<div class="rwhere">${(p.hitState ?? '').toUpperCase()} · ${(p.hitSession ?? '').toUpperCase()}</div>`}</div>`
      : `<div class="res pending"><div class="rlab">NO MATCH</div></div>`;
    return `<div class="row ${hit ? 'hit' : ''}${straight ? ' straight' : ''}">
      <div class="rank">#${p.rank}</div><div class="digits">${digits}</div>
      <div class="set">${setChip}</div>${right}</div>`;
  }).join('');
  return `<!doctype html><html><head><style>
    @font-face{font-family:JBM;src:url('file://${FONT}/700Bold/JetBrainsMono_700Bold.ttf');font-weight:700}
    @font-face{font-family:JBM;src:url('file://${FONT}/500Medium/JetBrainsMono_500Medium.ttf');font-weight:500}
    *{margin:0;padding:0;box-sizing:border-box}
    /* MKT-35 P4: top padding reserves the RIBBON BAND. The assembler moves the
       gold date ribbon to y=100 during this segment (it collided with the #1/#2
       cards at its spec y=470 once MKT-25 put the board first). Ribbon plate
       renders y 100-220, glow to ~281; at the push-in's max scale (1.045,
       origin 42%) content top 328 rises to ~322 — the band y 0-300 stays clear
       of every card, digit and badge through the whole move. Measured, not
       eyeballed; re-measure if the ribbon grows or the push-in changes.

       MKT-14 (2026-07-31): the ribbon GREW — exactly the case the line above
       says to re-measure for. The brand line extends the chip 219px -> 265px,
       so at the board segment's -370 offset it now reaches y327, i.e. 27px INTO
       the first card. Padding 328 -> 375 restores the clearance (content top
       375 rises to ~368 at max scale; 48px clear of the 300 band). Costs ~47px
       of card height across the 6 rows, which .row's flex:1 absorbs evenly.
       Chosen over shifting the assembler's offset to -416: that would have put
       the ribbon top at y16, under the platform top chrome on every short-form
       surface — hiding the brand line is the one outcome MKT-14 cannot accept. */
    body{width:1080px;height:1920px;background:#07080f;font-family:JBM;color:#fff}
    /* MKT-62: the board is a LAYER so a covered and a graded board can stack in
       one page and dissolve by opacity (the cover-lift). The default render has
       exactly one layer — byte-identical layout to the pre-MKT-62 body. */
    .board{position:absolute;inset:0;width:1080px;height:1920px;background:#07080f;
         padding:375px 56px 84px;display:flex;flex-direction:column;gap:30px}
    .hd{display:flex;flex-direction:column;gap:10px;margin-bottom:6px}
    .eyebrow{font-weight:500;font-size:30px;letter-spacing:7px;color:#2bffcc}
    .title{font-weight:700;font-size:62px;letter-spacing:1px}
    .sub{font-weight:500;font-size:27px;color:#8a90a6;letter-spacing:2px}
    .row{display:flex;align-items:center;gap:22px;padding:38px 28px;border-radius:20px;flex:1;
         background:#0e1120;border:1px solid #1d2236}
    .row.hit{background:#0d1a17;border-color:#2bffcc55;box-shadow:0 0 30px #2bffcc18}
    .row.hit.straight{background:#1a150d;border-color:#fbbf2455;box-shadow:0 0 30px #fbbf2418}
    .rank{font-weight:700;font-size:26px;color:#5a6076;width:52px}
    .digits{display:flex;gap:12px}
    .digits i{font-style:normal;font-weight:700;font-size:58px;letter-spacing:1px}
    .row.hit .digits i{color:#2bffcc}
    .row.hit.straight .digits i{color:#fbbf24}
    .row.hit.straight .rlab{color:#fbbf24}
    .set{font-weight:500;font-size:25px;color:#6f7590;flex:1}
    .res{text-align:right;min-width:210px}
    .rlab{font-weight:500;font-size:19px;letter-spacing:4px;color:#2bffcc}
    .rval{font-weight:700;font-size:42px;letter-spacing:5px}
    .rwhere{font-weight:500;font-size:20px;color:#8a90a6;letter-spacing:2px}
    .res.pending .rlab{color:#454b60}
    .foot{margin-top:8px;font-weight:500;font-size:28px;color:#6f7590;letter-spacing:3px;text-align:center}
  </style></head><body>
    <div class="board" ${layerId ? `id="${layerId}"` : ''}>
    <div class="hd"><div class="eyebrow">${labels.eyebrow ?? `PUBLISHED ${when}`}</div>
      <div class="title">THE BOARD WE POSTED</div>
      <div class="sub">${labels.sub ?? 'SIX SIGNALS · RANKED BEFORE THE DRAW'}</div></div>
    ${rows}
    <div class="foot">${labels.foot ?? `${landed} OF ${picks.length} LANDED · RECEIPTS BELOW`}</div>
    </div>
  </body></html>`;
}

/** Split a full page into (head-with-style, board-layer markup). */
function splitPage(page: string): { head: string; board: string } {
  const bodyAt = page.indexOf('<body>');
  const endAt = page.lastIndexOf('</body>');
  return { head: page.slice(0, bodyAt + '<body>'.length), board: page.slice(bodyAt + '<body>'.length, endAt) };
}

/** Render `frames` PNGs of the board with a slow push-in, into `dir`. */
export async function renderSlateFrames(
  dir: string, fname: (i: number) => string, from: number, frames: number, dateISO: string, scope = 'allday',
  publicCut = false, labels: BoardLabels = {},
): Promise<number> {
  const picks = await loadSlate(dateISO, scope);
  const tmp = join(tmpdir(), `verify-slate-${dateISO}-${scope}${publicCut ? '-public' : ''}.html`);
  writeFileSync(tmp, html(picks, dateISO, publicCut, false, labels));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts.ready);
  const ok = await page.evaluate(() => (document as any).fonts.check('700 62px JBM'));
  if (!ok) { await browser.close(); throw new Error('JetBrains Mono failed to load — the board would render in a fallback face.'); }
  // Very slow push-in: this segment is read, not watched, so the motion is only
  // there to stop it reading as a still frame.
  const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;
  for (let i = 0; i < frames; i++) {
    const k = 1 + 0.045 * ease(i / Math.max(1, frames - 1));
    await page.evaluate(s => { document.body.style.transform = `scale(${s})`; document.body.style.transformOrigin = '50% 42%'; }, k);
    await page.screenshot({ path: fname(from + i) });
  }
  await browser.close();
  rmSync(tmp, { force: true });
  return picks.filter(p => p.hitType).length;
}

/**
 * MKT-62 — THE COVER COMING OFF. The body opens on the board AS THE FREE ROOM
 * SAW IT this morning (digits covered, no results), holds `coverFrames`, then
 * the cover LIFTS over `liftFrames` (opacity cross-dissolve, eased) into the
 * GRADED board, which then runs its normal slow push-in for `slateFrames`.
 *
 * One Playwright page, two stacked `.board` layers — the dissolve is a CSS
 * opacity on the top layer, so both boards are pixel-registered (same layout,
 * same rows, same rank order) and nothing moves but the cover. Option (a) of
 * the Phase 0 report, ruled in 2026-08-19: proven masking machinery, no second
 * browser session, no cross-layout dissolve.
 *
 * Returns the landed count (same contract as renderSlateFrames).
 */
export async function renderCoverLiftFrames(
  dir: string, fname: (i: number) => string, from: number,
  coverFrames: number, liftFrames: number, slateFrames: number,
  dateISO: string, scope: string, coveredLabels: BoardLabels, gradedLabels: BoardLabels,
): Promise<number> {
  const picks = await loadSlate(dateISO, scope);
  const graded = splitPage(html(picks, dateISO, false, false, gradedLabels, 'graded'));
  const covered = splitPage(html(picks, dateISO, false, true, coveredLabels, 'cover'));
  const page_ = `${graded.head}${graded.board}${covered.board}</body></html>`;
  const tmp = join(tmpdir(), `verify-slate-${dateISO}-${scope}-coverlift.html`);
  writeFileSync(tmp, page_);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => (document as any).fonts.ready);
  const ok = await page.evaluate(() => (document as any).fonts.check('700 62px JBM'));
  if (!ok) { await browser.close(); throw new Error('JetBrains Mono failed to load — the board would render in a fallback face.'); }
  // Fail-closed: the cover layer must carry NO digit run and NO result — the
  // whole beat is that the free room saw nothing graded this morning.
  const leak = await page.evaluate(() => {
    const el = document.getElementById('cover'); if (!el) return ['no cover layer'];
    const bad: string[] = [];
    for (const n of Array.from(el.querySelectorAll('*')) as HTMLElement[]) {
      if (n.children.length) continue;
      const t = (n.textContent ?? '').trim();
      if (/^\d{3}$/.test(t) || /^\d$/.test(t)) bad.push('digit: ' + t);
      if (/DREW|STRAIGHT|LANDED/.test(t)) bad.push('result: ' + t);
    }
    return bad;
  });
  if (leak.length) { await browser.close(); throw new Error(`ABORT: covered board leaks graded content — ${leak.slice(0, 6).join(' · ')}`); }
  const ease = (t: number) => (1 - Math.cos(Math.PI * Math.min(Math.max(t, 0), 1))) / 2;
  const setState = (coverOpacity: number, k: number) => page.evaluate(({ o, k }) => {
    const c = document.getElementById('cover') as HTMLElement; c.style.opacity = String(o);
    for (const id of ['cover', 'graded']) {
      const b = document.getElementById(id) as HTMLElement;
      b.style.transform = `scale(${k})`; b.style.transformOrigin = '50% 42%';
    }
  }, { o: coverOpacity, k });
  let f = from;
  // 1. covered hold — static (this is a remembered frame, not a reveal).
  await setState(1, 1);
  await page.screenshot({ path: fname(f) });
  for (let i = 1; i < coverFrames; i++) { copyFileSync(fname(from), fname(from + i)); }
  f = from + coverFrames;
  // 2. the lift — eased opacity 1→0 on the cover, both layers at k=1.
  for (let i = 0; i < liftFrames; i++) {
    await setState(1 - ease((i + 1) / liftFrames), 1);
    await page.screenshot({ path: fname(f + i) });
  }
  f += liftFrames;
  // 3. graded board — the standard slow push-in (identical to renderSlateFrames).
  for (let i = 0; i < slateFrames; i++) {
    const k = 1 + 0.045 * ease(i / Math.max(1, slateFrames - 1));
    await setState(0, k);
    await page.screenshot({ path: fname(f + i) });
  }
  await browser.close();
  rmSync(tmp, { force: true });
  return picks.filter(p => p.hitType).length;
}
