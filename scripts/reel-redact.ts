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
      //
      // ⚠ THE BARE BRANCH SKIPS SIGNAL VALUES — MKT-28c. It used to eat a grid
      // signal value of exactly 100, rendering it as the mask. That is the one
      // value in 0-100 that is three digits, and the gate record lists all four
      // signal percentages among the things the free cut DELIBERATELY KEEPS, so
      // masking it removed methodology the operator signed off on showing.
      //
      // Discriminated STRUCTURALLY, not by value: a signal value's parent holds
      // exactly its one-letter key and the number ("B"/"71"), which is a shape a
      // combination never has. Verified against the live DOM 2026-07-30 — all 24
      // digit leaves on the grid are signal values with a B/P/C/D sibling, and
      // the combination is NOT among them: the grid hero row is a single leaf
      // reading "0 4 9", caught by the SEPARATED pattern above, and the box set
      // is brace notation caught by rule 3. So on the grid the bare branch has
      // no legitimate target at all; its real targets are the modal's bare leaves.
      // This cannot unmask a combination unless the UI starts labelling one with
      // a single signal key, which would be a different bug entirely.
      if (/^\\d{1,3}$/.test(t) && isSignalValue(el)) return;
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
      //    GLOBAL since 2026-07-30: the non-global replace held only because
      //    each pair label is its own leaf today. If the three pairs are ever
      //    rendered into one leaf, a single replace masks the first and ships
      //    the other two — the exact hole the MKT-26 addendum named.
      if (/\\b(front|back|split)\\s+pair\\s*\\d{2}\\b/i.test(t)) {
        el.textContent = t.replace(/(\\b(?:front|back|split)\\s+pair\\s*)\\d{2}/gi, '$1••'); return;
      }
    };
    // ── TEXT-NODE MASK (2026-07-30) — the mixed-content hole, mask half.
    // maskLeaf runs on CHILDLESS elements only, so a 3-digit run rendered as a
    // text node beside element siblings (mixed content) was invisible to it.
    // Nothing renders a combination that way today; this exists so a markup
    // change cannot start to. HIGH-CONFIDENCE SHAPES ONLY — bare and separated
    // runs inside one text node. Anything subtler is the assert's job: an abort
    // is recoverable, a silent over-mask of kept methodology is 28c again.
    //   ⚠ THE 28c CARVE-OUT, mixed-content form: the modal signal value is a
    //   text node ("100") whose NEXT SIBLING is the percent suffix element —
    //   probed 2026-07-30 (SignalPill renders {pct}<Text>%</Text>). A bare run
    //   whose following sibling starts with % or the multiply sign is a kept
    //   value, not a combination.
    const maskTextNode = node => {
      const t = (node.textContent || '').trim();
      if (!t || t.length > 200) return;
      if (/^\\d{3}$/.test(t)) {
        const sib = node.nextSibling;
        const sibText = sib ? ((sib.textContent || '').trim()) : '';
        if (/^[%\\u00d7]/.test(sibText)) return;
        if (node.parentElement && window.__hmSignalValue(node.parentElement)) return;
        node.textContent = MASK; return;
      }
      if (/^\\d(\\s*[-·.\\s]\\s*\\d){2}$/.test(t)) { node.textContent = MASK; return; }
    };
    // MKT-28c — is this leaf one of the four SIGNAL VALUES (BOX / PBURST / CO /
    // DGC) rather than part of a combination?
    //
    // Shared by the mask and the assert on purpose. The assert is the reason it
    // has to be shared: once the mask stops eating a value of 100, that bare
    // three-digit run stays on screen, and the assert's pass 1 flags any run of
    // exactly three — so the SAME predicate has to excuse it there or the render
    // aborts before frame 0. Two copies of this test would drift and the drift
    // would present as an intermittent abort on the one day a signal hits 100.
    window.__hmSignalValue = el => {
      const p = el.parentElement;
      if (!p) return false;
      const kids = Array.from(p.children).filter(c => !c.children.length);
      if (kids.length !== 2) return false;
      const label = (kids[0].textContent || '').trim();
      return kids[1] === el && /^[BPCD]$/.test(label);
    };
    const isSignalValue = el => window.__hmSignalValue(el);
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
      // ⚠ querySelectorAll returns DESCENDANTS ONLY — the root itself must be
      // processed too, or an individually-appended leaf element (React does
      // this on incremental renders) is swept as a root with no descendants
      // and nothing masks it. Found 2026-07-30 via the relabel's twin sweep.
      const els = Array.from(root.querySelectorAll('*'));
      if (root.nodeType === 1) els.unshift(root);
      for (const el of els) {
        if (!el.children.length) { maskLeaf(el); continue; }
        // Mixed content: direct text nodes of an element that HAS children.
        for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) maskTextNode(n);
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
          if (!el.children.length) maskLeaf(el);
          else maskTextNode(m.target);
        }
        for (const n of Array.from(m.addedNodes)) {
          if (n.nodeType === 1) maskAll(n);
          // An appended text node whose parent is CHILDLESS fell through both
          // branches here (children counts elements, not text nodes) — the
          // parent leaf must be re-masked (2026-07-30, same class as the
          // relabel's appended-node gap).
          else if (n.nodeType === 3 && n.parentElement) {
            if (n.parentElement.children.length) maskTextNode(n);
            else maskLeaf(n.parentElement);
          }
        }
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
 * three is what a combination is. (Two-digit runs get ONE targeted exception —
 * pass 3 flags any surviving run beside the word "pair", because the pair
 * route reassembles the combination exactly and had no assert behind it.)
 *
 * ⚠ "DRAW COUNTS ARE TWO DIGITS" WAS AN ASSUMPTION, AND IT WAS FALSE.
 * Found 2026-07-29 (MKT-26): the evening board aborted this assert on `102×`,
 * a resolution-trail multiplicity count on two ON FIRE cards. Not a leak — the
 * combinations on those cards were 1·0·4 and 8·0·5 — but a real three-digit run
 * on screen, so the assert was right to stop and the premise was wrong.
 *
 * It surfaced only on evening because midday's board that day had no card with
 * a 3-digit resolution count. That is worth remembering about this whole class
 * of guard: the boards differ in CONTENT, so a scope passing proves nothing
 * about the next one.
 */
export async function assertNoDigits(page: Page, where: string): Promise<void> {
  const leaked: string[] = await page.evaluate(`(() => {
    const out = [];
    const leaves = root => Array.from(root.querySelectorAll('*')).filter(e => !e.children.length);

    // ── PASS 1 — per leaf: any run of EXACTLY three digits, any arrangement.
    for (const el of leaves(document)) {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 60) continue;
      // TWO carve-outs, each kept to a single SHAPE rather than a set of
      // values. Both are removed BEFORE the scan rather than allow-listed
      // after, because allow-lists are how an assertion erodes back into the
      // circular one this replaced.
      //
      //   N%  a percentage is not a combination — "100%" is a real confidence.
      //   N×  a MULTIPLICITY COUNT is not a combination either. The resolution
      //       trail renders "GA 102×" meaning 102 resolutions, and the gate
      //       record lists jurisdiction counts among the things the free cut
      //       DELIBERATELY KEEPS, so masking them instead would have removed a
      //       methodology signal the operator signed off on showing.
      //
      // The count form is anchored to a boundary and requires the marker to
      // FOLLOW the digits, so it can only ever cancel a genuine count chip. A
      // combination never renders with a trailing multiplication sign — it
      // renders as a bare run, a separated hero row, or brace-set notation, all
      // of which still trip this scan. The marker is U+00D7, the sign the UI
      // actually emits, not the letter x.
      //
      // ⚠ NO BACKTICKS ANYWHERE IN THIS BLOCK. Everything from the evaluate(
      // call down is inside a TEMPLATE LITERAL, so a backtick in a comment
      // terminates the string and dumps its contents into TypeScript as source.
      // Cost a failed render to find; the surrounding comments use "quotes".
      //
      // DELIBERATELY NOT CARVED: a bare "/100" denominator leaf, which exists
      // in the DOM (the energy scale splits across leaves) and WOULD trip this.
      // It did not reach the assert in any run measured on 2026-07-29, and
      // carving a third shape on suspicion is exactly how this predicate erodes.
      // If it ever aborts a render, that is the guard working — it fires before
      // frame 0, so it costs nothing but a re-run to come back and widen this
      // with evidence.
      //
      // ⚠ THE THIRD CARVE-OUT IS STRUCTURAL, NOT LEXICAL — MKT-28c. A grid
      // signal value of exactly 100 is now left UNMASKED on purpose (it is
      // methodology the free cut keeps), so it reaches this scan as a genuine
      // three-digit run. It is excused by the same __hmSignalValue predicate the
      // mask uses — the label-sibling shape — rather than by allow-listing the
      // string "100", which would also excuse a combination that happened to be
      // 100. This is the one place the assert is permitted to know about the
      // mask, and it is permitted because a divergence here presents as an
      // intermittent abort on the one day a signal tops out.
      if (/^\\d{1,3}$/.test(t) && window.__hmSignalValue && window.__hmSignalValue(el)) continue;
      // THIRD LEXICAL SHAPE — "+N", widened WITH EVIDENCE per this file's own
      // rule (MKT-16, 2026-07-30): the All-Day grid's hit-dot overflow reads
      // "+169" when a pick's draw count tops 3 digits, and six such leaves
      // aborted the first public render. A plus-prefixed run is a COUNT — no
      // surface renders a combination with a + prefix — and draw counts are in
      // the free cut's deliberate keep-class, so the shape is stripped before
      // the scan exactly as "N%" and "N×" are. The public cut is unaffected:
      // the relabel still hides ANY leaf carrying a visible 3-digit run
      // (Q1 absolute), so "+169" never reaches a public frame either way.
      // FOURTH LEXICAL SHAPE — "ENERGY N", widened WITH EVIDENCE (MKT-57,
      // 2026-08-16): the body capture moved to the coffee-mode Home, whose
      // tile renders its energy as ONE leaf "ENERGY 100" (the Slates grid
      // split label and value, which the structural carve-out excused). A
      // labelled energy value is methodology the free cut keeps; a
      // combination never renders behind the word ENERGY. Anchored to the
      // label so it can only ever cancel that one shape.
      const flat = t
        .replace(/\\d{1,3}\\s*%/g, '')
        .replace(/(^|\\s)\\d{1,3}\\s*\\u00d7/g, '$1')
        .replace(/(^|\\s)\\+\\d{1,3}(?=\\s|$)/g, '$1')
        .replace(/(^|\\s)ENERGY\\s+\\d{1,3}(?=\\s|$)/g, '$1')
        .replace(/[\\s\\-·.,{}\\/]/g, '');
      if ((flat.match(/\\d+/g) || []).some(r => r.length === 3)) out.push('leaf: ' + t);
    }

    // ── PASS 1b — MIXED CONTENT (2026-07-30). Pass 1 walks childless leaves,
    // so a run distributed across an element's DIRECT text nodes and children
    // ("100" beside its % span — or, the day markup drifts, a combination
    // rendered the same way) evaded the assert entirely; the MKT-26 addendum
    // demonstrated it benignly with 100% surviving in every modal. This pass
    // runs the SAME lexical rule over the concatenated text of every element
    // that has both element children and digit-bearing direct text nodes. The
    // percent and multiply strips work unchanged on the concatenation — that is
    // exactly why the value+suffix split ("100" + "%") stays excused with no
    // new carve-out to erode.
    for (const el of Array.from(document.querySelectorAll('*'))) {
      if (!el.children.length) continue;
      const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3);
      if (!direct.some(n => /\\d/.test(n.textContent || ''))) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 60) continue;
      // Same three shape strips as pass 1 — the "+N" count carve-out (MKT-16)
      // applies to the concatenation for the same reason "N%" and "N×" do.
      const flat = t
        .replace(/\\d{1,3}\\s*%/g, '')
        .replace(/(^|\\s)\\d{1,3}\\s*\\u00d7/g, '$1')
        .replace(/(^|\\s)\\+\\d{1,3}(?=\\s|$)/g, '$1')
        .replace(/(^|\\s)ENERGY\\s+\\d{1,3}(?=\\s|$)/g, '$1')
        .replace(/[\\s\\-·.,{}\\/]/g, '');
      if ((flat.match(/\\d+/g) || []).some(r => r.length === 3)) out.push('mixed: ' + t);
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

    // ── PASS 3 — PAIR BACKSTOP (2026-07-30). The pair route is the one that
    // reassembles the combination EXACTLY (front 09 + back 94 gives 0-9-4) and
    // until now it was covered by the mask's enumerated spellings with no
    // assert behind them — a two-digit run trips neither pass above, so if the
    // pair markup ever merges into one leaf, the mask's replace runs short and
    // nothing downstream notices. The invariant this asserts is small and
    // post-mask absolute: after masking, NO text mentioning "pair" may still
    // carry a two-digit run. Every sanctioned pair rendering ends up as bullet
    // characters, so a surviving run beside that word is a masked-route failure
    // regardless of which spelling produced it.
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const isLeaf = !el.children.length;
      const hasDigitText = Array.from(el.childNodes).some(n => n.nodeType === 3 && /\\d/.test(n.textContent || ''));
      if (!isLeaf && !hasDigitText) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 200) continue;
      if (!/\\bpair\\b/i.test(t)) continue;
      // Same strips as pass 1: a pair row may legitimately carry a KEPT
      // percentage score beside its masked digits — a percentage is not a pair.
      const flat = t
        .replace(/\\d{1,3}\\s*%/g, '')
        .replace(/(^|\\s)\\d{1,3}\\s*\\u00d7/g, '$1');
      if (/\\d{2}/.test(flat)) out.push('pair: ' + t);
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
