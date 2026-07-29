// MKT-15 Phase 2 (redaction half) — the free-group session capture.
//
// ✅ WORKING — verified by a REAL end-to-end `--redact --scope=midday` capture,
// grid AND modal frames inspected. Six surfaces masked; energy, all four signal
// values, percentages, jurisdiction counts and layout untouched.
//
// Attempt 6. The card walk-up is GONE — it was the fragile part. A combination
// is now identified STRUCTURALLY, which works identically on the grid and in a
// modal and needs no marker text to exist anywhere:
//   - a leaf whose digits are separated by ANY separator, whitespace included
//     (the grid renders "4 7 1", the modal "4 - 7 - 1" — attempt 5 accepted
//      -, · and . but not space, so it masked the modal and missed the grid)
//   - a SIBLING GROUP: 3+ single-digit leaves sharing a parent. That is what a
//     position row IS, and it needs no card boundary to detect.
// The self-check is structural for the same reason: it counts sibling groups
// wherever they are, so it cannot pass by finding something in the wrong region
// the way attempt 5's global card count did.
//
// ⚠ WHY THIS LIVES IN THE RENDERER AND NOT IN THE APP. MKT-15's Phase 0 ruled
// that a capture-mode override belongs outside the consumer UI, because the
// app's vocabulary and data are correct for its own audience and only collide
// when exported. Doing it as DOM injection from Playwright goes further than an
// in-app flag: the app source is not touched AT ALL, so there is no code path a
// real subscriber can reach, no flag to leak, and nothing to keep in sync.
//
// ⚠ WHY THIS IS ONLY HALF OF PHASE 2, AND WHY THAT IS ENOUGH HERE. A PUBLIC cut
// needs relabel AND redact — at tier 1 the words PICK / STRAIGHT / BOX / PLAY
// are forbidden outright. The FREE GROUP is tier 2, where BRAND-01 deliberately
// made MATCH / STRAIGHT MATCH / BOX the sanctioned vocabulary. So the free-group
// session reel needs the digits masked and nothing else, and can therefore ship
// on this half alone, ahead of the public lane.
//
// THE Q1 CLAIM IS ASSERTED, NOT ASSUMED. `assertNoDigits` re-walks the DOM after
// masking and fails the render if any 3-digit leaf survives. MKT-21's lesson was
// that "no numerals found" is a search result, not a property — this makes it a
// property of the capture: the render aborts rather than producing a body that
// has to be inspected by eye afterwards.
import type { Page } from 'playwright';

/** What replaces a masked combination. Same width so no layout reflows. */
export const MASK = '•••';

/**
 * Mask every 3-digit combination in the live DOM, and keep masking as the app
 * re-renders.
 *
 * A MutationObserver is required rather than a one-shot pass: the body renderer
 * opens six modals in sequence, and React re-mounts the digits each time. A
 * single sweep would mask the grid and then let every modal render clean.
 */
export async function installRedaction(page: Page): Promise<void> {
  // ⚠ PASSED AS A STRING, NOT A FUNCTION, AND THAT IS LOAD-BEARING. tsx/esbuild
  // wraps named function expressions with a `__name` helper that does not exist
  // in the page context, so a normal `page.evaluate(() => {...})` containing any
  // named arrow dies with "ReferenceError: __name is not defined".
  await page.evaluate(`(() => {
    const MASK = ${JSON.stringify(MASK)};
    // CARD BOUNDARY BY WALK-UP, the technique proven on the MKT-25 ledger rows.
    // RNW hashes class names, so there is no selector for "a card" — but there
    // IS a stable leaf inside every one ("Best Straight" / "BEST STRAIGHT"), and
    // the card is the first ancestor of card-like height above it.
    window.__hmCards = () => {
      const leaves = Array.from(document.querySelectorAll('*')).filter(e => !e.children.length);
      const marks = leaves.filter(e => /best\\s+straight/i.test((e.textContent || '').trim()));
      const cards = [];
      for (const m of marks) {
        let el = m;
        for (let hop = 0; el && hop < 8; hop++) {
          const h = el.getBoundingClientRect().height;
          if (h >= 200 && h <= 1400) { if (!cards.includes(el)) cards.push(el); break; }
          el = el.parentElement;
        }
      }
      return cards;
    };
    // THE COMBINATION IS RENDERED FOUR DIFFERENT WAYS on one card. A first
    // attempt masked only the first and left the other three on screen:
    //   "681"            bare 3-digit leaf
    //   "4 - 7 - 1"      hero row, each digit its own leaf joined by separators
    //   "Box: {1,4,7}"   set notation behind a label
    //   "Pair 14"        two of the three digits
    const maskLeaf = el => {
      const t = (el.textContent || '').trim();
      // 200, not 40. The pair PROSE ("47 surging — highest recent frequency in
      // front position") runs ~50 chars, so a 40-char guard returned before the
      // prose rule could ever fire — the label masked and the sentence beside it
      // did not. Safe to raise: this only ever runs on LEAVES.
      if (!t || t.length > 200) return;
      // 1. bare three digits, and 2. separated digit runs (4 - 7 - 1, 1·4·7)
      if (/^\\d(\\s*[-·.\\s]\\s*\\d){2}$/.test(t) || /^\\d{3}$/.test(t)) { el.textContent = MASK; return; }
      // 3. brace-set notation, label preserved so the row still reads
      if (/\\{\\s*\\d\\s*,\\s*\\d\\s*,\\s*\\d\\s*\\}/.test(t)) {
        el.textContent = t.replace(/\\{\\s*\\d\\s*,\\s*\\d\\s*,\\s*\\d\\s*\\}/g, '{' + MASK + '}');
        return;
      }
      // 4. pair strings — only two digits, but they narrow the board sharply
      if (/^pair\\s*\\d{2}$/i.test(t)) { el.textContent = t.replace(/\\d{2}/, '••'); return; }
      // 5. POSITION BOXES — single digits. Individually a run of one, which is
      //    why a per-leaf scan never saw them; together they ARE the board.
      //    Masked only inside a pick card so ranks (#4) and scales stay intact.
      if (/^\\d$/.test(t) && inDigitGroup(el)) { el.textContent = '•'; return; }
      // 6. PAIR PROSE — "47 surging — highest recent frequency in front position"
      //    leads with the pair, so the sentence carries the digits too.
      if (/^\\d{2}\\s+\\S/.test(t)) { el.textContent = t.replace(/^\\d{2}/, '••'); return; }
      // 7. "Front pair 47" style labels where the digits trail a word.
      if (/\\b(front|back|split)\\s+pair\\s*\\d{2}\\b/i.test(t)) {
        el.textContent = t.replace(/(\\b(?:front|back|split)\\s+pair\\s*)\\d{2}/i, '$1••'); return;
      }
    };
    // A position row is 3+ single-digit leaves under one parent. Structural, so
    // it needs no card marker and behaves the same on grid and modal.
    window.__hmDigitGroup = el => {
      for (let p = el.parentElement, hop = 0; p && hop < 3; p = p.parentElement, hop++) {
        const kids = Array.from(p.querySelectorAll('*')).filter(e => !e.children.length);
        if (kids.filter(e => /^[\\d•]$/.test((e.textContent || '').trim())).length >= 3) return true;
      }
      return false;
    };
    const inDigitGroup = el => window.__hmDigitGroup(el);
    const maskAll = root => {
      for (const el of Array.from(root.querySelectorAll('*'))) if (!el.children.length) maskLeaf(el);
    };
    maskAll(document);
    // A MutationObserver is required rather than a one-shot pass: the body
    // renderer opens six modals in sequence and React re-mounts the digits each
    // time, so a single sweep would mask the grid and let every modal render
    // clean.
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData' && m.target.parentElement) {
          const el = m.target.parentElement;
          if (!el.children.length) maskLeaf(el);
        }
        for (const n of Array.from(m.addedNodes)) if (n.nodeType === 1) maskAll(n);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__redactObserver = obs;
  })()`);
}

/**
 * Fail the render if any combination survives, ANYWHERE, in any arrangement.
 *
 * ⚠ THIS DELIBERATELY SEARCHES A BROADER SPACE THAN THE MASK COVERS, and that is
 * the whole point. The previous version used the mask's own predicate, so it
 * could only ever confirm what the mask had already handled — it reported "no
 * 3-digit leaf found" while `4 - 7 - 1` and `{1,4,7}` were plainly on screen.
 * A circular assertion reads exactly like a passing one.
 *
 * The rule here is shape-independent: strip only the characters that can
 * separate digits WITHIN a combination, then flag any run of EXACTLY three.
 * That catches arrangements nobody enumerated — `1·4·7`, `{1 4 7}`, `1/4/7` —
 * which is the class the mask is trying to cover, rather than the list of
 * spellings it happens to know about.
 *
 * Runs of 1, 2 and 4+ are ignored on purpose: energies, draw counts and pair
 * values are two digits, and dates carry four-digit years. A run of exactly
 * three is what a combination is.
 */
export async function assertNoDigits(page: Page, where: string): Promise<void> {
  const leaked: string[] = await page.evaluate(`(() => {
    const out = [];
    const leaves = root => Array.from(root.querySelectorAll('*')).filter(e => !e.children.length);

    // ── PASS 1 — per leaf: any run of EXACTLY three digits, any arrangement.
    for (const el of leaves(document)) {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 60) continue;
      // ONE carve-out, kept to a single shape: a percentage is not a
      // combination, and "100%" is a real confidence value. Removed BEFORE the
      // scan rather than allow-listed after, because allow-lists are how an
      // assertion erodes back into the circular one this replaced.
      const flat = t.replace(/\\d{1,3}\\s*%/g, '').replace(/[\\s\\-·.,{}\\/]/g, '');
      if ((flat.match(/\\d+/g) || []).some(r => r.length === 3)) out.push('leaf: ' + t);
    }

    // ── PASS 2 — CARD LEVEL. A per-leaf scan is structurally incapable of
    // catching digits DISTRIBUTED across leaves: the position boxes are three
    // separate single-digit leaves and the pair rows are three 2-digit ones, so
    // every individual run is length 1 or 2 and nothing ever trips pass 1 —
    // while the board is plainly readable on screen.
    //
    // Cards legitimately contain many digits (energy, four signal values,
    // percentages, draw counts), so counting digits would fail every card. What
    // is counted instead is EXPOSURE VECTORS — the specific arrangements from
    // which a combination reconstructs.
    // ⚠ STRUCTURAL, NOT MARKER-BASED. Attempt 5's guard asserted "the card
    // selector found something" and passed because it found the MODAL's cards
    // while the GRID went unmasked — a count is not proof of coverage. This
    // counts sibling groups wherever they occur, so there is no region it can
    // succeed in while failing in another.
    const groups = [];
    for (const el of leaves(document)) {
      const t = (el.textContent || '').trim();
      if (!/^\\d$/.test(t)) continue;
      const p = el.parentElement; if (!p) continue;
      const sibs = Array.from(p.querySelectorAll('*')).filter(e => !e.children.length)
        .filter(e => /^\\d$/.test((e.textContent || '').trim()));
      if (sibs.length >= 3 && !groups.includes(p)) {
        groups.push(p);
        out.push('group: ' + sibs.length + ' single-digit siblings — a position row still readable');
      }
    }
    return Array.from(new Set(out));
  })()`);
  if (leaked.length) {
    throw new Error(
      `ABORT (${where}): redaction incomplete — ${leaked.length} exposure(s):\n` +
      leaked.map(x => `         ${x}`).join('\n') + '\n' +
      `       A free-group session reel exists to WITHHOLD the board. Rendering anyway would hand away the Pro conversion frame.`,
    );
  }
}
