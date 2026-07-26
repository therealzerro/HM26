# Light-Mode Signal-Hue Pass — Scope (2026-07-26)

> DESIGN-01 Phase 3 completion / DESIGN-02 item 3.1. Scoped 2026-07-26 (palette verification +
> full consumer-file inventory). **Status: proposed — awaiting operator green-light + two decisions (§4).**

## 1. Status correction — this is much smaller than the books say

DESIGN-02's 3.1 line and the DESIGN-01 audit row describe two blockers: "design WCAG-AA variants
of the 5 signal hues" and "decide the card-surface strategy". **Both are already resolved at the
token layer** (verified against the live code 7/26, not taken from doc claims):

- `lib/theme/palettes.ts::lightColors` has had **white cards** (`card:'#ffffff'`) and darkened
  signal-hue variants since before the 7/25 scope; DESIGN-02 T3 finished tuning every hue to
  ≥4.5:1. Ratios independently recomputed 7/26 (WCAG 2.x relative-luminance math, not trusted
  from comments): all pass on both `#f7f5fb` and `#ffffff`. One footnote: `cold` `#6c7278` is
  exactly at the 4.50 line — nudge one step darker for margin (§3, T0.6).
- The ~73-file `useTheme()` code migration finished 2026-05-15. The inventory found **zero**
  remaining dark-singleton `theme.colors.*` reads in consumer files — with **one exception**
  (`lib/scopeAccent.ts`, the biggest finding, below).
- Gradients, shadows, and StatusBar are already mode-aware.

What actually remains is a **defect-fix + cleanup pass**, not a design project: ~24 files with
~60 live literals (plus ~10 vetted `#fff`-on-purple button labels that are correct as-is),
one helper fix, and two operator decisions.

## 2. T0 — Real light-mode defects, visible today (S each; ~2-3h total)

| # | Defect | Evidence |
|---|---|---|
| 0.1 | **`lib/scopeAccent.ts` imports the dark singleton** and returns neon `#ffd93d`/`#9b5bff`/`#2bffcc` regardless of mode — washed-out scope tints on 4 high-traffic surfaces. Fix: `scopeAccent(scope, colors)` mirroring `heatTier`'s shape; 4 call sites (`index.tsx:803`, `explore.tsx:528`, `track-record.tsx:237`, `ScopeSegment.tsx:49`). | The one remaining singleton leak in consumer scope |
| 0.2 | **NeonSkeleton shimmer** hard-codes dark purple at 18/28% alpha — a violet haze on `#f7f5fb`. Loading states on every screen. | `NeonSkeleton.tsx` |
| 0.3 | **Close buttons / fills invisible on light:** `rgba(255,255,255,.10/.20)` close buttons in HeatCheckModal + PickExplainerModal; `rgba(255,255,255,0.04)` compare-row fill in account.tsx. | Cat-3 inventory |
| 0.4 | **Digit ink breaks on tinted cells:** `'#ffffff'` digits on non-solid tinted cells in HitHeroBand + HitReplay; `'#0a0613'` ink counterparts. Use `colors.text`/tokens. | Cat-2/3 inventory |
| 0.5 | **PickDetailModal active-tab tint** uses dark-cyan `rgba(43,255,204,0.04)` instead of the mode's cyan. | `PickDetailModal.tsx` |
| 0.6 | **`cold` token margin:** `#6c7278` = 4.50 vs bg (exactly at AA). Nudge to ~`#686e74`. | Recomputed 7/26 |

## 3. T1 — Cleanup sweep + heat-ramp stragglers (M; ~4-6h)

- **Signal-hue literals (8 files, ~21):** PublicExportBanner, PickPosterCard, PickCard (silver/
  bronze medals — keep as literal metals, they're not signal hues; just verify contrast),
  SlatePosterCard, NeonSkeleton (T0.2), PickDetailModal (T0.5), analyticsShared fallback.
  Export-surface literals wait on Decision A.
- **Dark backdrops (18 files, ~27):** modal **scrims stay mode-locked dark** (normal UX; a dark
  scrim over a light page is correct) — annotate, don't churn. The genuine fixes are card/surface
  fills (HitReplay, poster cards pending Decision A) and `shadowColor:'#000'` in InfoTooltip/
  Toast → `useShadows()`.
- **White fills/borders (16 files, ~41):** ~half are vetted `#fff`-on-accent button labels
  (correct in both modes — annotate as such); fix the rest (T0.3/0.4 cover the worst).
- **Signal-hue `shadowColor` glows** (PickPosterCard, SignalBar): neon glow reads as a colored
  smear on white — gate glow shadows on `scheme === 'dark'` or use neutral light shadows.
- **Heat-ramp stragglers (finishes DESIGN-02 T1.1):** `pickVisuals.tsx::EnergyArc` and an inline
  duplicate in `PickPosterCard.tsx:49-51` still use a 6th ramp (90/75/60) instead of canonical
  `heatTier` (90/80/65/45). Consolidate both.

## 4. T2 — Operator decisions needed (blocking parts of T1)

**Decision A — export/poster surfaces: mode-locked dark, or theme-following?**
4 surfaces render content designed for screenshots/sharing:
- `SocialBriefCard` + `PublicExportBanner` — already fully mode-locked dark (own palettes, no useTheme).
- `PickPosterCard` + `SlatePosterCard` — **accidentally mode-aware**: in light mode they'd
  produce *light* posters, inconsistent with the other two and with the brand's cosmic-dark
  share aesthetic.
**Recommendation: mode-lock all 4 to the dark palette** (a poster is a branded artifact, not a
UI surface; screenshots stay uniform regardless of the operator's phone theme). Implementation:
freeze the two poster cards on `darkColors` (one-line palette pin each); keeps their gold-lock
literals legitimate.

**Decision B — acceptance criterion.**
Original DESIGN-01 bar: "beta testers explicitly approve light mode is usable." Options:
(a) keep the beta-tester bar (needs testers in the loop), or (b) operator device walkthrough of
every consumer screen in light mode as the closing gate, beta feedback collected passively.
**Recommendation: (b)** — the beta channel has been quiet since May; don't block a defect-fix
pass on it.

## 5. T3 — QA close-out (S; ~1-2h)

Screen-by-screen light-mode walkthrough (Home, Slates list+grid, pick detail, Results, replay,
Track Record, Book, Learn, Account, paywall, pattern-explorer, coming-soon) + toggle test
(System/Light/Dark flip without refresh; survives restart) + dark-mode regression glance
(dark output should be bit-identical — all changes are light-side or token-side).

## 6. Explicitly out of scope

- Admin surfaces (`intelligence.tsx` has 8 `'#fff'` literals — same disease, admin is exempt) and zk30 (ARCH-06).
- Changing the default theme (stays System) or any "wholesale light" push — rejected 7/23; unchanged.
- SocialBriefCard palette (deliberately frozen — brand surface).
- New blur/glass work (DESIGN-02 3.5 stands parked).

## 7. Effort & risk

~1 focused session total: T0 ≈ 2-3h, T1 ≈ 4-6h, T3 ≈ 1-2h. All neutral-by-design (no engine
contact, no metric watch window). Risk concentrated in the `scopeAccent` signature change
(4 call sites, tsc-guarded) and glow-shadow gating (visual only). Dark mode should be provably
unchanged; light mode changes are the point.

## 8. Inventory reference (full counts)

24 files need literal edits · 30 files are token-only and inherit the palette with zero edits ·
4 export surfaces pending Decision A · 1 helper (`scopeAccent`) + 2 heat-ramp stragglers.
Per-file counts live in the 7/26 inventory (agent sweep, category tables preserved in the
scoping session); top offenders: SocialBriefCard 20 (frozen), HeatCheckModal 6, book.tsx 6,
index.tsx 7, PickPosterCard 6.
