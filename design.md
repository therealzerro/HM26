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
| 2 | `theme.layout.screenInset` + every screen sources from it | 15 min | ⏳ pending | Content edges align across screens. Subtle but registers as "professional." |
| 3 | `<ScreenHeader>` extracted, three screens adopt | 45 min | ⏳ pending | Headers become true siblings. Results' gradient-overpaint bug fixed in passing. |
| 4 | `<HitBadge>` + `<HitCard>` extracted, used in 4+ places | 45 min | ⏳ pending | The hit moment reads identically everywhere. |
| 5 | `<FreshnessLine>` extracted, three screens adopt | 20 min | ⏳ pending | Slate's operator-style strip retires; everywhere shows the same subscriber-voice line. |
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
