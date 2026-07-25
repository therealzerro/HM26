# Aesthetics & Visual Design — Deep Scope (2026-07-25)

> **Status update (same day):** T0 + T1 green-lit and SHIPPED — see DESIGN-02 in MASTER_AUDIT.md
> (commits `c5e00ee`, `4ee5f88`, `9b72371`, + slice 3). T2 and T3 remain proposed-only.

Method: three parallel audit agents — (1) theme/token layer, (2) consumer screens, (3) admin surfaces + MASTER_AUDIT design-debt history. All findings carry file:line evidence. This document is the synthesis; nothing here has been changed yet except where noted.

**Headline assessment:** the app HAS a real design system (dual-mode palettes with compile-time key parity, shadow/gradient tokens, a shipped 2026-05 polish sprint) — but discipline has eroded around it. Six parallel color systems, six incompatible heat ramps, 4.5% fontSize tokenization, and a handful of live rendering defects. The highest-leverage work is *consolidation*, not new visual invention.

---

## T0 — Correctness fixes (not aesthetics; do regardless)

| # | Item | Evidence | Effort |
|---|---|---|---|
| 0.1 | **Route paywall still headlines the retired "72.4%" verified-rate claim** — the figure BRAND-05 removed from Home for unsound provenance, later shown inflated by BUG-162. Consumer-facing accuracy claim known to be wrong. | `app/paywall.tsx:13-17,128-130` | S |
| 0.2 | **ProposalReviewView renders transparent** — `colors.bg` doesn't exist on ColorTokens (root + confirm-modal panel have no background; dialog floats on scrim), `useSt(colors)` called against zero-arg hook, 3 `SectionTitle` contract violations. All are live tsc errors. | `ProposalReviewView.tsx:67,239-240,249,321,356,398-399` | S |
| 0.3 | **Double headers on all four stack screens** — native Stack header + bespoke in-screen header both render on replay / track-record / paywall; pattern-explorer is the inverse (native only, no in-screen chrome). Pick one pattern (`headerShown:false` + ScreenHeader w/ back slot). | `app/_layout.tsx:88-107` vs `replay.tsx:199`, `track-record.tsx:180`, `paywall.tsx:119` | S |
| 0.4 | **Safe-area gaps** — Account/Book/Learn omit `'top'` edge (content under notch); tab bar hard-codes `height:64` overriding safe-area-aware height (labels in home-indicator zone). | `account.tsx:249`, `book.tsx:282`, `learn.tsx:70`, `(tabs)/_layout.tsx:118-130` | S |
| 0.5 | **Dead component layer** — `SlateCard.tsx` unreferenced AND broken (passes `channel` to SignalBar which takes `label`); `StatusRibbon`, `GeneratedSlates`, `ScopeSwitcher`, `AppModeToggle` orphaned. Delete (keep `NeonSkeleton` — see 1.3). | `SlateCard.tsx:127-131` vs `SignalBar.tsx:16` | S |
| 0.6 | **DashboardView's 8-tile ACTIONS grid is a stale duplicate nav** — missing 11 of 19 destinations incl. Brief, Publish, Analytics. Either regenerate from the NAV array or remove. | `DashboardView.tsx:393-402` | S |

## T1 — System coherence (high impact, small/medium effort)

| # | Item | Evidence | Effort |
|---|---|---|---|
| 1.1 | **One heat/temperature scale.** Six ramps with different thresholds AND stops — the same energy score reads HOT on grid, WARM in list, grey in ZK30. Export a single `heatTier(energy)` from the theme; all surfaces consume it. This is the app's core visual signal. | `index.tsx:71`, `EnergyMeter.tsx:21`, `PickCard.tsx:59`, `SlateCard.tsx:51`, `HeatCheckModal.tsx:55`, `zk30/types.ts:95` | M |
| 1.2 | **Tab bar mode parity** — the most-seen chrome hard-codes neon rgba (cyan pill, purple hairline) that don't flip in light mode. Tokenize the three literals. | `(tabs)/_layout.tsx:34,36,120` | S |
| 1.3 | **Wire `NeonSkeleton`** (166 lines, shimmer, reduce-motion, currently 0 imports) into Slates (which fakes six `'---'` cards with NO loading state), Home, Results, Track Record. Add error surfacing to `useSnapshot` (currently a failed fetch is indistinguishable from an empty slate). | `NeonSkeleton.tsx`, `explore.tsx:76,239-244`, `useSnapshot.tsx:224` | M |
| 1.4 | **Token additions where drift is worst:** `SectionTitle` consumer primitive (7 live variants), `borderRadius.sheet` (3 sheet radii), an **opacity/alpha token scale** (271 `color+'55'`-style suffix hacks, 29 distinct alphas — also malformed on rgba tokens), and the never-built `SessionFilter` component (design.md step 5). Enforce on new code; migrate worst offenders opportunistically. | agent 1 §1-2, `design.md:39` | M |
| 1.5 | **Analytics panels data-viz pass** (our newest surface, currently plain text): diverging ratio bar with 1.0× baseline in PatternStats, count bars on jurisdiction footprint, mono font on the Observed/Expected/Ratio big stats. | `PatternStatsPanel.tsx:137-149`, `FootprintPanel.tsx:124-139,176-185` | M |
| 1.6 | **SignalBar fixed 60px track** never scales with card width. Make it flex. | `SignalBar.tsx:20,74` | S |
| 1.7 | **Touch-target pass:** Results replay chevron/share/session pills, Slates view toggle, Book star/delete — all under 44pt, mostly no hitSlop (9 files repo-wide use hitSlop). | `results.tsx:1097,1133-1143`, `explore.tsx:685`, `book.tsx:519-542` | S |

## T2 — Experience upgrades (medium/large)

| # | Item | Evidence | Effort |
|---|---|---|---|
| 2.1 | **Consumer motion pass** — Reanimated is installed, consumer usage is zero. Cross-fade on Slates tab/view-mode swaps, animated expand on Results inline replay, accordion animation (Account/Learn), count-up on Home hero + track-record stats, staggered card reveal. Respect existing `useReduceMotion`. | `explore.tsx:403-405,456,531`, `results.tsx:818-831`, `account.tsx:564`, `learn.tsx:172` | M-L |
| 2.2 | **Screenshot-grid headroom** — ~255pt of chrome above the 2×3 grid leaves ~100pt/tile on 667pt devices (zero margin; overflows when LastHitPill renders). Fold timestamp/view-toggle into header, hide LastHitPill in grid mode, drop `'bottom'` safe-area edge. Grid stays out of ScrollView (UX-57 rule untouched). | `explore.tsx:322-383,671-682` | M |
| 2.3 | **Admin nav 2.0** — 19 flat chips, ~14 undiscoverable (no overflow cue, no scroll-into-view, no grouping, weak active state, no persistence, `image-export` chip silently behaves differently). Suggest: group chips into 4 domains (Pipeline / Engine / Growth / Reporting) w/ section separators + scroll-into-view + persist last view; or two-tier (domain row → view row). | `admin.tsx:37-57,96-105` | M |
| 2.4 | **Brief PNG capture-grade** — pin export width (sibling pipeline pins 1080), real monospace in `Mono()` (DES-02 regression — digit columns misalign), brand mark, ≥9pt floor, `maxFontSizeMultiplier`, dedupe BriefCard/FullBriefCard constants, capture-in-progress overlay. | `BriefView.tsx:267-431`, `captureExportImage.ts:216` | M |
| 2.5 | **PublishView step indicator** — 5-step wizard with no stepper; ImportWizardView already has the pattern to copy. | `PublishView.tsx:778-947` vs `ImportWizardView.tsx:493-508` | S |
| 2.6 | **Consolidate the two paywalls** (modal `components/Paywall.tsx` vs route `app/paywall.tsx` — different plans, CTAs, copy) into one implementation. Bundles with 0.1. | both files | M |
| 2.7 | **Light-mode contrast sweep on CTAs** — `colors.text`-on-accent buttons (dark ink on purple in light), white-on-`#ffcc00` badge (worst pair in app), dark-only rgba chips on white poster cards. | `account.tsx:713-717`, `paywall.tsx:344-398`, `SlatePosterCard.tsx:220-260` | S-M |
| 2.8 | **Admin Analytics view chrome** — our new view has zero admin framing (no st.title header, foreign chip system). Give it the standard header + fold `analyticsShared.Chip` into the admin segment idiom (one of five competing chip styles today). | `AnalyticsView.tsx`, agent 3 §A2 | S |

## T3 — Bigger bets (large; some revive parked items)

| # | Item | Notes |
|---|---|---|
| 3.1 | **Light-mode Phase 3 signal-hue design pass** — THE parked blocker (DESIGN-01): WCAG-AA variants of the 5 signal hues on `#f7f5fb`, card-surface strategy decision, ~40-file literal cleanup, StatusBar scheme-awareness. NOT light-mode-wholesale (explicitly rejected 7/23) — this is the designed path that was always intended. The 25 invisible "glass" rgba overlays (PickDetailModal etc.) belong to this pass. |
| 3.2 | **Iconography policy** — 642 emoji-as-icons alongside a complete lucide set, mixed within single rows; heat scale mixes untintable emoji (🔥⚡) with tintable dingbats (✦◈❄). Suggest: lucide-only on consumer surfaces (brand-serious "data intelligence" look), emoji stays on admin (it works there). Decide once, then chip away. |
| 3.3 | **Typography normalization** — 888 numeric fontWeights incl. 294 `'900'` with no loaded 900 face (render inconsistency); 3 mono spellings (`monoBold` token / raw `'JetBrainsMono_700Bold'` / `'monospace'`); 1441 fontSize literals vs 17 size tokens of which the semantic half has 0 usages. Prune token set to what's real, map weights to loaded faces, adopt in new code. |
| 3.4 | **EngineConfigView findability** — 1072 lines, 10 sections, one flat scroll, no anchors/collapse/search. Section jump-chips or collapsibles. |
| 3.5 | **Glass strategy** — no blur exists anywhere; "glass" is faked with white rgba that vanishes in light mode. Either adopt expo-blur where it matters (pick-detail flow) or replace with tokenized borders/tints that survive both modes. |
| 3.6 | **ZK30 palette integration** — third palette, hardcoded, not mode-aware; CO channel is purple in ZK6 and blue in ZK30. Already deferred to "v2.0 public launch" (ARCH-06) — leave parked until ZK30 work resumes, but the CO hue conflict is worth resolving whenever ZK30 reopens. |

## Standing constraints honored (not re-proposed / not contradicted)

- 2×3 grid stays out of ScrollView (UX-57 screenshot rule) — 2.2 works around it.
- Light-mode **wholesale** rejected 7/23 — 3.1 is the parked Phase-3 pass, a different thing.
- Intelligence stays off the public tab bar; mode-picker stays removed; no workflow auto-scheduling.
- `shadows.soft` deprecated → `shadows.glow`; MATCH/BOX MATCH/STRAIGHT MATCH vocab locked; tier names Seeker/Oracle+/Mystic locked; PickDetailModal INTEL/PAIRS/PLAY structure locked.
- Consumer surfaces are propose-only: every T-item touching `app/(tabs)/*` consumer files, paywall, or components in the brand-lint scope ships only on explicit operator approval, item by item.
- Parked list (20 items) from MASTER_AUDIT excavation preserved in agent report; items 0.1 (72.4% claim ≈ backlog §4b adjacent), 2.4 (micro-type pass = deep-scope item 9), and 3.1 (DESIGN-01) intentionally overlap existing backlog entries rather than duplicating them under new names.
