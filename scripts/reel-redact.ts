// MKT-15 Phase 2 (redaction half) — the free-group session capture.
//
// ⚠⚠ STILL INCOMPLETE — DO NOT REGISTER. Four surfaces are now masked (bare
// 3-digit, separated hero row, brace set, pair label) and the assertion is no
// longer circular — it FAILS pre-mask, which is proven in test. But the eye
// check found two surfaces that BOTH the mask and the assertion miss, because
// they are distributed across leaves rather than contained in one:
//     position boxes   `4 P1` · `7 P2` · `1 P3`     three single-digit leaves
//     pair rows        `Front pair 47` · `Back pair 71` · `Split pair 41`
// Either reconstructs the combination by inspection. The assertion cannot see
// them because every leaf holds a run of 1 or 2 digits and it scans per leaf.
//
// ⚠⚠ A PER-LEAF ASSERTION IS STRUCTURALLY INCAPABLE OF CATCHING THIS. The fix
// is not a better regex — it is to aggregate at CARD level: collect every digit
// inside a card container, and fail if the multiset can form a 3-digit
// combination. This is the same pair-rows finding already recorded against
// MKT-15 Phase 2 for the public lane, arriving here because the two lanes share
// the capture. Fixing it here fixes it for both.
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
    // THE COMBINATION IS RENDERED FOUR DIFFERENT WAYS on one card. A first
    // attempt masked only the first and left the other three on screen:
    //   "681"            bare 3-digit leaf
    //   "4 - 7 - 1"      hero row, each digit its own leaf joined by separators
    //   "Box: {1,4,7}"   set notation behind a label
    //   "Pair 14"        two of the three digits
    const maskLeaf = el => {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 40) return;
      // 1. bare three digits, and 2. separated digit runs (4 - 7 - 1, 1·4·7)
      if (/^\\d(\\s*[-·.]\\s*\\d){2}$/.test(t) || /^\\d{3}$/.test(t)) { el.textContent = MASK; return; }
      // 3. brace-set notation, label preserved so the row still reads
      if (/\\{\\s*\\d\\s*,\\s*\\d\\s*,\\s*\\d\\s*\\}/.test(t)) {
        el.textContent = t.replace(/\\{\\s*\\d\\s*,\\s*\\d\\s*,\\s*\\d\\s*\\}/g, '{' + MASK + '}');
        return;
      }
      // 4. pair strings — only two digits, but they narrow the board sharply
      if (/^pair\\s*\\d{2}$/i.test(t)) { el.textContent = t.replace(/\\d{2}/, '••'); return; }
    };
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
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 60) continue;
      // ONE carve-out, and it is kept to a single shape on purpose: a
      // percentage is not a combination, and "100%" is a real confidence value
      // that would otherwise block every render. Carve-outs are how an
      // assertion erodes into the circular one this replaced, so this is the
      // only exclusion and it is removed BEFORE the digit scan rather than
      // allow-listed after it.
      const t2 = t.replace(/\\d{1,3}\\s*%/g, '');
      const flat = t2.replace(/[\\s\\-·.,{}\\/]/g, '');
      const runs = flat.match(/\\d+/g) || [];
      if (runs.some(r => r.length === 3)) out.push(t);
    }
    return Array.from(new Set(out));
  })()`);
  if (leaked.length) {
    throw new Error(
      `ABORT (${where}): redaction incomplete — ${leaked.length} leaf/leaves still contain a 3-digit run:\n` +
      leaked.map(x => `         "${x}"`).join('\n') + '\n' +
      `       A free-group session reel exists to WITHHOLD these. Rendering anyway would hand away the Pro conversion frame.`,
    );
  }
}
