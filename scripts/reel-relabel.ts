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
import { lintCaption, STATE_CODES } from '../lib/social/brandLint';

/**
 * COMPLETE 50+DC state set for the CAPTURE side — suppression and the
 * attribution-shape audit. brandLint's STATE_CODES is deliberately partial
 * (its token check runs over free prose, and IN/OK/OR/ME/OH/HI collide with
 * English words); the first public render proved the gap when an "OK 1×"
 * Oklahoma chip sailed through it. Here both consumers apply the set ONLY to
 * attribution-SHAPED strings (every token two-letter-code-shaped), where no
 * English word can collide — so the capture is strictly harder to pass than
 * the caption lint, never easier.
 */
const STATE_CODES_COMPLETE = new Set([
  ...STATE_CODES,
  'AL','AK','HI','IN','MA','ME','MT','NH','OH','OK','OR','PA','RI','UT','WY',
]);

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
 *   verdicts:    BLAZING SIGNAL→PEAK SIGNAL; OVERDUE→LONG GAP (delivered
 *                2026-07-31, MKT-35 — slot 9's flag resolved; LONG GAP at 8
 *                chars is narrower than the kept STRONG SIGNAL so it fits
 *                every chip that string fits, and OVERDUE collides with no
 *                other key or replacement — checked per the slot-10 lesson);
 *                STRONG SIGNAL / MODERATE / LOW are already neutral and KEEP
 *                their strings — no entry needed, and none may be added for
 *                LOW (WARM maps to 'LOW BAND', so a LOW entry would re-match
 *                inside it).
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
  'OVERDUE': 'LONG GAP',
  '🔥': '',
  '❄': '',
  // MKT-35: the OVERDUE verdict's ⚠️ drops with the register, same as 🔥/❄ —
  // both forms, with and without the emoji variation selector.
  '⚠️': '',
  '⚠': '',
  // Rule 3 of the delivered set: numeric values SURVIVE, symbols do not —
  // 'ON FIRE 99°' → 'PEAK BAND 99'. The degree sign reads as temperature.
  '°': '',
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
    const STATES = new Set(${JSON.stringify([...STATE_CODES_COMPLETE])});
    const BOLT = ${JSON.stringify(BOLT_URI)};
    // The PURE string swaps — slots 1-5 + slot 7's trailing-scope strip, the
    // in-string state suppression, and the heat vocabulary. Shared between the
    // childless-leaf walk and DIRECT TEXT NODES of mixed-content elements: the
    // trail renders "2 matches … · 2" and "straight" as a text node BESIDE
    // element children (modal #5, 2026-07-30), so a leaf-only walk never swaps
    // it — the same structural blind spot MKT-28c closed on the numeric side.
    const swapStr = t => {
      // Slot 1 — PICK #N (· ZK6) → SIGNAL #N. The suffix drop keeps the header
      // version-agnostic, which the brief wanted anyway.
      t = t.replace(/\\bPICK\\s*#(\\d+)(\\s*·\\s*ZK6)?/g, '${RELABEL_SLOTS.cardHeader}$1');
      // Slot 2 / 3 / 4 / 5.
      t = t.replace(/\\bBEST\\s+STRAIGHT\\b/gi, '${RELABEL_SLOTS.bestLabel}');
      t = t.replace(/\\bBOX\\s+SET\\b/gi, '${RELABEL_SLOTS.setLabel}');
      t = t.replace(/\\b(\\d+)\\s+straights?\\b/gi, '$1 ${RELABEL_SLOTS.trailWord}');
      // Residual bare "straight(s)" — the count and the word can land in
      // separate nodes, so the numbered form above never sees them together.
      // The delivered slot 5 already reuses one word for this slot ("may reuse
      // #2's word"), so the residual swap is the same vocabulary, not a new
      // decision. Ordered AFTER slot 2, which owns "BEST STRAIGHT".
      t = t.replace(/\\bstraights?\\b/gi, '${RELABEL_SLOTS.trailWord}');
      // Slot 7 — provenance chip: strip only the trailing scope tag.
      t = t.replace(/\\s*·\\s*(ALL-?DAY|MIDDAY|EVENING)\\s*$/i, '');
      // State codes in the resolution trail: suppressed, counts kept — the
      // jurisdiction FOOTPRINT is methodology, the attribution is the risk.
      t = t.replace(/\\b[A-Z]{2}(?=\\s*\\d{1,3}\\s*\\u00d7)/g, '').replace(/\\u00d7\\s{2,}/g, '\\u00d7 ');
      // Heat vocabulary — longest phrase first so BLAZING SIGNAL wins over BLAZING.
      for (const [from, to] of HEAT) {
        if (t.includes(from)) t = t.split(from).join(to);
      }
      return t;
    };
    // A string that IS state attribution: all tokens two-letter-code-shaped,
    // at least one in the lint's exported set. The set is deliberately partial
    // (data footprint, not all 50) — the Tri-State leaf "ME,NH,VT" carries two
    // codes outside it, so an every-token-in-set rule misses exactly the leaf
    // the audit still flags on "VT". Any-token mirrors the audit's own rule.
    const isStateAttribution = t => {
      const tokens = t.trim().split(/[,\\s/]+/).filter(Boolean);
      return tokens.length >= 1 && tokens.every(x => /^[A-Z]{2}$/.test(x)) && tokens.some(x => STATES.has(x));
    };
    const relabelLeaf = el => {
      if (el.dataset && el.dataset.hmBolt) return;
      let t = el.textContent || '';
      if (!t.trim() || t.length > 300) return;
      const orig = t;
      if (/^\\s*PLAY\\s*$/.test(t)) t = t.replace(/PLAY/, '${RELABEL_SLOTS.tabLabel}');
      // Slot 6 — scope badge: a leaf that IS the session label is dropped, not
      // reworded (content-agent ruling: session words are blocking, and the
      // stinger headline is where differentiation is actually read).
      if (/^\\s*(ALL-?DAY|MIDDAY|EVENING)\\s*$/i.test(t)) {
        el.textContent = '';
        if (el.style) el.style.display = 'none';
        return;
      }
      t = swapStr(t);
      // A leaf that IS state attribution hides whole (modal #2 rendered "TX"
      // and "FL" as their own leaves; modal #4 the Tri-State "ME,NH,VT").
      if (isStateAttribution(t)) {
        el.textContent = '';
        if (el.style) el.style.display = 'none';
        return;
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
    // Direct text nodes of MIXED elements get the same string swaps the leaf
    // walk applies — and a node that is state attribution on its own blanks.
    // Numeric runs in mixed content are hideMixedTriples' job (parent hides).
    const relabelMixedText = root => {
      const els = Array.from(root.querySelectorAll('*'));
      if (root.nodeType === 1) els.unshift(root);
      for (const el of els) {
        if (!el.children.length) continue;
        for (const n of Array.from(el.childNodes)) {
          if (n.nodeType !== 3) continue;
          const t = n.textContent || '';
          if (!t.trim() || t.length > 300) continue;
          const s = swapStr(t);
          if (isStateAttribution(s)) { n.textContent = ''; continue; }
          if (s !== t) n.textContent = s;
        }
      }
    };
    const sweep = root => {
      // ⚠ querySelectorAll returns DESCENDANTS ONLY. React appends individual
      // leaf elements on incremental renders; sweeping such an addition as a
      // root with no descendants processed NOTHING — which is how modal #5's
      // trail leaf kept its vocabulary through three prior fixes (2026-07-30).
      const els = Array.from(root.querySelectorAll('*'));
      if (root.nodeType === 1) els.unshift(root);
      for (const el of els) {
        if (!el.children.length) { relabelLeaf(el); boltify(el); }
      }
      relabelMixedText(root);
      hideMixedTriples(root);
    };
    sweep(document);
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData' && m.target.parentElement) {
          const el = m.target.parentElement;
          if (!el.children.length) { relabelLeaf(el); boltify(el); }
          else {
            const n = m.target, t = n.textContent || '';
            if (t.trim() && t.length <= 300) {
              const s = swapStr(t);
              if (isStateAttribution(s)) n.textContent = '';
              else if (s !== t) n.textContent = s;
            }
          }
        }
        for (const n of Array.from(m.addedNodes)) {
          if (n.nodeType === 1) { sweep(n); continue; }
          // An APPENDED text node re-triggers nothing above: characterData
          // only fires on edits to EXISTING nodes, and the element sweep skips
          // nodeType 3 — so React appending text into an already-swept DIV
          // left "· 2 straight" live (modal #5, 2026-07-30; mount-order
          // dependent, which is why other modals passed). Process the parent.
          if (n.nodeType === 3 && n.parentElement) {
            const el = n.parentElement;
            if (!el.children.length) { relabelLeaf(el); boltify(el); }
            else {
              const t = n.textContent || '';
              if (t.trim() && t.length <= 300) {
                const s = swapStr(t);
                if (isStateAttribution(s)) n.textContent = '';
                else if (s !== t) n.textContent = s;
              }
            }
          }
        }
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
  const COMPLETE = STATE_CODES_COMPLETE;
  for (const t of texts) {
    const lint = lintCaption(t, 1);
    for (const v of lint.violations.filter(x => x.blocking)) {
      violations.push(`"${t}" — ${v.term} (${v.rule})`);
    }
    if (/^\s*(ALL-?DAY|MIDDAY|EVENING)\s*$/i.test(t)) violations.push(`"${t}" — session label survived the drop`);
    if (/\b[A-Z]{2}\s*\d{1,3}\s*×/.test(t)) violations.push(`"${t}" — state attribution survived suppression`);
    // Attribution-SHAPED strings against the COMPLETE state set — this is the
    // audit half of the suppression above, and it must use the same set and
    // the same shape rule or an OK/ME/NH chip passes the gate the way "OK 1×"
    // did on the first public render. Shape-gated, so caps prose ("RESOLVED
    // IN · LAST 30 DAYS") can never collide.
    const toks = t.trim().split(/[,\s/·]+/).filter(Boolean);
    if (toks.length >= 1 && toks.every(x => /^[A-Z]{2}$/.test(x)) && toks.some(x => COMPLETE.has(x))) {
      violations.push(`"${t}" — state attribution (complete-set) survived suppression`);
    }
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
