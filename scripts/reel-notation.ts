// MKT-56b (2026-08-16) — member-legibility layer for the FULL-FIDELITY body.
//
// Members write the six picks down off the reel's 10.0s slate still (MKT-56).
// This module makes that frame easier to copy from, WITHOUT touching the app:
// it is Playwright DOM injection, the same technique as reel-redact.ts, so
// there is no code path a real subscriber can reach and nothing to keep in
// sync with the consumer UI.
//
//   1. EMBOSS — every grid tile's digit row is scaled ~1.3× into the tile's
//      empty middle (transform only: NO reflow, tile geometry and the rig's
//      click targets are untouched) and given a dark drop-shadow + soft glow,
//      so the digits survive platform re-compression.
//   2. NOTATION STRIP — a band over the Signals/Matches/More tab row (top of
//      the frame, MKT-56c; was the bottom tab bar) listing the six
//      combinations in rank order (#1…#6), large monospace, one line to copy.
//      Digits are read back FROM THE RENDERED GRID (the same digit-row shapes
//      reel-redact.ts detects: one "6 8 1" leaf, or 3 single-digit sibling
//      leaves), so the strip can never disagree with the tiles above it.
//   3. HOLD TIMER — an ffmpeg drawbox along the bottom edge that drains over
//      the still's hold, so a member can see how long the frame lasts. Applied
//      by the renderer at encode time (`notationTimerFilter`).
//
// ⚠ FULL-FIDELITY ONLY. The renderer must NOT install this under --redact or
// --redact --relabel: those cuts exist precisely because the digits are not
// shown, and a strip that re-lists them would defeat the mask. The renderer
// gates on !REDACT; this module also refuses if it finds any masked leaf.
//
// Vocabulary on the strip is member-tier safe ("SIGNALS", "RANK ORDER") —
// no "picks", no match-status words — so it needs no relabel pass.
import type { Page } from 'playwright';

export const NOTATION_ID = 'hm-notation-strip';

/** Install emboss + strip. Returns the six combos read from the grid, rank order. */
export async function installNotation(page: Page, scopeLabel: string): Promise<string[]> {
  // Passed as a STRING (see reel-redact.ts: tsx's `__name` helper does not
  // exist in the page context, so a real function literal dies there).
  const src = String.raw`(() => {
    const ID = ${JSON.stringify(NOTATION_ID)};
    const LABEL = ${JSON.stringify(scopeLabel)};
    const leaves = Array.from(document.querySelectorAll('*')).filter(e => !e.children.length);
    if (leaves.some(e => (e.textContent || '').trim() === '•••')) return [];   // masked capture — refuse
    // A tile's digit row is EITHER one leaf "6 8 1" (digits + separators —
    // what the grid renders) OR a sibling group of 3 single-digit leaves (the
    // modal hero form). Handle both. Entry: { el: element to emboss, kids, digits }.
    const rows = [];
    const seen = new Set();
    for (const l of leaves) {
      const t = (l.textContent || '').trim();
      if (/^\d[\s\-·.]+\d[\s\-·.]+\d$/.test(t) && l.getBoundingClientRect().height > 20) {
        rows.push({ el: l, kids: [l], digits: t.match(/\d/g) }); continue;
      }
      const p = l.parentElement; if (!p || seen.has(p)) continue;
      const kids = Array.from(p.children);
      if (kids.length === 3 && kids.every(k => !k.children.length && /^\d$/.test((k.textContent || '').trim()))) {
        seen.add(p); rows.push({ el: p, kids, digits: kids.map(k => (k.textContent || '').trim()) });
      }
    }
    // Rank order = visual order: top-to-bottom, then left-to-right.
    rows.sort((a, b) => {
      const ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
      return Math.abs(ra.top - rb.top) > 40 ? ra.top - rb.top : ra.left - rb.left;
    });
    const combos = rows.map(r => r.digits.join(''));
    if (combos.length !== 6) return combos;
    // 1. EMBOSS — transform only, no reflow.
    const font = getComputedStyle(rows[0].kids[0]).fontFamily;
    for (const r of rows) {
      r.el.style.transformOrigin = 'left top';
      r.el.style.transform = 'scale(1.3)';
      for (const k of r.kids) {
        k.style.textShadow = '0 2px 0 rgba(0,0,0,0.85), 0 3px 8px rgba(0,0,0,0.7), 0 0 14px rgba(255,80,60,0.45)';
      }
      // The tile's box-set label "{1,6,8}" sits right under the digits; the
      // 1.3× row would crowd it. Nudge it down into the tile's empty middle
      // (transform only — nothing reflows).
      const card = r.el.parentElement;
      if (card) {
        const set = Array.from(card.querySelectorAll('*')).find(e => !e.children.length && /^\{\d,\d,\d\}$/.test((e.textContent || '').trim()));
        if (set) set.style.transform = 'translateY(14px)';
      }
    }
    // 2. NOTATION STRIP over the tab bar.
    const strip = document.createElement('div');
    strip.id = ID;
    strip.setAttribute('aria-hidden', 'true');
    // MKT-56c: the band sits OVER the Signals/Matches/More tab row (CSS y
    // ~131–197 — between the scope tabs and the tile tops), not over the
    // bottom tab bar: operator ruling from the 8/16 smoke test — the picks
    // list belongs at the top of the frame, read before the tiles.
    strip.style.cssText = 'position:fixed;left:0;right:0;top:131px;height:66px;z-index:2147483647;' +
      'background:#0a0714;' +
      'border-top:1px solid rgba(255,255,255,0.16);border-bottom:1px solid rgba(255,255,255,0.16);box-sizing:border-box;padding:6px 14px 5px;' +
      'font-family:' + font + ';color:#fff;display:flex;flex-direction:column;justify-content:center;';
    const head = document.createElement('div');
    head.textContent = LABEL.toUpperCase() + ' · 6 SIGNALS · RANK ORDER';
    head.style.cssText = 'font-size:9px;letter-spacing:1.6px;color:rgba(255,255,255,0.62);text-align:center;margin-bottom:3px;line-height:1;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;';
    combos.forEach((c, i) => {
      const cell = document.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;white-space:nowrap;';
      const rank = document.createElement('div');
      rank.textContent = '#' + (i + 1);
      rank.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.55);letter-spacing:0.5px;line-height:1;margin-bottom:2px;';
      const dig = document.createElement('div');
      dig.textContent = c;
      dig.style.cssText = 'font-size:29px;font-weight:800;letter-spacing:5px;margin-right:-5px;line-height:1;color:#ffffff;white-space:nowrap;' +
        'text-shadow:0 2px 0 rgba(0,0,0,0.9),0 0 10px rgba(255,255,255,0.18);';
      cell.appendChild(rank); cell.appendChild(dig); row.appendChild(cell);
    });
    strip.appendChild(head); strip.appendChild(row);
    document.body.appendChild(strip);
    return combos;
  })()`;
  const combos: string[] = await page.evaluate(src);
  return combos;
}

/** Remove the strip (the emboss stays on the grid, which is off-screen under the modals anyway). */
export async function removeNotation(page: Page): Promise<void> {
  await page.evaluate(`(() => { const s = document.getElementById(${JSON.stringify(NOTATION_ID)}); if (s) s.remove(); })()`);
}

/**
 * ffmpeg -filter_complex: a white bar along the bottom edge that drains from
 * full width to zero across the first `holdSec` seconds of the body, then
 * disappears. Built as a colour source slid left by overlay's time-aware `x`
 * (drawbox's `t` is THICKNESS, not time — it cannot animate). Input label is
 * `[0:v]`; output label is `[v]` — the caller maps it.
 */
export function notationTimerFilter(holdSec: number, fps: number, frameW = 1080, frameH = 1920): string {
  const h = 6;
  return `color=c=white@0.75:s=${frameW}x${h}:r=${fps}[bar];` +
    `[0:v][bar]overlay=x='-W*t/${holdSec}':y=${frameH - h}:enable='lt(t,${holdSec})':shortest=1,format=yuv420p[v]`;
}
