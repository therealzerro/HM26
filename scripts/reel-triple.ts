// MKT-88 (2026-10-16) — TRIPLE BOARD SIGNAL ON THE SLATE REELS: the DOM half.
//
// Same technique as reel-notation.ts / reel-redact.ts: Playwright DOM
// injection on the captured coffee Home, so the app is untouched and no
// subscriber can reach a code path. Three marks, one condition (the day has a
// triple — see scripts/reel-triple-core.ts for the law and the palette):
//
//   1. THE TILE BURNS — the triple's grid tile gets an ember ring, a white-hot
//      inner stroke, four CSS flame tongues licking over its top edge and a
//      rotated "ALL 3 BOARDS" plate. Transform/overlay only: no reflow, the
//      rig's click targets (read from the "#N" leaves) are untouched.
//   2. THE BAND — in the black space between the date chip and the notation
//      strip (CSS y 600–760 on the 540×960 capture; the chip ends at 590, the
//      strip starts at 765), a plate reads "TRIPLE BOARD SIGNAL" in ember over
//      "5-7-3 · ONE EXACT ORDER ON ALL THREE BOARDS" in white, flames along
//      its top edge.
//   3. THE MODAL PLATE — when the triple's own modal opens, an ember plate
//      lands over the "Generated" row + the INTEL/PAIRS/ACTION tab strip
//      (chrome, never data: rank, digits, energy, box set all stay visible).
//
// FLICKER: `setFirePhase(page, n)` moves every flame to one of FIRE_PHASES
// states; the renderer screenshots each phase and cycles the hold's frames
// through them (firePhaseAt). A still that flickers is the cheapest fire
// there is — no per-frame capture, no video asset.
//
// ⚠ FULL-FIDELITY ONLY. Never under --redact / --redact --relabel: the band
// carries the digits, and the public cut's vocabulary is tier 1. The renderer
// gates on !REDACT, this module refuses on a masked leaf, and the body tag
// (hm_triple) is written beside the date tag so the assembler can say so.
import type { Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIRE, FIRE_PHASES, TRIPLE_FIRE_COPY, tripleForScope, tripleKey, NO_TRIPLE, type TripleForScope } from './reel-triple-core';
import type { ResolveScope } from '../lib/social/briefResolve';

export const FIRE_ID = 'hm-triple-fire';

/** The day's triples + this scope's ranks, from the three live boards. */
export async function fetchTriple(dateISO: string, scope: ResolveScope): Promise<TripleForScope> {
  const env = readFileSync(resolve('.env'), 'utf8');
  const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(\S+)/)?.[1];
  const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(\S+)/)?.[1];
  if (!url || !key) return NO_TRIPLE;
  const res = await fetch(
    `${url}/rest/v1/slate_snapshots?select=scope,updated_at_et,top_k_straights_json&slate_date=eq.${dateISO}&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=updated_at_et.desc&limit=60`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) return NO_TRIPLE;
  const rows: any[] = await res.json();
  const raw: Partial<Record<ResolveScope, unknown>> = {};
  for (const r of rows ?? []) {
    const sc = r.scope as ResolveScope;
    if ((sc === 'midday' || sc === 'evening' || sc === 'allday') && raw[sc] === undefined) raw[sc] = r.top_k_straights_json;
  }
  return tripleForScope(raw, scope);
}

const STYLE = String.raw`
  @keyframes hm-none { from { opacity: 1 } to { opacity: 1 } }
  .hm-flame { position:absolute; pointer-events:none; width:18px; height:26px; border-radius:50% 50% 50% 50% / 62% 62% 38% 38%;
    transform-origin: 50% 100%; background: radial-gradient(ellipse at 50% 85%, ${FIRE.core} 0%, ${FIRE.hot} 28%, ${FIRE.ember} 62%, ${FIRE.deep} 100%);
    filter: blur(0.4px); opacity: .95; box-shadow: 0 0 10px ${FIRE.ember}cc, 0 0 22px ${FIRE.hot}66; }
  .hm-flame::after { content:''; position:absolute; left:35%; top:40%; width:30%; height:50%; border-radius:inherit;
    background: radial-gradient(ellipse at 50% 90%, ${FIRE.core} 0%, ${FIRE.tip}aa 70%, transparent 100%); }
  .hm-ring { position:absolute; inset:-3px; border-radius:18px; pointer-events:none; border:3px solid ${FIRE.ember};
    box-shadow: inset 0 0 0 2px ${FIRE.core}cc, inset 0 0 18px ${FIRE.ember}99, 0 0 14px ${FIRE.ember}, 0 0 34px ${FIRE.hot}99, 0 0 70px ${FIRE.ember}55; }
  .hm-plate { position:absolute; pointer-events:none; left:50%; top:-9px; transform: translateX(-50%) rotate(-6deg); white-space:nowrap;
    padding:3px 9px; border-radius:6px; background:${FIRE.plate}; border:2px solid ${FIRE.hot}; color:${FIRE.core};
    font-weight:900; font-size:9px; letter-spacing:1.6px; text-shadow: 0 0 8px ${FIRE.hot}; box-shadow: 0 0 12px ${FIRE.ember}aa; }
  /* phases: tongue height / lean / ring breath */
  [data-hm-fire="0"] .hm-flame { transform: scaleY(1.00) rotate(-4deg); }
  [data-hm-fire="1"] .hm-flame { transform: scaleY(1.14) rotate(5deg); opacity:1; }
  [data-hm-fire="2"] .hm-flame { transform: scaleY(0.84) rotate(-9deg); opacity:.88; }
  [data-hm-fire="3"] .hm-flame { transform: scaleY(1.20) rotate(2deg); }
  [data-hm-fire="1"] .hm-flame:nth-child(even) { transform: scaleY(0.90) rotate(-6deg); }
  [data-hm-fire="3"] .hm-flame:nth-child(even) { transform: scaleY(1.06) rotate(8deg); }
  [data-hm-fire="2"] .hm-flame:nth-child(3n) { transform: scaleY(1.16) rotate(6deg); opacity:1; }
  [data-hm-fire="1"] .hm-ring { box-shadow: inset 0 0 0 2px ${FIRE.core}cc, inset 0 0 24px ${FIRE.ember}bb, 0 0 20px ${FIRE.ember}, 0 0 48px ${FIRE.hot}bb, 0 0 90px ${FIRE.ember}66; }
  [data-hm-fire="2"] .hm-ring { box-shadow: inset 0 0 0 2px ${FIRE.core}99, inset 0 0 14px ${FIRE.ember}77, 0 0 10px ${FIRE.ember}, 0 0 26px ${FIRE.hot}77, 0 0 54px ${FIRE.ember}44; }
  [data-hm-fire="3"] .hm-ring { box-shadow: inset 0 0 0 2px ${FIRE.core}dd, inset 0 0 28px ${FIRE.ember}cc, 0 0 24px ${FIRE.ember}, 0 0 60px ${FIRE.hot}cc, 0 0 110px ${FIRE.ember}77; }
  [data-hm-fire="1"] .hm-band-title { text-shadow: 0 0 10px ${FIRE.ember}, 0 0 28px ${FIRE.hot}, 0 0 50px ${FIRE.ember}99; }
  [data-hm-fire="3"] .hm-band-title { text-shadow: 0 0 14px ${FIRE.ember}, 0 0 36px ${FIRE.hot}, 0 0 70px ${FIRE.ember}aa; }
`;

/**
 * Burn the triple tile(s) on the grid + add the band. Returns the ranks the
 * DOM layer found (1-based, visual order) — the renderer asserts they equal
 * the DB's ranks, so the pixels and the data cannot disagree.
 */
export interface TripleFireOpts {
  /** RING-ONLY TEASE (operator, 2026-10-16) for the REDACTED free session cuts:
   *  the tile is found by RANK (its digits are masked), gets the ring + flames
   *  + the digit-free plate, and NO band is added — the fact is shown, the
   *  digits stay on the Pro side. */
  ring?: boolean;
  ranks?: number[];
}

export async function installTripleFire(page: Page, triples: { digits: string }[], opts: TripleFireOpts = {}): Promise<number[]> {
  const keys = triples.map(t => tripleKey(t.digits));
  const RING = !!opts.ring;
  const RANKS = opts.ranks ?? [];
  const src = String.raw`(() => {
    const ID = ${JSON.stringify(FIRE_ID)};
    const KEYS = ${JSON.stringify(keys)};
    const RING = ${JSON.stringify(RING)};
    const RANKS = ${JSON.stringify(RANKS)};
    const COPY = ${JSON.stringify(TRIPLE_FIRE_COPY)};
    const DIGITS = ${JSON.stringify(triples.map(t => t.digits).join('  ·  '))};
    const leaves = Array.from(document.querySelectorAll('*')).filter(e => !e.children.length);
    const masked = leaves.some(e => (e.textContent || '').trim() === '•••');
    if (masked && !RING) return { ranks: [], masked: true };
    if (RING && !masked) return { ranks: [], unmasked: true };
    if (document.getElementById(ID)) return { ranks: [], dup: true };
    const style = document.createElement('style'); style.id = ID + '-style'; style.textContent = ${JSON.stringify(STYLE)};
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-hm-fire', '0');
    // Rank tiles: the "#N" leaf's parent is the tappable tile (MKT-57 rig law).
    const tiles = leaves.filter(e => /^#[1-6]$/.test((e.textContent || '').trim()))
      .map(e => ({ rank: Number((e.textContent || '').trim().slice(1)), card: e.parentElement }))
      .sort((a, b) => a.rank - b.rank);
    const ranks = [];
    const font = tiles[0] && tiles[0].card ? getComputedStyle(tiles[0].card.querySelector('*') || tiles[0].card).fontFamily : 'monospace';
    // Tongues sit with their BOTTOM sink px below the host's top border and
    // rise (h − sink) above it; phases scale from the bottom, so the rise is
    // bounded by hMax·1.2 − sink. Tile lane: 22px of clearance to the tile
    // above's ENERGY line (8px row gap + 14px padding) → hMin 11, hMax 16,
    // sink 3 → ≤ 16px. Band / modal lanes have open space and take bigger ones.
    const addFlames = (host, n, hMin, hMax, sink) => {
      for (let i = 0; i < n; i++) {
        const f = document.createElement('div'); f.className = 'hm-flame';
        const t = n === 1 ? 0.5 : i / (n - 1);
        const h = hMin + ((i * 7) % (hMax - hMin + 1));
        f.style.left = 'calc(' + (8 + t * 84).toFixed(1) + '% - 8px)';
        f.style.width = (11 + ((i * 5) % 7)) + 'px';
        f.style.height = h + 'px';
        f.style.top = (sink - h) + 'px';
        host.appendChild(f);
      }
    };
    for (const t of tiles) {
      if (!t.card) continue;
      if (RING) {
        if (!RANKS.includes(t.rank)) continue;
      } else {
        const under = Array.from(t.card.querySelectorAll('*')).filter(e => !e.children.length);
        const row = under.find(e => /^\d[\s\-·.]+\d[\s\-·.]+\d$/.test((e.textContent || '').trim()));
        const key = row ? (row.textContent || '').replace(/\D/g, '') : '';
        if (!key || !KEYS.includes(key)) continue;
      }
      ranks.push(t.rank);
      t.card.style.overflow = 'visible';
      t.card.style.position = t.card.style.position || 'relative';
      t.card.style.zIndex = '5';
      const ring = document.createElement('div'); ring.className = 'hm-ring'; t.card.appendChild(ring);
      addFlames(t.card, 9, 12, 17, 3);
      const plate = document.createElement('div'); plate.className = 'hm-plate'; plate.textContent = COPY.tileBadge;
      plate.style.fontFamily = font; plate.style.top = '-11px';
      t.card.appendChild(plate);
    }
    if (!ranks.length) { style.remove(); document.documentElement.removeAttribute('data-hm-fire'); return { ranks: [] }; }
    if (RING) return { ranks };   // ring-only: no band, no digits anywhere
    // THE BAND — black space between the chip (ends CSS 590) and the strip (765).
    const band = document.createElement('div');
    band.id = ID; band.setAttribute('aria-hidden', 'true');
    band.style.cssText = 'position:fixed;left:16px;right:16px;top:612px;height:120px;z-index:2147483646;' +
      'background:' + ${JSON.stringify(FIRE.plate)} + ';border-radius:18px;box-sizing:border-box;padding:14px 16px 12px;' +
      'border:2px solid ' + ${JSON.stringify(FIRE.ember)} + ';box-shadow:0 0 18px ' + ${JSON.stringify(FIRE.ember)} + 'aa,0 0 48px ' + ${JSON.stringify(FIRE.hot)} + '55,inset 0 0 30px ' + ${JSON.stringify(FIRE.ember)} + '33;' +
      'font-family:' + font + ';color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;';
    addFlames(band, 13, 18, 28, 4);   // chip ends 22px above the band; 28·1.2−4 = 30 → tips brush its border only
    const title = document.createElement('div'); title.className = 'hm-band-title';
    title.textContent = COPY.title;
    title.style.cssText = 'font-size:26px;font-weight:900;letter-spacing:4px;line-height:1;color:' + ${JSON.stringify(FIRE.hot)} + ';' +
      'text-shadow:0 0 8px ' + ${JSON.stringify(FIRE.ember)} + ',0 0 22px ' + ${JSON.stringify(FIRE.hot)} + ',0 2px 0 #000;margin-bottom:10px;white-space:nowrap;';
    const digits = document.createElement('div');
    digits.textContent = DIGITS;
    digits.style.cssText = 'font-size:34px;font-weight:900;letter-spacing:6px;line-height:1;color:' + ${JSON.stringify(FIRE.core)} + ';' +
      'text-shadow:0 2px 0 #000,0 0 14px ' + ${JSON.stringify(FIRE.ember)} + 'cc;margin-bottom:9px;white-space:nowrap;';
    const sub = document.createElement('div');
    sub.textContent = COPY.sub;
    sub.style.cssText = 'font-size:11px;font-weight:800;letter-spacing:2.2px;line-height:1;color:rgba(255,241,234,0.82);white-space:nowrap;';
    band.appendChild(title); band.appendChild(digits); band.appendChild(sub);
    document.body.appendChild(band);
    return { ranks };
  })()`;
  const r: { ranks: number[]; masked?: boolean; unmasked?: boolean; dup?: boolean } = await page.evaluate(src);
  if (r.masked) throw new Error('installTripleFire: refused — the capture is masked (digits withheld) and ring mode was not requested.');
  if (r.unmasked) throw new Error('installTripleFire: refused — ring mode on an UNMASKED capture (the full cut takes the band).');
  if (r.dup) throw new Error('installTripleFire: already installed.');
  return r.ranks;
}

/** Move every flame to phase n (0..FIRE_PHASES-1). */
export async function setFirePhase(page: Page, phase: number): Promise<void> {
  const p = ((phase % FIRE_PHASES) + FIRE_PHASES) % FIRE_PHASES;
  await page.evaluate(`document.documentElement.setAttribute('data-hm-fire', ${JSON.stringify(String(p))})`);
}

/** Remove the band (the tile ring/flames stay — the grid sits under the modals). */
export async function removeTripleBand(page: Page): Promise<void> {
  await page.evaluate(`(() => { const s = document.getElementById(${JSON.stringify(FIRE_ID)}); if (s) s.remove(); })()`);
}

export const FIRE_MODAL_ID = 'hm-triple-fire-modal';

/**
 * The modal plate — over the "Generated" row + tab strip (chrome). Measured on
 * the 10/16 build: Generated row CSS y≈222–248, tabs 250–288, both full width.
 * Returns false if the modal's header was not found (caller aborts).
 */
export async function installTripleFireModal(page: Page, digits: string): Promise<boolean> {
  const src = String.raw`(() => {
    const ID = ${JSON.stringify(FIRE_MODAL_ID)};
    const COPY = ${JSON.stringify(TRIPLE_FIRE_COPY)};
    const DIGITS = ${JSON.stringify(digits)};
    if (document.getElementById(ID)) return true;
    const leaves = Array.from(document.querySelectorAll('*')).filter(e => !e.children.length);
    const gen = leaves.find(e => /^Generated$/i.test((e.textContent || '').trim()));
    const tab = leaves.find(e => /^INTEL$/i.test((e.textContent || '').trim()));
    if (!gen || !tab) return false;
    const g = gen.getBoundingClientRect(), t = tab.getBoundingClientRect();
    const top = Math.min(g.top, t.top) - 6, bottom = Math.max(g.bottom, t.bottom) + 10;
    const font = getComputedStyle(gen).fontFamily;
    if (!document.getElementById(ID + '-style')) {
      const style = document.createElement('style'); style.id = ID + '-style'; style.textContent = ${JSON.stringify(STYLE)};
      document.head.appendChild(style);
    }
    document.documentElement.setAttribute('data-hm-fire', '0');
    const plate = document.createElement('div');
    plate.id = ID; plate.setAttribute('aria-hidden', 'true');
    plate.style.cssText = 'position:fixed;left:14px;right:14px;top:' + top + 'px;height:' + (bottom - top) + 'px;z-index:2147483646;' +
      'background:' + ${JSON.stringify(FIRE.plate)} + ';border-radius:14px;box-sizing:border-box;padding:8px 14px;' +
      'border:2px solid ' + ${JSON.stringify(FIRE.ember)} + ';box-shadow:0 0 16px ' + ${JSON.stringify(FIRE.ember)} + 'aa,0 0 40px ' + ${JSON.stringify(FIRE.hot)} + '55,inset 0 0 24px ' + ${JSON.stringify(FIRE.ember)} + '33;' +
      'font-family:' + font + ';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transform:rotate(-1.5deg);';
    for (let i = 0; i < 11; i++) {
      const f = document.createElement('div'); f.className = 'hm-flame';
      const h = 13 + ((i * 7) % 8);
      f.style.left = 'calc(' + (6 + (i / 10) * 88).toFixed(1) + '% - 8px)'; f.style.top = (3 - h) + 'px';
      f.style.width = (11 + ((i * 5) % 6)) + 'px'; f.style.height = h + 'px';
      plate.appendChild(f);
    }
    const title = document.createElement('div'); title.className = 'hm-band-title';
    title.textContent = COPY.title;
    title.style.cssText = 'font-size:17px;font-weight:900;letter-spacing:3px;line-height:1;color:' + ${JSON.stringify(FIRE.hot)} + ';white-space:nowrap;' +
      'text-shadow:0 0 8px ' + ${JSON.stringify(FIRE.ember)} + ',0 0 20px ' + ${JSON.stringify(FIRE.hot)} + ',0 2px 0 #000;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:row;align-items:center;justify-content:center;gap:12px;white-space:nowrap;';
    const d = document.createElement('div'); d.textContent = DIGITS;
    d.style.cssText = 'font-size:17px;font-weight:900;letter-spacing:4px;line-height:1;color:' + ${JSON.stringify(FIRE.core)} + ';text-shadow:0 0 10px ' + ${JSON.stringify(FIRE.ember)} + 'cc,0 2px 0 #000;';
    const s = document.createElement('div'); s.textContent = COPY.sub;
    s.style.cssText = 'font-size:8.5px;font-weight:800;letter-spacing:1.5px;line-height:1;color:rgba(255,241,234,0.82);white-space:nowrap;';
    row.appendChild(d); row.appendChild(s);
    plate.appendChild(title); plate.appendChild(row);
    document.body.appendChild(plate);
    return true;
  })()`;
  return page.evaluate(src);
}

export async function removeTripleFireModal(page: Page): Promise<void> {
  await page.evaluate(`(() => { const s = document.getElementById(${JSON.stringify(FIRE_MODAL_ID)}); if (s) s.remove(); })()`);
}
