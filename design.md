# HitMaster — Design Consistency Repair

**Date opened:** 2026-05-13
**Scope:** Home, Slate (Explore), Results — the three forward-facing subscriber screens
**Goal:** Make these screens look like siblings instead of cousins by extracting the shared primitives that already exist visually but not structurally. No new aesthetics, no redesign — just the small contracts that prevent future drift.

---

## Diagnosis (from the 2026-05-13 deep audit)

Each screen is internally coherent. The discomfort comes from the **seams between them** — every primitive that lives in more than one place has at least two visual incarnations, and there is no shared component layer enforcing consistency. Cosmetic patching screen-by-screen would land us back here in three months when the next contributor adds a fourth variant.

The fix is **structural** (extract shared components), not cosmetic.

### Root causes identified

1. **Every primitive has multiple visual incarnations.** Scope tabs (3), header chrome (3), freshness display (3), hit indication (4), card border radius (4), top-right action (3), color token access (2).
2. **The horizontal grid is not standardized.** Content edges drift between 12px / 14px / 16px / 14px depending on which screen you're on. Results is even internally inconsistent (header at 16, cards at 12).
3. **The hit moment has four visual languages.** The single most emotionally-loaded UI element renders differently on every surface.
4. **The chrome contract is implicit.** Each screen's top 80px contains different things in different shapes.
5. **Token discipline is partial.** Theme defines `borderRadius.card = 16`, but Home uses literal `12/14/22`. Theme has every semantic color named, but Results defines its own `D` alias map that confuses readers and silently breaks grep.

---

## Build plan — 6 shared primitives + 3 token additions

Each component is < 80 lines. Each step is independently shippable. Total estimated effort: **~3 hours**.

### Components

| # | Component | Replaces | Used on |
|---|---|---|---|
| 1 | `<ScopeSegment>` | Home `scopeRow`, Home coffee inline scope tabs, Slate `scopeBigRow` | Home (×2), Slate |
| 2 | `<ScreenHeader>` | three distinct header variants | Home, Slate, Results |
| 3 | `<HitBadge>` + `<HitCard>` | 4 separate inline hit styles | Home, Slate, Results, PickCard, Number Book |
| 4 | `<FreshnessLine>` | three timestamp displays | Home subtitle, Slate strip, Results subtitle |
| 5 | `<SessionFilter>` | Results `filterBtn` row | Results only — uses same accent token as `<ScopeSegment>` so they visually rhyme |

### Token additions to `constants/theme.ts`

```ts
theme.layout.screenInset = 16
theme.borderRadius.heroCard = 12       // for stat row / info cards
theme.borderRadius.card = 14           // keep alias for general cards
```

---

## Build order (each step independently shippable)

| # | Step | Effort | Status | Visible delta |
|---|---|---|---|---|
| 1 | `<ScopeSegment>` extracted, used on Home (both modes) + Slate | 30 min | ✅ shipped | Home normal mode gets the gold/purple/cyan per-scope accent treatment. **Largest visible win.** |
| 2 | `theme.layout.screenInset` + every screen sources from it | 15 min | ✅ shipped | Content edges align across screens. Subtle but registers as "professional." |
| 3 | `<ScreenHeader>` extracted, three screens adopt | 45 min | ✅ shipped | Headers become true siblings. Results' gradient-overpaint bug fixed in passing. |
| 4 | `<HitBadge>` + `<HitCard>` extracted, used in 4+ places | 45 min | ✅ shipped | The hit moment reads identically everywhere. |
| 5 | `<FreshnessLine>` extracted, Home + Slate adopt; Results unchanged (its subtitle is date-context, not freshness) | 20 min | ✅ shipped | Slate's operator-style strip retires; Home + Slate now show the same subscriber-voice freshness line. |
| 6 | Drop `D` alias map in Results; hardcoded radii → tokens | 30 min | ⏳ pending | Refactor only; no visual change. Future contributors must use the design system. |

---

## Hard constraints (things we explicitly will not do)

- **Don't merge Home and Slate.** They overlap in content but they're different verbs: Home is "what's today" (passive scanning), Slate is "let me dig in" (active filtering + view modes). The duplication is a feature.
- **Don't unify Results' session filter with the scope tab.** Sessions are a different concept (5 keys including morning/night for non-Pick3 draws). They share the accent token but keep distinct shapes (pill vs segment).
- **Don't redesign anything.** Every individual screen's design is good. This is purely about extracting primitives, not changing aesthetics.

---

## Change log

Each step gets a one-line entry below as it ships, with the commit hash.

- 2026-05-13 — Step 1 — `components/ScopeSegment.tsx` extracted. Home normal mode + Home coffee mode + Slate `scopeBigRow` all now consume the shared component. Two `size` modes: `compact` (Home normal, fits in header) and `tall` (Slate, Home coffee — screenshot-prominent). Old `s.scopeRow / scopeBtn*` styles removed from Home, `s.scopeBigRow / scopeBigBtn / scopeBigText` removed from Slate (replaced with `scopeBigRowWrap` which preserves the surrounding band).
- 2026-05-13 — Step 2 — `theme.layout = { screenInset: 16 }` added. Every screen-edge inset on Home, Slate, Results now sources from it. Slate went from `14` → `16` (statusStrip, header, tabBar, scopeBigRowWrap, scopeMetaRow, listContent); Results went from `12` → `16` (dateTabsContent, controlsRow, searchRow, card, sectionHeader). Internal card padding (lossCard inner, modal styles, date pill paddings) left at their existing values — they're not screen-edge insets. Net visible delta: content edge is now identical across all three screens.
- 2026-05-13 — Step 3 — `components/ScreenHeader.tsx` extracted. Unified contract: LinearGradient (`theme.gradients.header`) + title row (title/subtitle on left, rightSlot on right) + optional children inside the gradient. Home, Slate, Results all adopted. Slate now gets the same gradient treatment as the other two (was flat `bgElevated`). Results' opaque-`backgroundColor` overpaint bug fixed in passing (gradient is no longer hidden). Title size unified to 22pt across all three (was 24 on Home). Old `s.header / s.headerTop` styles purged from all three screens.
- 2026-05-13 — Step 5 — `components/FreshnessLine.tsx` extracted. Auto-derives the freshness line from the snapshot: fresh = `ZK6 v2.0 · slate generated 11:43 AM ET`; stale = `🟡 Engine inputs last refreshed 2h ago` (warning yellow tint); empty = `ZK6 v2.0`. Home's `engineFreshness` useMemo deleted, Slate's `statusStrip` (🟢 LIVE · time · ago · #hash) retired entirely. Both screens now use `<FreshnessLine snapshot={snapshot} />` as the header subtitle. Results' header subtitle (`date · N draws · M 🎯`) intentionally not changed — it carries date-context, not engine freshness; merging the two would lose meaning. Operator-grade data (live-dot, hash) is no longer subscriber-facing; still available via storage flags / admin tab.
- 2026-05-13 — Step 4 — `components/HitBadge.tsx` and `components/HitCard.tsx` extracted. HitBadge = the gold/cyan pill (⭐ STRAIGHT / 🎯 BOX) used inside HitCard and reusable elsewhere. HitCard = self-contained gold-tinted row with [badge] [combo] [state · session emoji] layout. Used by Home's "Today's Hits" section and Slate's "Today's hits" tab — previously two separate inline implementations. Visual change: Home's outer gold card wrapper retired; each row is now its own gold card (matches Slate's pattern). Sessions emoji unified to include morning/midday/evening/night via `sessionEmoji()` helper inside HitCard. Left as-is intentionally: Home's `hitBanner` (special cyan celebratory hero), Slate's §5.1 cross-scope hit feed (scope-accent identity, not gold), Results' inline `hitBadge` (sentence-style annotation inside draw row), PickCard's own hit banner (full-width banner inside a pick card). Those each have a distinct visual job and don't fit the standalone-row pattern.
