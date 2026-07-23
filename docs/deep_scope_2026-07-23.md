# Deep Scope — 2026-07-23 (edge / signals / UI / FB group posting)

Three parallel read-only audits run 6:47–7:15am ET while the operator was away. Nothing was
edited, posted, or written to the DB. Spot-verified claims are marked ✅ (checked at the cited
line by the main session); everything else is agent-reported and should be re-verified before
acting. Hit rates below were computed faithfully (slate JSON ∩ histories), never from stored flags.

---

## Part 1 — Facebook GROUP posting with least steps (the #1 ask)

### Reality constraints (verified in code + platform policy)
- **Meta removed the Groups API (April 2024).** No programmatic posting, no scheduling, no
  queueing for groups — ever. Anything "automated" would run a bot on a user account, a ban
  risk fatal to an already twice-de-recommended presence. The page lane (real API + scheduling)
  is brand-only per the tier map, so slates can't go there.
- **The unremovable floor inside Facebook is ~4–5 taps:** pick group → paste caption → attach →
  Post. Caption prefill is prohibited by Meta policy; clipboard-copy is the max legal assist.
- Current mechanism (`components/admin/PublishView.tsx`, ~995 lines): caption → clipboard,
  8 images captured from a hidden DOM stage (`lib/captureExportImage.ts` — **web-only**, never
  works in a native build), Web Share API to the FB app on mobile / sequential downloads +
  window.open on desktop, handoff logged to `social_posts` via `fb-publish log_assist`.
- Usage reality: the group handoff has been logged **exactly once** (2026-07-09, ship day).
  The step count is above the operator's tolerance — that's the problem statement.

### Step count today (best path: QUICK POST preset + Share All)
- **Mobile browser: 13 taps** (14 evening) + ~15–30s image build + share-sheet wait.
  5 of the in-app taps are pure navigation (Account tab → triple-tap avatar → Publish).
- **Desktop: ~11–12 actions** including the worst part — 8 loose PNGs into the Downloads
  folder, then a drag into the FB composer, every day.
- Second group (Pro) nearly doubles it: full re-build + second handoff.

### Ranked proposals (before → after)
| # | Change | Effort | Mobile taps | Notes |
|---|--------|--------|------------|-------|
| **P1** | **Deep-link preset autorun** — `admin.tsx` accepts `?view=publish&preset=free_slate&session=midday`; PublishView auto-applies preset on mount; operator saves one home-screen bookmark per routine post | **S** | **13 → 7** | ✅ verified `admin.tsx` has no param handling today; auto-build machinery already exists (`PublishView.tsx:275-287`) |
| **P2** | "Next: Pro Group" chained handoff — after free-group share, 1 tap regenerates caption only, reuses captured images, reopens share sheet | S | 2nd group ~8 taps + 30s → 1 tap, no rebuild | Same file only |
| **P3** | Single composite image option (one tall PNG instead of 8) + desktop clipboard-paste of the PNG | M | Desktop loses the Downloads dance entirely | Also fixes share-sheet size limits |
| **P4** | Auto-prep kits at Daily Workflow completion; "Share to Free/Pro Group" buttons in the Done banner | M-L | Post-workflow: 1 tap → share sheet, zero wait | Requires extracting capture logic out of PublishView |
| — | Do NOT build: scheduled/headless group posting (policy-impossible + no-auto-crons rule), auto-firing share sheet (needs user gesture) | | | |

**Single recommended build: P1 + the brand-safety hard-gate below.** ~7 taps is within 1–2 of
the physical minimum. P2 is the natural follow-up in the same file.

### Brand-safety gaps found in the group lanes (report §4)
1. ✅ **Group/cross share buttons don't block on lint.** Page publish hard-gates on `lint.ok`
   (`PublishView.tsx:431`), but `shareAllToFacebook` / `prepAndOpen` / `copyCaption` have no
   check — violations render as warnings while the buttons stay live. Cross-post lane (tier 3,
   STRICT) is the worst case. Fix is ~5 lines + the existing `override_used` logging pattern.
2. Two-Question filter ack renders only in the API (page) lane; the brief mandates it for
   cross-posts too.
3. AI captions for groups get no server-side lint (`ai-content` prompt-only; `fb-publish`
   tier-1 lint runs only for page posts).
4. Clean: deterministic caption templates use approved MATCH vocab; pricing correctly limited
   to the free group; page lane fully gated.

---

## Part 2 — Edge / signal scope (clean era 2026-06-10 → 2026-07-22, 43 slates/scope)

All picks in the clean era were singles in every scope (no multiplicity confound). Analytic
per-pick baselines: midday ~17.5%, evening ~22.2%, allday ~35.8%.

### Ranked candidates
1. **Midday rank inversion — 3rd independent replication, the only strong signal.**
   Positions 1–2: 9/86 (10.5%) vs positions 3–6: 38/172 (22.1%), z≈2.5, stable in both
   half-splits. Mechanism hypothesis: midday score is CO=64%-dominated; pos1 = extreme-CO
   tail; the CO benefit may be concave. **Action path is decision-layer only** (bet guidance
   away from midday pos1-2 and/or a position feature in CALIB-01) — no engine change, no
   backtest gate needed. Next: extend the faithful computation back to 2026-04-01
   (contamination-safe, no stored flags) to double n; test within-day CO z-score vs hit.
2. **Cross-scope top-of-slate depression** — pooled pos1-2 20.5% vs pos5-6 27.5% (+7.0pp,
   z≈1.9). Coherent with #1 and with SIGNAL-INFO-01, but inconclusive alone; same extended-
   window query decides it.
3. **Within-slate times_drawn tilt** — above-day-mean TD −5.1pp pooled (z≈1.7). The 6/06
   evening −27pp gradient did **not** replicate at magnitude. Universe-level TD AUC check
   required before anything else; expected null.
4. **Evening DGC on-slate gradient** — direction replicates (+8.5pp within-day, z≈1.8) but
   contradicts settled universe-level anti-information → textbook selected-vs-universe trap.
   The 6/06 "DGC≥0.85 = 60.8%" bucket no longer exists on-slate; that spec is unimplementable.
5. **Evening below baseline — watch only.** 17.8% vs 22.2% expected; the recent 0/6 days are
   unremarkable (P(0/6)≈22–24%/day). Re-check in ~2 weeks; if still >4pp under at n>350,
   investigate day composition, not weights.

### Checked and found nothing (don't re-run)
- Jurisdiction concentration: all 39 jurisdictions within ±2σ; half-split stability r = −0.12.
  Supports ENH-AUDIT **v1 (display) only**; no selection channel revival.
- Structural jurisdiction differences (doubles/triples share), digit-position distributions,
  day-of-week effects: all noise.
- Doubles: **zero doubles selected anywhere in the clean era** → `evening_doubles_promote` is
  moot as specced; doubles-floor family stays falsified.
- Midday and allday pick rates sit exactly on the uniform baseline — SIGNAL-INFO-01
  reconfirmed on live clean data.

Live config verified: midday {BOX 20.8, PBURST 5.2, CO 64, DGC 10}; evening {BOX 50.6,
PBURST 28.1, CO 10, DGC 11.25}; allday {BOX 64.7, PBURST 35.3, CO 0, DGC 0}.

---

## Part 3 — UI / brand audit (propose-only; consumer surfaces untouched per standing rule)

Checks: `check:brand-voice` → 0 findings (scanner is phrase-level and blind to the items
below); `lint` → 35 errors / 123 warnings; `tsc --noEmit` → 7 errors, 2 of which are behavior bugs.

### Brand-voice regressions the scanner can't see (all consumer-facing)
| Where | String | Status |
|---|---|---|
| `app/(tabs)/explore.tsx:510` | `⭐ EXACT` / `🎯 PARTIAL` match badges | ✅ verified |
| `app/(tabs)/results.tsx:767` | `K6 {scope} · Exact/Partial` badge | ✅ verified |
| `app/(tabs)/results.tsx:778` | native Share message "…Exact/Partial match…" — leaves the app | ✅ verified — highest leak risk |
| `app/(tabs)/book.tsx:528` | `HIT` / `{n}×` count label | agent-reported |
| `app/(tabs)/_layout.tsx:45` | a11y label "— new hits" | agent-reported |
| `app/(tabs)/zk30.tsx:673,1408` + `components/zk30/ResultsAnalytics.tsx:232` | "HITS" stat labels on a public tab | see P3 below |
| `app/(tabs)/learn.tsx:13` | 🎰 slot-machine emoji | borderline, Two-Question filter |
| `app/(tabs)/index.tsx:929` | "verified 72.4% match rate" — hardcoded, measured 2026-05-27 **inside the BUG-162 inflation era** | provenance problem |

Fix path: per-string swaps to MATCH/STRAIGHT MATCH vocab + add bare-word EXACT/PARTIAL/HIT
rules and the zk30 surfaces to `scripts/check-brand-voice.ts`.

### Top proposals (operator-value-per-effort)
1. Brand regressions above (S).
2. **Daily Workflow dashboard doesn't refresh after the workflow runs** — status cards load
   once on mount; convert to useQuery + invalidate after `handleFullWorkflow`; move PIPELINE
   STATUS card to top (saves a scroll every morning) (S/M).
3. ✅ **ZK30 tab is un-gated on the public tab bar** (`_layout.tsx:167-173`, no role check in
   `zk30.tsx`) — operator instrumentation + forbidden vocab visible to free users, engine
   supposed to be frozen. Hide with `href: null` unless admin (S).
4. ✅ **Home "matches today" undercounts multi-state matches** — dedupe key uses
   `matched_state` but the select list omits it (`index.tsx:444,459`; confirmed: key always
   gets `''`). One-line fix; consumer surface → ships only on explicit ask.
5. **Intelligence Refresh passes the tap event into `load(force?)`** — event is truthy, so
   every tap force-reloads the whole DI table (S).
6. **Consumer pull-to-refresh fires hit detection twice per pull** (`explore.tsx:217-230`) —
   two service-role edge invocations per anon gesture; amplification vector. Restrict to
   snapshot refresh (M).
7. Coffee-mode Home lacks pull-to-refresh; grid gets a small refresh icon in the meta row
   (grid stays out of ScrollView — screenshot rule) (S).
8. Book/Learn fixed 220–230pt sidebars unusable on small phones (M/L, larger project).
9. Lint-to-zero + micro-type pass (7–8pt labels, `maxFontSizeMultiplier`) (S).
10. Stale operator string: `DashboardView.tsx:756` claims a nightly cron exists — all crons
    removed under OPS-01; invites skipping the manual workflow (S).

Rejected (with reasons in agent report): light-mode wholesale, push wiring (accounts gated),
IAP (accounts gated), mode-picker restoration (deliberate removal), Intelligence on tab bar
(forbidden), grid-in-ScrollView (forbidden), auto-scheduling the workflow (no-auto-crons).

---

## Recommended action shortlist (operator picks)
1. **FB P1 + group-lane lint gate** — biggest daily-life win, S effort, admin surface (editable).
2. **Brand regression sweep** (EXACT/PARTIAL/HIT strings + scanner hardening + zk30 gating) —
   consumer surfaces, needs explicit go-ahead per standing rule.
3. **Midday rank-inversion decision layer** — extend window to 4/01 for confirmation, then
   bet-guidance / CALIB-01 position feature. No engine change.
4. Operator QoL: dashboard refresh-after-workflow + Intelligence force-reload fix + stale cron string.
5. Watch item only: evening below baseline — re-check ~8/05.
