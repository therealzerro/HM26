// MKT-15 Phase 2 (relabel half) — the PUBLIC capture mode.
//
// The free-group redaction (reel-redact.ts) masks DIGITS. A public cut needs
// more: at tier 1 the words PICK / STRAIGHT / BOX / PLAY — correct, sanctioned
// vocabulary for the paying subscribers the app is built for — are forbidden
// outright, and session labels and state attributions go with them. This is a
// TIER MISMATCH, NOT A BUG (MKT-15 P2 finding): the fix is a capture-mode
// override and NEVER an edit to the consumer UI. Same DOM-injection approach
// as the redaction, same reasoning: the app source is untouched, there is no
// code path a subscriber can reach and no flag to leak.
//
// PUBLIC MODE IS REDACT + RELABEL, in that order. installRedaction() masks the
// digits structurally; this module then (a) swaps the eight copy slots, (b)
// drops session labels and state codes, (c) swaps the heat vocabulary, and
// (d) restyles the masked combination blocks into the ruled public look —
// a blurred PLACEHOLDER block with the bolt over it. The blur is of the
// placeholder, never of real digits: by the time this module runs, the digits
// are already bullets, so nothing derived from them ever reaches the pixels.
// That is what makes the frame-by-frame Q1 pass a fact rather than a
// judgement about how much blur is enough.
//
// ⚠ EVERY REPLACEMENT STRING BELOW IS CONFIG, not code. The eight-slot set is
// the DELIVERED public copy (docs/mkt15_phase2_copy_brief.md, approved
// 2026-07-28). The heat vocabulary is the DELIVERED MKT-28 neutral set
// (2026-07-30) — canonical band scale over the reconciled ladders; see the
// note on HEAT_RELABEL below for the mapping and its one matcher constraint.
import type { Page } from 'playwright';
import { lintCaption } from '../lib/social/brandLint';

/**
 * The eight-slot public copy set — DELIVERED and approved. Slots 6-7 are
 * drops, handled structurally below; slot 8 (stinger headline) is
 * stinger-config territory and not a capture concern.
 */
export const RELABEL_SLOTS = {
  /** Slot 1 — card header. `PICK #1 · ZK6` → `SIGNAL #1` (suffix dropped: version-agnostic for free). */
  cardHeader: 'SIGNAL #',
  /** Slot 2 — primary number label. `BEST STRAIGHT` → `BEST ORDER`. */
  bestLabel: 'BEST ORDER',
  /** Slot 3 — number-set label. `BOX SET` → `ANY ORDER` (measured fit: 55px in an 86px chip). */
  setLabel: 'ANY ORDER',
  /** Slot 4 — card tab. `PLAY` → `PLAN`. ⚠ Tab CONTENTS unaudited — the renderer never clicks through (§10). */
  tabLabel: 'PLAN',
  /** Slot 5 — resolution trail. `· 1 straight` → `· 1 in order`. */
  trailWord: 'in order',
} as const;

/**
 * MKT-28 — the DELIVERED neutral vocabulary (content agent, 2026-07-30),
 * replacing the provisional set outright. Canonical band scale, mapped by RANK
 * against the post-reconciliation ladders (three remain: the canonical
 * temperature ladder on grid meter / modal banner / poster card, the Heat
 * Check verdicts, and the streak banner):
 *
 *   temperature: ON FIRE→PEAK BAND · BLAZING→HIGH BAND · HOT→MID BAND ·
 *                WARM→LOW BAND · COOL→BASE BAND
 *   verdicts:    BLAZING SIGNAL→PEAK SIGNAL; STRONG SIGNAL / MODERATE /
 *                OVERDUE / LOW are already neutral and KEEP their strings —
 *                no entry needed, and none may be added for LOW (WARM maps to
 *                'LOW BAND', so a LOW entry would re-match inside it).
 *   banner:      🔥 STRONG SIGNAL — … keeps STRONG SIGNAL; the flame drops.
 *
 * Numeric values SURVIVE, symbols do not ('ON FIRE 99°' → 'PEAK BAND 99');
 * the flame and ice glyphs carry the temperature register and are DROPPED,
 * not swapped. The whole temperature register (fire/flame/hot/heat/cold/ice…)
 * is banned in any public-slot string — target register is a market-data
 * terminal: bands, levels, readings.
 *
 * Keys are matched as whole phrases, longest first (BLAZING SIGNAL must win
 * over BLAZING). Heat Check never enters the current capture (the renderer
 * opens the six pick modals only); its verdict entries are defense-in-depth
 * for the day it does.
 */
export const HEAT_RELABEL: Record<string, string> = {
  'BLAZING SIGNAL': 'PEAK SIGNAL',
  'ON FIRE': 'PEAK BAND',
  'BLAZING': 'HIGH BAND',
  'HOT': 'MID BAND',
  'WARM': 'LOW BAND',
  'COOL': 'BASE BAND',
  '🔥': '',
  '❄': '',
};

/** Bolt overlay — gold gradient per palette §7, the ruled decisions:
 *  one bolt per masked number block, ~60% of block height, 85% opacity. */
const BOLT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#F59E0B"/>` +
  `</linearGradient></defs>` +
  `<path d="M600 102 L217 560 L470 560 L424 922 L807 464 L554 464 Z" fill="url(#g)"/></svg>`;
const BOLT_URI = `data:image/svg+xml,${encodeURIComponent(BOLT_SVG)}`;

/**
 * Install the public relabel over an ALREADY-REDACTED page, and keep it
 * installed via MutationObserver for the same reason the redaction does: the
 * renderer opens six modals and React re-mounts the text each time.
 */
export async function installRelabel(page: Page): Promise<void> {
  const heat = JSON.stringify(
    Object.entries(HEAT_RELABEL).sort((a, b) => b[0].length - a[0].length),
  );
  // Passed as a STRING, not a function — tsx's __name wrapper does not exist in
  // the page context (same constraint as installRedaction; see its note).
  await page.evaluate(`(() => {
    const HEAT = new Map(${heat});
    const BOLT = ${JSON.stringify(BOLT_URI)};
    const relabelLeaf = el => {
      if (el.dataset && el.dataset.hmBolt) return;
      let t = el.textContent || '';
      if (!t.trim() || t.length > 300) return;
      const orig = t;
      // Slot 1 — PICK #N (· ZK6) → SIGNAL #N. The suffix drop keeps the header
      // version-agnostic, which the brief wanted anyway.
      t = t.replace(/\\bPICK\\s*#(\\d+)(\\s*·\\s*ZK6)?/g, '${RELABEL_SLOTS.cardHeader}$1');
      // Slot 2 / 3 / 4 / 5.
      t = t.replace(/\\bBEST\\s+STRAIGHT\\b/gi, '${RELABEL_SLOTS.bestLabel}');
      t = t.replace(/\\bBOX\\s+SET\\b/gi, '${RELABEL_SLOTS.setLabel}');
      if (/^\\s*PLAY\\s*$/.test(t)) t = t.replace(/PLAY/, '${RELABEL_SLOTS.tabLabel}');
      t = t.replace(/\\b(\\d+)\\s+straights?\\b/gi, '$1 ${RELABEL_SLOTS.trailWord}');
      // Slot 6 — scope badge: a leaf that IS the session label is dropped, not
      // reworded (content-agent ruling: session words are blocking, and the
      // stinger headline is where differentiation is actually read).
      if (/^\\s*(ALL-?DAY|MIDDAY|EVENING)\\s*$/i.test(t)) {
        el.textContent = '';
        if (el.style) el.style.display = 'none';
        return;
      }
      // Slot 7 — provenance chip: strip only the trailing scope tag.
      t = t.replace(/\\s*·\\s*(ALL-?DAY|MIDDAY|EVENING)\\s*$/i, '');
      // State codes in the resolution trail: suppressed, counts kept — the
      // jurisdiction FOOTPRINT is methodology, the attribution is the risk.
      t = t.replace(/\\b[A-Z]{2}(?=\\s*\\d{1,3}\\s*\\u00d7)/g, '').replace(/\\u00d7\\s{2,}/g, '\\u00d7 ');
      // Heat vocabulary — longest phrase first so BLAZING SIGNAL wins over BLAZING.
      for (const [from, to] of HEAT) {
        if (t.includes(from)) t = t.split(from).join(to);
      }
      if (t !== orig) el.textContent = t;
      // Q1 IS ABSOLUTE ON THE PUBLIC CUT. The tier-1 lint blocks EVERY visible
      // three-digit run — probed 2026-07-30: "100", "100%" and "102×" all
      // block; "99×" and "14 states" pass. So the free cut's kept-methodology
      // carve-outs (signal value 100, multiplicity counts) do NOT carry over:
      // any leaf still showing a 3-digit run is HIDDEN — structural, so the
      // frame simply does not contain it. Numeric suppression hides;
      // vocabulary must be SWAPPED, and anything left aborts in the audit.
      if (/(?<![0-9])[0-9]{3}(?![0-9])/.test(el.textContent || '')) {
        el.textContent = '';
        if (el.style) el.style.display = 'none';
      }
    };
    // The same rule for MIXED CONTENT (a value text node beside its suffix
    // element — the modal SignalPill renders "100" + "%"): hide the PARENT, so
    // the pill shows its label and bar with no number.
    const hideMixedTriples = root => {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (!el.children.length) continue;
        const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3);
        if (!direct.some(n => /[0-9]/.test(n.textContent || ''))) continue;
        const t = (el.textContent || '').trim();
        if (t.length <= 60 && /(?<![0-9])[0-9]{3}(?![0-9])/.test(t)) {
          if (el.style) el.style.display = 'none';
        }
      }
    };
    // The ruled public look for a masked COMBINATION block: blurred placeholder
    // + the bolt. Only full-combination masks get the bolt (one per masked
    // number); pair bullets and position dots stay as the redaction left them —
    // six bolts per card would read as noise (the delivery brief's own caution).
    const boltify = el => {
      if (el.dataset && el.dataset.hmBolt) return;
      const t = (el.textContent || '').trim();
      if (t !== '\\u2022\\u2022\\u2022') return;
      const r = el.getBoundingClientRect();
      const w = r.width >= 8 ? r.width : null, h = r.height >= 8 ? r.height : null;
      el.dataset.hmBolt = '1';
      el.textContent = '';
      el.style.display = 'inline-block';
      el.style.position = 'relative';
      el.style.overflow = 'hidden';
      el.style.borderRadius = '0.18em';
      el.style.width = w ? w + 'px' : '2.4em';
      el.style.height = h ? h + 'px' : '1.1em';
      el.style.verticalAlign = 'middle';
      el.innerHTML =
        '<i style="position:absolute;inset:0;border-radius:inherit;' +
        'background:radial-gradient(ellipse at 42% 38%, #4c4370 0%, #241f3d 72%);' +
        'filter:blur(5px)"></i>' +
        '<img src="' + BOLT + '" style="position:absolute;left:50%;top:50%;' +
        'transform:translate(-50%,-50%);height:60%;opacity:0.85">';
    };
    const sweep = root => {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (!el.children.length) { relabelLeaf(el); boltify(el); }
      }
      hideMixedTriples(root);
    };
    sweep(document);
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData' && m.target.parentElement) {
          const el = m.target.parentElement;
          if (!el.children.length) { relabelLeaf(el); boltify(el); }
        }
        for (const n of Array.from(m.addedNodes)) if (n.nodeType === 1) sweep(n);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__relabelObserver = obs;
  })()`);
}

/**
 * The live tier-1 audit, run at capture time: every visible string through the
 * REAL lint engine, plus the structural checks the lint cannot express. Fails
 * the render — MKT-21's lesson again: "zero violations" must be a property of
 * the capture, not a search result.
 */
export async function assertPublicClean(page: Page, where: string): Promise<void> {
  const texts: string[] = await page.evaluate(`(() => {
    const out = new Set();
    // Only what actually RENDERS: a suppressed (display:none) leaf is not in
    // any frame, so auditing it would fail captures on content Q1 removed.
    const rendered = el => el.getClientRects().length > 0;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!rendered(el)) continue;
      if (!el.children.length) {
        const t = (el.textContent || '').trim();
        if (t && t.length <= 300) out.add(t);
        continue;
      }
      // Mixed content — a value text node beside its suffix element evades a
      // leaf walk (the redaction assert learned this same lesson): audit the
      // concatenation so "100" + "%" is read as the "100%" a viewer sees.
      const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3);
      if (direct.some(n => (n.textContent || '').trim())) {
        const t = (el.textContent || '').trim();
        if (t && t.length <= 60) out.add(t);
      }
    }
    return Array.from(out);
  })()`);
  const violations: string[] = [];
  for (const t of texts) {
    const lint = lintCaption(t, 1);
    for (const v of lint.violations.filter(x => x.blocking)) {
      violations.push(`"${t}" — ${v.term} (${v.rule})`);
    }
    if (/^\s*(ALL-?DAY|MIDDAY|EVENING)\s*$/i.test(t)) violations.push(`"${t}" — session label survived the drop`);
    if (/\b[A-Z]{2}\s*\d{1,3}\s*×/.test(t)) violations.push(`"${t}" — state attribution survived suppression`);
  }
  if (violations.length) {
    throw new Error(
      `ABORT (${where}): public relabel incomplete — ${violations.length} blocking violation(s):\n` +
      [...new Set(violations)].map(x => `         ${x}`).join('\n') + '\n' +
      `       The acceptance bar is EMPTY, not reviewed (docs/mkt15_phase2_copy_brief.md).`,
    );
  }
  console.log(`public lint audit (${where}): ${texts.length} strings, 0 blocking violations.`);
}
