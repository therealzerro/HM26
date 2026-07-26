# Number Book (+ Learn) Redesign — Deep Scope (2026-07-26)

> Operator request: "propose a full, more UI-friendly Number Book / learning-systems screen —
> it is currently ugly and confusing." Consumer surface → scoped only; ships on green-light.
> **Status: SHIPPED 2026-07-26 (green-light same day; §5 decisions ratified: A = states
> picker shipped, B = stays free + "Pro exclusive" claim softened, C = sample list kept).
> Validation: filtered tsc 0 · eslint 0 on touched files · check:brand-voice 0. Shipped
> alongside: DrawTicker schedule refresh (AZ Midday 2:29 PM added — new drawing; AZ Evening
> 9:45→8:45 PM; MS Midday 1:29→3:15 PM; MS Evening 7:29→10:00 PM — verified vs the 7/26
> Lottery Post capture) and pattern-explorer `?combo=` prefill for Book deep-links.
> Remaining: operator device walkthrough (light + dark) of Book index/detail, Learn, and
> the states picker.**

## 1. Diagnosis — why it feels ugly and confusing

The root cause is structural, not cosmetic: **`book.tsx` is a desktop master-detail layout
rendered on phones.** Everything else is a symptom of squeezing around it.

| # | Problem | Evidence |
|---|---------|----------|
| 1.1 | **Fixed 220px sidebar, always visible** (`book.tsx:586`). On a 390pt phone the content panel gets ~170pt; a combo row must fit star + 20pt digits + comboSet + note/match chip + heat button + delete in that width. Nothing has room; everything shrinks to 9–11pt. `learn.tsx:211` has the identical pattern at 230px. | The single biggest "ugly" driver |
| 1.2 | **Upsell noise ×3.** The COMING SOON feature set renders three times: sidebar list (`book.tsx:362`), welcome grid (`:393`), and *again under every working list* ("COMING FEATURES FOR THIS LIST", `:554`). A user managing their numbers scrolls past a 4-card ad grid every time. | Confusing: tool vs brochure |
| 1.3 | **Emoji iconography** (📖 ☀️ 🌙 ◈ ⭐ 🎓 ✦ 🎯 🔍, `×` text glyphs as delete buttons) — violates the DESIGN-02 adopted policy: lucide-on-consumer, emoji-on-admin. Only `EmptyState` uses lucide. | `book.tsx` throughout |
| 1.4 | **Dead affordances.** `states: string[]` exists in the data model but there is **no UI to set it** — every list permanently shows an "All States" tag (`:466`); the upsell promises "organize by state" (`:408`) which cannot be done. The only stateful list possible is the hardcoded sample (`states: ['NY']`, `:210`). | Promised feature, no path to it |
| 1.5 | **Pro-claim mismatch.** Welcome hero says "Number Book is Pro exclusive" (`:407`) but the screen has zero role gating — free users can create/edit lists freely. Either the claim or the behavior is wrong. | `useAuth` never imported |
| 1.6 | **The best feature is buried.** `useSavedHits` (30d personal match history) is this screen's real value — and it renders as a 12pt banner + a 10pt per-row chip. No sort-by-matches, no per-list match rate, no link to Pattern Explorer (ENH-ANALYTICS-01 already computes full footprint history for any set). | `:483-498`, `:527-533` |
| 1.7 | **Touch targets.** Star/delete/heat are 10–16pt text glyphs with nested Touchables inside the row Touchable; sidebar delete `×` is 16pt text (`:313`). | Multiple sub-44pt targets |
| 1.8 | **Primitive drift.** Bespoke 9pt section labels instead of `SectionTitle`; no `ScreenHeader`; scope chosen with custom buttons instead of `ScopeSegment`; scope colors via local `scopeColor()` duplicating `scopeAccent()`. | `:591`, `CreateListModal` |
| 1.9 | Minor: Add-from-Slate queries `mode=neq.zk30` (`:263`) where every other consumer read uses `mode=eq.balanced` — works today, drifts tomorrow. | one-line fix |

Not broken (keep): AsyncStorage persistence model, saved-slates read-only records from
`explore.tsx:317`, HeatCheckModal integration, `useSavedHits`, brand-voice-compliant copy
("signals", "MATCH"), LIGHT-01 annotations already in place.

## 2. Proposal — Book 2.0, mobile-first single pane

Kill the sidebar. Standard stacked navigation, both screens:

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ ScreenHeader: "Number Book"  │    │ ← My Book      [＋ Add ▾]    │
│  subtitle: 3 lists · 14 nums │    │ ● NY Evening Signals         │
├──────────────────────────────┤    │   evening · 6 numbers        │
│ MY LISTS                     │    │ ┌──────────────────────────┐ │
│ ┌──────────────────────────┐ │    │ │ 30-DAY ACTIVITY          │ │
│ │ ● NY Evening Signals     │ │    │ │ 4 matches · 3 signals    │ │
│ │   6 numbers · ✦ 4 matches│ │ →  │ │ last: NY evening · 2d    │ │
│ └──────────────────────────┘ │    │ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │    │ ┌──────────────────────────┐ │
│ │ ◐ Midday Workbench       │ │    │ │ ★ 428   {2,4,8}    ⚡72  │ │
│ │   5 numbers · quiet 30d  │ │    │ │   MATCH · NY eve · 2d ago│ │
│ └──────────────────────────┘ │    │ │              [heat] [⋯] │ │
│ SAVED SLATES                 │    │ └──────────────────────────┘ │
│ ┌ ⭑ Jul 22 evening slate ─┐  │    │ ┌──────────────────────────┐ │
│ WHAT'S NEXT (1 compact card) │    │ │ ☆ 069   {0,6,9}          │ │
│ 🎓→ Learn Center (1 card)    │    │ │   spread combo   [heat][⋯]│ │
└──────────────────────────────┘    └──────────────────────────────┘
        Index screen                       List detail screen
```

- **T1.1 Navigation:** two views in one route (index ⇄ detail with back), same in-file
  pattern `learn.tsx` already uses (`activeId` state) — no new routes needed; just stop
  rendering both panes at once. Full-width content at every step.
- **T1.2 Adopt primitives:** `ScreenHeader` on both views, `SectionTitle` for section labels,
  `ScopeSegment` in the create/edit modal, `scopeAccent()` for list identity (delete local
  `scopeColor`). Lucide icons replace all emoji (Star, Trash2, Flame, Search, GraduationCap,
  MoreVertical…), ≥44pt targets, overflow menu (⋯) for star/delete instead of three inline glyphs.
- **T1.3 Promote match intelligence:** 30-day activity card at the top of list detail
  (matches, signals matched, last match with state+session); rows with matches sort-pinnable
  or badge-first; row chip links to HeatCheck (existing) and, for Pro, "Full history →"
  into Pattern Explorer footprint search (deep-link with the combo prefilled).
- **T1.4 One upsell, one place:** COMING SOON collapses to a single compact "What's next"
  card at the bottom of the index. It disappears entirely from list detail. Welcome/empty
  state becomes onboarding (create + sample) with at most one Pro line.
- **T1.5 Combo row redesign:** 24pt monoBold digits, comboSet in mono, note *or* match line
  (never both fighting for one line), optional energy chip via canonical `heatTier`.
- **T2 Learn Center same treatment:** module list → detail as stacked views, lucide icons,
  `ScreenHeader`; content untouched (copy is fine and brand-compliant). Keeps its entry
  card on the Book index (it lost its tab slot to ZK30).

## 3. Explicitly out of scope

- No engine contact, no new tables, no cloud sync for lists (AsyncStorage stays; sync is a
  separate ENH if ever wanted). Neutral-by-design — no metric watch window.
- No change to saved-slate immutability, HeatCheckModal internals, or Pattern Explorer.
- No tab-bar changes; no paywall copy changes beyond deleting the duplicated grids.
- Brand voice: all copy edits pass `npm run check:brand-voice`; existing compliant vocab kept.
- LIGHT-01 invariants preserved: token-only colors, dark scrims stay, `#fff`-on-accent labels
  keep their annotations; dark AND light walkthrough in QA.

## 4. Tiers & effort

| Tier | Content | Effort |
|------|---------|--------|
| T0 | Quick defects shippable alone: dedupe COMING SOON to one instance, fix touch targets, `neq.zk30` → `eq.balanced`, drop "All States" tag when `states` empty | S (~1-2h) |
| T1 | Book single-pane relayout + primitives + lucide + match-intel promotion + row redesign (§2) | M-L (~4-6h) |
| T2 | Learn Center same relayout | S-M (~2-3h) |
| T3/QA | Light+dark device walkthrough both screens, System/Light/Dark flip, filtered `tsc` = 0, brand-voice scan clean | S (~1h) |

Risk: low — screen-local UI, no shared-component API changes; heaviest edit is deleting
layout code. `useSavedHits` and storage schema untouched (existing lists survive as-is).

## 5. Operator decisions needed before T1

- **A — `states` field:** (1) ship a minimal state multi-select in create/edit (chips; data
  model already supports it; makes the existing tags real and pre-builds Slate-by-State), or
  (2) hide all state UI until Slate-by-State ships. **Recommend (1)** — small, kills a dead
  promise.
- **B — Pro claim vs gate:** (1) actually gate Number Book behind Pro (`PremiumGate` exists,
  matches the upsell claim), or (2) keep it free and soften the upsell copy to "Pro unlocks
  Slate by State + 4-digit". **Recommend (2)** — the tool is a retention surface; gating it
  now shrinks the funnel and the claim is the only thing that's wrong.
- **C — welcome sample list:** keep "NY Favorites (sample)" as-is, or seed it from today's
  saved-slate mechanism instead of hardcoded combos. **Recommend keep** — cheap and honest;
  just label combos "sample" (already done).
