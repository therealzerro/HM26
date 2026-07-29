// MKT-15 Phase 2 (redaction half) — the free-group session capture.
//
// ⚠⚠ INCOMPLETE — DO NOT REGISTER OR USE. This masks only ONE of at least three
// digit surfaces. Verified against the live grid: it caught "LAST MATCH •••" and
// left BOTH renderings of the actual combination on screen —
//   the hero row `4 - 7 - 1`  (each digit is its OWN leaf, so /^\d{3}$/ never
//                              matches it)
//   the set badge `Box: {1,4,7}`  (brace notation, same three digits)
// A free-group session reel built on this would hand away precisely what it
// exists to withhold, on every card.
//
// ⚠⚠ AND THE ASSERTION DID NOT CATCH IT, WHICH IS THE REAL LESSON. `assertNoDigits`
// searched with the SAME predicate the mask used, so it could only ever confirm
// what the mask had already handled. It reported "no 3-digit leaf found" — true,
// and meaningless. This is MKT-21's finding arriving inside the guard rather
// than inside the asset: "no numerals found" is a search result, not a property.
// A redaction assertion MUST search a BROADER space than the mask covers, or it
// is circular by construction.
//
// TO FINISH: mask (a) per-digit leaf runs that form a combo row, (b) brace-set
// notation /\{\d,\d,\d\}/, (c) pair strings; then assert on a pattern that
// looks for ANY run of 3+ digits with arbitrary separators, plus an OCR-free
// pixel check is not available so the eye check stays mandatory.
//
// Masks every 3-digit combination in the captured DOM so the free-group Midday
// and Evening reels can show the BOARD without giving away the numbers. That
// gap is the Pro conversion frame: the free group sees the shape of the day's
// board and the fact that it is ranked and explained, and gets the digits the
// next morning in the receipts reel — or now, by subscribing.
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
  // named arrow dies with "ReferenceError: __name is not defined". A string body
  // is never transformed. Same trap applies to anything else this file adds.
  await page.evaluate(`(() => {
    const MASK = ${JSON.stringify(MASK)};
    const isCombo = t => /^\\d{3}$/.test((t || '').trim());
    const maskAll = root => {
      const all = root.querySelectorAll('*');
      for (const el of all) {
        if (el.children.length) continue;
        if (isCombo(el.textContent)) el.textContent = MASK;
      }
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
          if (!el.children.length && isCombo(el.textContent)) el.textContent = MASK;
        }
        for (const n of Array.from(m.addedNodes)) if (n.nodeType === 1) maskAll(n);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__redactObserver = obs;
  })()`);
}

/**
 * Fail the render if any 3-digit leaf survives. Returns the offending strings so
 * the error names what leaked rather than just asserting that something did.
 */
export async function assertNoDigits(page: Page, where: string): Promise<void> {
  const leaked: string[] = await page.evaluate(`(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (/^\\d{3}$/.test(t)) out.push(t);
    }
    return Array.from(new Set(out));
  })()`);
  if (leaked.length) {
    throw new Error(
      `ABORT (${where}): redaction incomplete — ${leaked.length} unmasked combination(s) still in the DOM: ${leaked.join(', ')}.\n` +
      `       A free-group session reel exists to WITHHOLD these. Rendering anyway would hand away the Pro conversion frame.`,
    );
  }
}
