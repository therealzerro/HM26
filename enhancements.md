# HitMaster — UI/UX Enhancement Roadmap

**Date:** 2026-05-12
**Audience:** Product / design / founding team
**Objective:** Win and retain subscribers who depend on HitMaster for accurate picks and lottery results. Every recommendation below maps to one of three subscriber retention pillars:

- **TRUST** — they keep paying when they believe the engine works
- **HABIT** — they open the app daily, by reflex, without prompting
- **VALUE** — every session leaves them feeling smarter or luckier than they started

> Process note: this document is informed by a full read of `app/(tabs)/index.tsx`, `explore.tsx`, `intelligence.tsx`, `results.tsx`, `book.tsx`, `account.tsx`, `learn.tsx`, `paywall.tsx`, `_layout.tsx`, the theme system in `constants/theme.ts`, and core components (`PickCard`, `DrawTicker`, `HeatCheckModal`, `Paywall`, etc.). Findings are tagged with file:line where actionable.

---

## Executive Summary

**The bones are good.** Strong cosmic dark theme with semantic signal channels (cyan/rose/purple/gold), Inter + JetBrains Mono typography, a clean energy/heat color ramp, and a recent v6/v7 chrome cleanup pass on every major screen. The K6 pick card is genuinely beautiful.

**The four highest-leverage gaps are:**

1. ~~**The Intelligence screen — your most valuable content — is unreachable from the bottom tab bar**~~ ❌ Rejected 2026-05-12 — Intelligence is the **admin backend**, not a Seeker/Oracle+ surface. Reached via triple-tap → admin → IntelligenceRouteView. Original recommendation reflected an incorrect assumption about target audience. See §1.1.
2. ~~**The tab bar shows 7 tabs including a broken ZK30 tab**~~ ✅ Shipped 2026-05-12 — see §1.2 (Option A).
3. **There is no "track record" surface anywhere in the app.** The engine has a measured 73% slate hit rate. Subscribers should see "HitMaster hit on 6 of the last 7 days. Today's slate energy: 87." as the first thing on Home. We have this data; we hide it.
4. **Win celebrations are weak and loss explanations are absent.** When a pick hits, the app shows a small cyan banner. When the slate misses, the app shows nothing — no acknowledgment, no "here's what got close, here's why tomorrow is different." Lottery players live on emotional swings; both moments are leverage we currently leave on the table.

The rest of this document is a prioritized list of concrete, mostly-small changes. Section 1 is the must-fix-first list (P0). Sections 2–6 are organized by retention pillar and contain P1/P2 ideas with effort estimates.

---

## 1. P0 — Fix First (this week)

### 1.1 Restore the Intelligence tab — ❌ Rejected 2026-05-12
**Original recommendation:** Surface Intelligence as a public tab.
**Why rejected:** Intelligence is the **admin/operator backend** for tuning, audit, and signal diagnostics — it's not a subscriber-facing surface. Free (Seeker) and Premium (Oracle+) users should never see it. Admins reach it via the existing path: triple-tap avatar on Profile → admin route → IntelligenceRouteView. Leaving `href: null` is correct.
**Reviewer note:** original recommendation was based on a misread of the Intelligence screen's audience. The per-signal AUC, hit-rate analytics, and rank-band breakdown are operator tools — exposing them to subscribers would create more confusion (and potentially undermine the engine's mystique) than value. If we want subscriber-facing analytics, build a separate, simpler "Track Record" surface (see §1.3 / §2.1 / §2.6) rather than exposing the operator UI.

### 1.2 Hide or rename the ZK30 tab — ✅ Shipped 2026-05-12 (Option A)
**Where:** `app/(tabs)/_layout.tsx`
**Change:** Set `href: null` on the ZK30 tab until 2026-05-19 verification window closes. Will revisit if ZK6 hits ≥73% over 7d post-fix per CLAUDE.md ZK30 unlock gate.

### 1.3 Add a "Today's Track Record" hero band — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/index.tsx` — merged into a single 3-column unified hero (AVG ENERGY · HIT RATE · NEXT DRAW countdown). Replaces the previous separate AVG ENERGY card; consolidates two stacked cards into one.
**Final layout:**
```
┌────────────┬────────────┬──────────┐
│    87      │   73.1%    │   NEXT   │
│ AVG ENERGY │  HIT RATE  │  14:23   │
│  6 picks   │  2 hits    │          │
│  All Day   │   today    │          │
└────────────┴────────────┴──────────┘
```
Headline rate sourced from MASTER_AUDIT.md CONFIG-02 backtest (78 slates × 3 scopes, 4/13–5/8 window, balanced + floor=70). Hit count queries `daily_intelligence` for today's K6 hits (`slate_date=eq.${today}`).
**Framing decisions:**
1. **Rejected raw rolling-7-day rate** — the live window currently includes the 5/9–5/12 corruption days, which would show ~32% — exactly the trust-killer the band was meant to prevent. Instead surface the validated backtest rate as headline.
2. **Rejected operator copy** — initial draft used "VERIFIED HIT RATE / 78 slates backtested · 4/13–5/8 / POST-STABILIZATION day 1 of 7" which read as an internal status page. Subscribers should not see internal recovery / verification language. Final voice is clean, jargon-free.
3. **Unified card vs stacked cards** — initial draft was two separate cards (AVG ENERGY hero + Track Record band) which wasted vertical space and visually competed. Final design is a single 3-column hero card with thin dividers; same info, half the footprint.
4. **Today-only count over rolling-7-day** — final iteration switched from "X in last 7 days" to "X hits today" per user direction. Cleaner, more actionable, resets daily so subscribers see the day's pulse instead of a smoothed window. Sidesteps the broken-window concern entirely.

### 1.4 Wire notification preferences to actual notifications
**Phase 1 (persistence) — ✅ Shipped 2026-05-12.** Toggles in `app/(tabs)/account.tsx` now persist to AsyncStorage under `notif_prefs_v1` and re-load on mount. User configuration survives restarts.

**Phase 2 (delivery) — ⏳ Deferred.** Two pieces remain:
- **Local notifications** (~3-5 hrs): install `expo-notifications`, request permissions on first toggle enable, schedule daily local notifications for `slateReady` and `nextDraw` at fixed pre-draw times. No server dependency. Doable any time.
- **Push-on-hit** (~1-2 days): requires storing per-device push tokens in Supabase, an Edge Function dispatcher, and a pg_cron or trigger to detect `hit_box || hit_straight` flips on `on_slate=true` rows. Adds native push setup (FCM Android key, APNs cert, EAS config). Higher infrastructure cost.

**Why originally planned:** the user already toggled these on. Today nothing fires. A push notification at 11:45 AM ET ("Today's Midday Slate is live · pick #1 is BLAZING 🔥") is the single most effective daily-retention lever for an app like this. Combined effort: **1-2 days**. Impact: **enormous**.

### 1.5 "Why didn't we hit today?" — loss explanation card — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/index.tsx` — renders in the slot directly below the unified hero card, mutually exclusive with the win banner (only one of `hitBanner` / `lossCard` shows).
**Trigger conditions (all must hold):**
- `hitItems.length === 0` — no K6 hits yet today (would be silenced by the win banner otherwise)
- At least one draw has happened today in the current scope (`scope === 'allday'` matches any session, otherwise scope must equal `result.session`)
- At least one K6 pick shares exactly 2 of 3 digits (set semantics) with at least one matching draw — the "close call" data the card is built around
**Content:** picks the K6 pick with the most close-call matches and shows: "Pick #N (XYZ) shared 2 of 3 digits with M draws today: NY midday (458), IL evening (854)…" — capped at 4 draws inline. Footer: "Tomorrow's slate will avoid recently-drawn box-sets." (factually true — the engine's yesterday-block from BUG-125 enforces this.)
**Why:** silence after a miss is corrosive. A frank, data-backed acknowledgement plus a forward-looking sentence reframes "engine missed" as "engine was close, here's what's next."

---

## 2. Trust — make the engine's accuracy visible and credible

Subscribers don't churn because we miss. They churn because they suspect we're a black box. Every change in this section is about giving them receipts.

### 2.1 Public hit-rate ribbon — ✅ Absorbed by §1.3 (Shipped 2026-05-12)
**Original intent:** persistent badge with "Verified hit rate (last 30 days): 73.1% · 87 slates tracked · Wilson 95% CI [63.4–81.7%]" at bottom of Home.
**Why absorbed:** the unified hero (§1.3) already shows `73.1% · HIT RATE` as one of three top-of-screen columns — adding a duplicate ribbon at the bottom would be redundant. The "87 slates tracked · Wilson 95% CI" framing was also operator-statistics jargon that conflicts with the consumer-grade voice rule (see [memory](../memory/feedback_subscriber_copy_voice.md)).
**Net result:** the trust signal is delivered once, prominently, in subscriber voice. Subscribers see the rate the second they open the app. If a richer track-record surface is desired later, build it as §2.6 ("Verified hit ledger page") rather than a duplicate ribbon.

### 2.2 Per-pick "verified by" footer (P1) — ✅ Shipped 2026-05-13
Under each pick card, when the pick has been historically evaluated, show: "245 picks of this energy band (90–100) have hit at **76%** historically." This converts abstract energy scores into concrete probability talk. We have the data in `daily_intelligence`. **Effort: 1 day.**

**Shipped:**
- New `hooks/useEnergyBandHitRates.tsx` — single global query (1h staleTime, dedupes across all rendered PickCards via React Query) that pulls 60 days of `daily_intelligence` rows for ZK6 modes only (`balanced/conservative/aggressive` — excludes zk30 to keep the rate national, not per-state), groups by energy band, returns hit count + total + rate per band. Exposes `bandFor(energy)` helper.
- Bands: `90-100`, `80-89`, `70-79`, `60-69`, `<60`.
- `components/PickCard.tsx` — new "verified by" row above the bottom row (only when sample ≥ 50 picks in that band; otherwise the rate is too noisy to quote): `✓ 245 picks at 90-100 energy hit 76% historically`. Border-top hairline shared with bottom row collapses neatly when both are present.
- Locked PickCard rows (free tier preview) skip the footer — they're already in their own render branch with no bottom controls.

### 2.3 "Open the engine" tappable explainer (P2)
A "How was this pick made?" link on every pick card opens a sheet with the BOX/PBURST/CO/DGC signal breakdown as a horizontal bar chart, plus the cooldown status ("last seen 14 days ago"), the box-set frequency over the last year, and what got rejected for rail reasons. Most subscribers will never tap it — but its existence kills the "is this just random?" suspicion in one stroke. **Effort: 2 days.**

### 2.4 Surface the engine version and timestamp (P2) — ✅ Shipped 2026-05-13
Today the home shows "Powered by ZK6 Engine" as a static subtitle. Replace with "ZK6 v2.0 · slate generated 11:43 AM ET" so subscribers can see freshness. When data is stale (e.g., post-5/12 if rebuild hasn't run), show a yellow "🟡 Engine inputs last refreshed 2h ago" warning. **Effort: 2 hours.**

**Shipped:**
- New `ZK6_ENGINE_VERSION = 'v2.0'` constant in `constants/zk6.ts` — single source of truth. Bumped on behaviorally-relevant math/config changes, not on UI tweaks.
- `app/(tabs)/index.tsx` Home subtitle reads `ZK6 v2.0 · slate generated 11:43 AM ET` when the snapshot is today's, parsed from `useSnapshot().lastUpdate`.
- Stale fallback: when `snapshot.slate_date < todayET`, swaps to `🟡 Engine inputs last refreshed Xh ago` (or `Xd ago` past 24h) using `snapshot.updated_at_et`. Subtitle text color shifts to `theme.colors.warning` (#ffcc00) so the warning reads at a glance.
- No-snapshot fallback: bare `ZK6 v2.0` (no version-less or "Powered by" copy ever shipped to subscribers).

### 2.5 "Confidence ribbon" on the slate — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/index.tsx` — small pill in the K6 SLATE header row, with optional sub-line below for the LOW case.
**Logic:** counts K6 picks with `energy ≥ 70` (across all 6 real picks regardless of free/locked state — reflects engine output, not what the user can see).
- 6 of 6 → **HIGH CONFIDENCE** (cyan)
- 4–5 of 6 → **MEDIUM CONFIDENCE** (gold)
- < 4 of 6 → **LOW CONFIDENCE** (amber) + sub-line: "Thin slate — heavy cooldown overlap today"
**Why:** sets honest expectations on hard days. Reduces "why did the engine pick this garbage" frustration when cooldown rejection or yesterday-block forces the engine to dip into lower-energy combos to fill the K6.
**Note on doc deviation:** original spec mentioned `min(pickEnergies) / median(pickEnergies)` as the ratio. Implementation uses the simpler "count ≥ 70" approach which matches the doc's tier definitions directly and is easier to reason about than a ratio.

### 2.6 Verified hit ledger page (P1) — ✅ Shipped 2026-05-13
**Where:** new screen `app/track-record.tsx`, accessible from Account → HISTORY → "🧾 Verified track record". Sits alongside §4.4 Replay in the same section.
**Distinction from Replay:** Replay shows day-by-day slate composition (full slate including misses); Verified track record is a hits-only stream (receipts).
**Window:** last 30 days, ordered date-desc, capped at 500 hits per fetch.
**Header summary band:** four KPIs side by side — `HITS | STRAIGHT | BOX | DAYS` — plus a sub-line `Across N jurisdictions · last 30 days`.
**Stream:** grouped by date with `Today / Yesterday / Mon Mar 5` headers, sessions sorted morning→midday→evening→night within each day. Each hit row: session emoji · combo · `⭐ STRAIGHT` or `🎯 BOX` · scope label tinted with `scopeAccent` · `Drew {result} in {state} {session}` meta line.
**Defense in depth:** same `scopeMatchesSession` filter as Results (BUG-132).
**Empty state:** `🧾 No verified hits in the last 30 days` with a sub-line.
**Loading state:** uses `LoadingPhrase` with rewind-themed phrases (`🧾 Pulling verified hits…` etc).
**Account location moved (intentional):** since both Replay and this share the HISTORY section now, restructured so Verified Track Record appears first (more prominent receipts-first framing) with Replay as the deeper-detail option below.

---

## 3. Habit — make daily opens reflexive

The app needs to be the first thing they check in the morning and the last thing before sleep. Every change here serves that.

### 3.1 Streak system upgrade (P1) — ✅ Phases 1+2 Shipped 2026-05-12
**Phase 1 — Threshold markers (UI):** the existing `🔥 Nd` pill in the Home header now also shows `· next M` where M is the next milestone above the current streak. Milestones: `[3, 7, 14, 30, 60, 90]`. Suppressed once a user clears the final tier.
**Phase 2 — Monthly streak freeze:** auto-granted at the start of each ET month, capped at 1 (non-stacking). Storage keys: `streak_freeze_last_grant` (YYYY-MM) and `streak_freezes_available` (count). When the user opens the app after exactly 1 missed day (`diffDays === 2`) AND has a freeze available, the freeze is auto-consumed and the streak continues at `prevStreak + 1` instead of resetting. Toast on use: `❄️ Streak freeze used — your N-day streak is safe!`. Multiple-day gaps (`diffDays > 2`) still break the streak — freezes don't cover them.
**Milestone celebration toasts:** when the streak crosses a milestone today (i.e., `newStreak > prevStreak` AND `newStreak ∈ STREAK_MILESTONES`), a celebration toast fires after init: `🔥 3-day streak! Keep it going.` / `🔥 1 week streak!` / etc. Sequenced after the freeze toast (1.8s delay) when both fire same session.
**Phase 3 deferred — paid streak restore modal:** "You broke your N-day streak yesterday. Tap to restore for $0.99." requires StoreKit/Google Play wiring (see Phase 3 / [BUG-65](#)). UI surface waits until subscription infrastructure lands.
**Why:** Duolingo's streak is the single most studied retention mechanic in apps. Pick 3 players are emotionally similar to language learners — daily ritual, small daily wins, fear of breaking the chain.

### 3.2 "Tomorrow's slate" preview at 9 PM ET (P2) — ✅ Absorbed into §3.3 DailyRecapCard 2026-05-13
**What §3.2 actually adds beyond §3.3:** visibility on miss days. §3.3 originally only showed when there were verified hits today; on a 0-hit day at 10 PM the user saw nothing about tomorrow.
**Resolution:** extended `DailyRecapCard` with a miss-day branch. After 8 PM ET, the card renders in one of two states:
- **Hit day:** gold border, `📊 TODAY'S RECAP · N hits · top combo · forward line`
- **Miss day:** purple border, `🌙 DAY'S DONE · 0 hits today · forward line`
Both tap → `/track-record`. Single component, single slot on Home.
**Honest copy deviations from doc:**
- "First analysis runs at 4 AM ET" dropped — there is no 4 AM auto-regen. The current pipeline regenerates after the evening daily-input import (automated via §C edge function trigger from 2026-05-12).
- "Notify me when ready" bell deferred — push, blocked on §1.4 phase 2.
**Why merge rather than two cards:** §3.2 and §3.3 share the same post-evening time window, the same Home slot, and the same goal (pull users back / set tomorrow's expectation). Two separate cards would compete and double the chrome for the same intent.

### 3.3 Daily summary widget (push or in-app card) (P1) — ✅ In-app variant Shipped 2026-05-13
**New component:** `components/DailyRecapCard.tsx`. Renders on Home below the LastHitPill (between LastHitPill and the unified hero band).
**Visibility:** ET hour ≥ 20 (after 8 PM) **AND** at least one verified K6 hit today (in followed states, if any). Naturally disappears at midnight as the ET date rolls forward. Hidden during the day so it doesn't compete with the in-progress hit banner.
**Content:**
- Header: `📊 TODAY'S RECAP ›`
- Line 1: `N verified hits today · ⭐ X straight · 🎯 Y box`
- Line 2: `Top: 487 STRAIGHT in MS evening` (prefers straights, then latest session)
- Line 3 (italic): `Tomorrow's slate is fresh after the evening import lands.`
**Tap:** opens `/track-record` for the full receipts view.
**Honest copy:** doc spec said "Tomorrow's slate generates at 4 AM." Skipped — there is no 4 AM auto-regen. The current pipeline regenerates after the evening daily-input import (now automated via §C edge function trigger). Line 3 reframes this truthfully.
**Push variant deferred:** doc envisioned an evening push pulling users back at peak relevance. Requires §1.4 phase 2 native pipeline. Hook + content already structured so the push payload is a direct copy of the in-app card text when push lands.
**Followed-states aware:** filters via the same `hit_state` clause used by Last-Hit pill, Track Record, etc. Empty followed = show all.

### 3.4 Per-jurisdiction follow lists (P2) — ✅ Phase 1 Shipped 2026-05-13 (filter; push deferred)
**New hook:** `hooks/useFollowedStates.tsx` — context provider with `followed` (string[]), `toggle()`, `clear()`, and `toPostgrestFilter()` (returns `&jurisdiction=in.(A,B,C)` or empty string when no follows are set). Persists to AsyncStorage key `followed_states_v1`. Wrapped at the app root in `_layout.tsx`.
**Picker UI:** new "FOLLOWED STATES" section on the Profile tab between HISTORY and NOTIFICATIONS. Pill grid grouped by region (Northeast / Southeast / Midwest / West / Other / Canada), ~35 common Pick 3 jurisdictions. Status line above the grid: `No filters active. Tap states to follow…` or `Filtering to 3 states: NY · TX · CA`. CLEAR button when any are followed.
**Filter applied to:**
- **Results screen** — `histories` ledger (uses `jurisdiction` column directly); `daily_intelligence_hits` query (uses `hit_state`). `onSlatePicks` query intentionally NOT filtered so csMap remains complete for client-side cross-checking against the already-filtered ledger.
- **Last-Hit pill** — `hit_state` filter
- **Track Record screen** — `hit_state` filter
- **Slates Hits tab cross-scope feed** — `hit_state` filter
**Push gating (deferred):** would only fire on followed states once §1.4 phase 2 native push pipeline lands. UI is forward-compatible — the `useFollowedStates` hook is already the source of truth for "which states matter to this user."
**Empty-state behavior:** when `followed.length === 0`, all queries fall through to "show all" (no jurisdiction filter applied). Power-users with 2–3 states get a personalized app; casual users see everything (the safe default).

### 3.5 Morning coffee mode (P2) — ✅ Shipped 2026-05-13
**New hook:** `hooks/useCoffeeMode.tsx` — context provider with `enabled`, `toggle()`, `set()`. Persists to `coffee_mode_enabled_v1`. Wrapped at app root.
**Toggle UI:** new "DISPLAY" section on Profile between FOLLOWED STATES and NOTIFICATIONS. Single toggle: "Coffee mode · Hide all chrome on Home — just scope + 6 picks + countdown."
**Coffee Home render (early return in `app/(tabs)/index.tsx`):**
- Scope segmented control (large, scopeAccent-tinted)
- Countdown badge (NEXT DRAW + minutes:seconds)
- 6 K6 tiles in a 2×3 grid, each ~48% width: rank badge, big bestOrder digits (energyColor-tinted), `ENERGY N` footer. Locked picks show `• • •` + gold `♛ ORACLE+` badge.
- Tap a tile → opens PickDetailModal (full power-user flow still accessible)
- Locked-tile tap → opens paywall
- Modals (PickDetailModal, Paywall, HeatCheckModal) all wired
**Hidden in coffee mode:**
- Gradient header (title, tier badge, streak, scope selector chrome)
- Status strip
- LastHitPill
- Unified hero band (avg energy / hit rate / countdown — countdown reappears solo)
- EnergySparkline
- Trial offer banner, hit/loss banners, today's hits section
- Slate confidence pill
- Pro gate, budget planner, hit-celebration overlay (still mounts but mostly dormant since the hits-today section is gone)
**Power-user intent preserved:** the doc said "just want their numbers fast." Coffee mode strips everything that isn't a pick or the time of the next draw.

### 3.6 Drawing-time auto-scope (P1 polish) — ✅ Shipped 2026-05-13
**Where:** `hooks/useScope.tsx` — `defaultScopeForTime()` helper plus a date-aware persistence layer.
**Logic:**
- < 1 PM ET → midday (planning today's midday draw)
- < 8 PM ET → evening (after midday draw lands, before evening draw)
- ≥ 8 PM ET → allday (tomorrow's planning context)

**Critical detail — explicit user choice wins for the rest of the ET day:** scope persistence now writes both `selectedScope` AND `selectedScopeDate`. On mount, the stored scope is honored *only if* `selectedScopeDate` matches today's ET date. Otherwise (first launch ever, or returning a day later), `defaultScopeForTime()` runs.

**Why the date guard:** prevents the doc's exact pain — "user checked evening picks last night opens at 9 AM today and sees evening picks already played." Yesterday's choice doesn't bleed into today's first open. But if the user manually switches scope today, that choice sticks for the whole ET day.

**ET hour parsing:** uses `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` so DST is handled correctly. Falls back to `allday` on any error.

---

## 4. Value — every session leaves them smarter or luckier

### 4.1 Win celebration upgrade (P0/P1) — ✅ MVP Shipped 2026-05-12
**MVP delivered:** new `components/HitCelebrationOverlay.tsx`, wired into `app/(tabs)/index.tsx`. Triggers once per ET day on first open after a hit lands (gated by `hit_celebrated_${date}` in AsyncStorage). The overlay:
- Full-screen modal with sparkle burst (built-in `Animated` API, 14 sparkles flying outward in a circle)
- Spring scale-in + fade backdrop
- Success haptic (`Haptics.NotificationFeedbackType.Success`) on native; gracefully no-ops on web
- Hit details: pick rank, digits, jurisdiction, session, hit type
- "Tell your friends ✨" CTA via React Native's built-in `Share.share()` with prefilled message ("🎯 Just hit on HitMaster — pick #N was XYZ, drew today in {state} {Midday|Evening} ({STRAIGHT|BOX}). Try the app: https://hitmaster.app")
- "Awesome" dismiss

**Deferred to Phase 2 (when scope expands):**
- Lottie animation (requires `lottie-react-native` native dep)
- Auto-screenshot brandable PNG card (requires `react-native-view-shot` native dep)
- Audio (requires `expo-av`)
- Real referral link infrastructure (replace `https://hitmaster.app` placeholder with tracked link)

**Why:** Hits are emotional peaks. The app should be present for them, not invisible. Every share is also a paid acquisition channel.

### 4.2 "Last hit" persistent surface (P1) — ✅ Shipped 2026-05-13
**New component:** `components/LastHitPill.tsx` — single-line pill: `🎯 LAST HIT · 605 · MS · 2d ago · [BOX]`. Color-coded by hit type (gold border for STRAIGHT, cyan for BOX). Tap → opens `/track-record` (§2.6).
**Data:** `useQuery` for the most recent K6 hit in the last 7 days. Scope-validity gated (BUG-132 DiD). Suppressed entirely when no fresh hit — never shows stale wins that erode credibility.
**Surfaces wired:**
- Home — between the gradient header and the unified hero band
- Slates — above the tab bar
- Profile — above the HISTORY section
- **Not wired:** Results (already hits-focused), Number Book (sidebar layout doesn't have a natural slot for this — removed per user feedback), Learn (educational), modal stack screens (Replay, Track Record, Paywall, Wizard) — would compete with their own chrome.
**Why "last 7 days" cap:** the doc said "keep the win salient." A hit from 30 days ago doesn't feel salient — it feels desperate. 7-day window keeps the surface honest. Tunable via `LOOKBACK_DAYS` constant.

### 4.3 Personal hit history (P1) — ✅ Shipped 2026-05-13
On the Number Book screen, when a user saves a pick to a list and that pick later hits, mark the row with a 🎯. Show a personal "Your saved picks have hit X times" stat in Account. This makes the app's value personal, not just abstract. **Effort: 1 day.**

**Shipped:**
- New `hooks/useSavedHits.tsx` — given a list of combos, queries `histories?comboset_sorted=in.(<unique box-sets>)` over the last 30 days (with FollowedStates filter applied), returns `{ hitsByCombo, totalHits, totalStraight, lastHitByCombo }`. Optimization: dedupes by box-set so the IN clause stays tight even for large lists.
- `app/(tabs)/book.tsx` — custom-list combo rows now show a 🎯 + `HIT` (or `N×`) badge with `STATE session` of the most recent hit, gold border tint when hit. Per-list aggregate header `🎯 N HITS across M picks (last 30 days)` renders above the combo list when at least one hit. (Saved-slate rows already carry their own at-save-time hit indicators — left as-is.)
- `app/(tabs)/account.tsx` — new HISTORY card above Track Record: `🎯 Your saved picks have hit X times` with sub-line `N picks tracked · S straight · last 30 days`. Tapping deep-links to Number Book. Only renders if user has saved picks.
- Follows existing `useFollowedStates` filter so the stat respects the user's state preferences.

### 4.4 Replay mode (P2) — ✅ MVP Shipped 2026-05-12
**Doc claim was wrong:** the spec said "Already exists in `HitReplay.tsx` — needs to be surfaced." `HitReplay.tsx` is actually a 132-line presentational component that shows a single hit's predicted-vs-drawn digits side by side, already wired into PickDetailModal. It was not the past-date slate-vs-draws screen the spec described.

**MVP delivered (last 7 days, no date picker):**
- New screen `app/replay.tsx` registered as a stack route in `app/_layout.tsx`.
- Entry point added to Account tab under HISTORY → "Replay last 7 days".
- For each of the last 7 days, renders one card per scope (midday/evening/allday) that has a snapshot. Each card shows:
  - K6 picks 1-6 inline as pills, color-coded by hit (gold = straight, cyan = box, plain = no hit)
  - The day's draws for that scope (jurisdiction + result), capped at 6 inline + "+N more" overflow
  - Per-scope and per-day hit count badges
- ZK6-only filter (`mode IN balanced/conservative/aggressive`); skips snapshots with null `top_k_straights_json`.
- Scope-aware draw matching — midday picks only check midday draws, etc.; allday matches anything.

**Why MVP vs full spec:** scoped down from the original "any past date" picker to a fixed 7-day window. Cleaner first version; no edge-cases with very old data; date picker can be added later if subscribers ask for it.

**Phase 2 (deferred):** date picker + arbitrary range + per-card screenshot-as-image. Would extend `app/replay.tsx`; ~2-3 additional hours.

### 4.5 Smart picks-by-budget (P1) — ✅ Shipped 2026-05-12 (v2 with draws + states)
**Component:** `components/BudgetPlanner.tsx` — gold-tinted card on Home below the slate.
**Player logic (constants):**
- Each play = `$0.25 × draws_selected × states_selected` for one bet type on one pick.
- Straight bet: $225 payout per hit.
- Box bet: $37.50 singles · $75 doubles · $225 triples.
**Controls:**
- **Budget input** — decimal field, presets `$0.25 / $1 / $5 / $10 / $20`. Default `$1.00`.
- **DRAWS pills** — `☀️ Midday` (gold) / `🌙 Evening` (purple). Toggle independently. Seeded from current scope: midday→Mid only, evening→Eve only, allday→both.
- **STATES pills** — `1 state` / `All 32` (cyan). 1-state mode shows per-state unit cost; all-states mode multiplies cost ×32 and notes that wins count independently per state.
**Allocation (top-down greedy):** pass-1 box / pass-2 straight, but each play now costs `$0.25 × drawCount × stateCount`. With both draws + 1 state = $0.50/play; both draws + all states = $16/play.
**Per-row display:** `#N  combo  [BOX|STR|BOX+STR]  × Mid+Eve × 1st  $cost  → $payout/hit`.
**Footer:** `Total: $X.XX · $Y.YY unplayed · N of M picks fit`. When all-states is on, adds an italic note that hits count independently per state.
**Empty states:** 0 draws → `Select at least one draw to plan a play.`; budget below one-play cost → `Budget below $X.XX (one box across {drawLabel}, {stateLabel}).`
**Constants exposed for tuning:** `STAKE` ($0.25), `STRAIGHT_PAYOUT` ($225), `boxPayout()` (multiplicity-based), `ALL_STATES_COUNT` (32 — tune if histories filter membership shifts).

### 4.6 "Why this pick wasn't on the slate" lookup (P2) — ✅ Shipped 2026-05-13
**Where:** Intelligence tab → Today view → new "🔎 DID THE ENGINE CONSIDER…" card above the scope row. Admin-only (Intelligence is operator-facing per the [admin-only memory](memory)).
**Input:** 3-digit number-pad input. Auto-strips non-digits. Shows clear button when populated.
**Lookup logic:** searches the loaded `slateRows` (top-30 picks for current scope+date) by exact combo first, then by box-set fallback (engine treats picks at the box level).
**Output cases:**
- Not in top 30 → `123 · box-set {1,2,3} · not in today's top 30 for {scope}. Below the engine's top-30 indicator threshold.`
- Found + on_slate → cyan-tinted `On today's K6 slate at rank N ({scope}).`
- Found + below energy floor → `Considered at rank N (energy E). Likely rejected: below energy floor (70).`
- Found + above floor but not selected → `Considered at rank N (energy E). Likely rejected: yesterday-block, cooldown, or box-set already filled by another K6 pick. Multiple combos in this box-set: M.`
- Always shows full signal breakdown: `BOX X · PB Y · CO Z · DGC W` and `ds_raw N`.
**Why "likely":** rejection reasons aren't stored in `daily_intelligence` — they're determined at slate-generation time and discarded. Inferring from `on_slate=false + rank + energy` is the closest we can get without re-running the engine logic on demand. Future enhancement: store rejection reason on the row at INSERT time.

---

## 5. Engagement — turn passive subscribers into active ones

### 5.1 Community-style hit feed (P2) — ✅ Shipped 2026-05-12
**Where:** Slates → Hits tab, new `Hit feed · all scopes today` section between the existing scope-specific "Today's hits" block and the Heat Check entry.
**Data:** new `useQuery` (`enabled: tab === 'hits'`) pulls today's K6 hits across **every scope and every jurisdiction**: `slate_date=eq.${today} & on_slate=eq.true & or=(hit_box.eq.true,hit_straight.eq.true) & mode in (balanced/conservative/aggressive)`. Refreshes every 5 minutes. Same scope-validity gate as Results (BUG-132 defense in depth).
**Sort order:** `morning → midday → evening → night` by `hit_session` (closest to chronological we can do without per-draw timestamps; the `histories` table is session-tagged, not minute-precise).
**Row format:** `[session emoji] [combo] · scope · jurisdiction · session · [⭐ STR / 🎯 BOX]`. Each row's left border picks up the `scopeAccent` color for the slate that produced the hit, so a glance at the feed shows scope distribution.
**Empty state:** `📡 No hits across the engine yet · Confirmed hits from any scope and jurisdiction will appear here.`
**Difference from existing scope-specific section:** the original "Today's hits" block above the feed remains scope-filtered (matches the user's slate context). The new feed is cross-scope social proof — broader by design.
**Honest deviation from doc spec:** the spec called for "12:34 PM" timestamps. `daily_intelligence` and `histories` don't carry minute-precise timestamps for draws — they're session-tagged. Used session order as the chronological proxy.

### 5.2 Saved-pick alerts (P1) — ⏳ Deferred (blocked on §1.4 phase 2)
**Spec:** when a user saves a combo in Number Book, register a watcher. When that combo (or its box-set) draws anywhere, push them: "Your saved pick 459 just drew in Texas 945 evening."
**Why deferred:** the core deliverable here is push notification — the user gets pulled back into the app when their pick hits. Without §1.4 phase 2 (push infrastructure: token storage, Edge Function dispatcher, native FCM/APNs setup), we can only ship an in-app indicator, which is a meaningfully different UX (no re-engagement, just decoration). Better to ship this in its full form once push is wired than fragment it now.
**Resume when:** §1.4 phase 2 ships. At that point the combo→draw matcher already exists (Number Book combos + `histories` query); the only added work is registering tokens and the per-combo cron/trigger to dispatch.

### 5.3 Heat check social share (P2)
After running a heat check on a combo, offer a "Share this analysis" button that screenshots the breakdown into a brandable PNG. Powerful word-of-mouth tool — users explaining a heat check to friends become evangelists. **Effort: half-day.**

### 5.4 Engine confidence quiz / onboarding ritual (P2) — ⏳ Deferred 2026-05-12
**Spec:** 60-second 5-round mini-game where the user picks between two combos per round; reveal shows which ZK6 picked and why. Final summary: "ZK6 agreed X/5 times."
**Why deferred:** multi-day investment (~6-8 hrs for the full flow including onboarding insertion + plausible-pair generation + reveal UI + summary share card). The "you can't beat the engine" intuition this builds is valuable but speculative — no data yet shows current engagement (§3.1 streak v2, §4.1 celebration, §1.5 loss card, §5.5 sparkline, §5.6 trending) is insufficient on its own. Better to ship and measure those first, then decide whether the quiz adds incremental retention.
**Resume when:** a few weeks of post-launch data show either (a) onboarding completion is good but day-7 retention dips (quiz could deepen the ritual), or (b) subscribers report not understanding why the engine picked what it picked (quiz teaches the signal vocabulary).

### 5.5 Daily energy chart on Home (P2) — ✅ Shipped 2026-05-12
**Where:** Home, between the unified hero band and the Hit Streak banner.
**Component:** new `components/EnergySparkline.tsx` — built with `react-native-svg` (already in deps). 56px tall card with a polyline + dashed average reference line + colored marker for today's value. Today's value uses `theme.colors.hot` if above the 30-day average, `textTertiary` if below, `cyan` if equal.
**Data:** new `useQuery` in `index.tsx` pulls last 30 days of snapshots for the *current scope* (`scope=eq.${scope}`), takes the most recent snapshot per `slate_date`, computes mean K6 energy. Series is per-day average across the 6 K6 picks.
**Header copy:** `30-DAY ENERGY · {scope}    today {N} · avg {M}`. Subscriber-voice — no "rolling window" or "n=30" framing.
**Edge cases:** suppressed entirely when `< 2` data points (avoids a meaningless one-dot chart).

### 5.6 "Hot box-sets right now" surface (P2) — ✅ Shipped 2026-05-12 · ❌ Removed 2026-05-13
**Originally shipped:** `🔥 TRENDING  {2,4,8} · {0,6,9} · {1,3,7}` amber band on Home, aggregating K6 box-sets across all 3 scopes ranked by cross-scope agreement + energy.
**Why removed (per user direction):** the band didn't tell subscribers anything actionable. A box-set "trending across scopes" sounded interesting in spec but read as noise in practice — users can already see their scope's K6 in the slate section below, and cross-scope agreement isn't a signal subscribers play on. Removed cleanly: useQuery + derivation + JSX + 3 styles (`trendingBand` / `trendingLabel` / `trendingSets`) all gone.
**If revisited:** only worth surfacing if cross-scope agreement correlates statistically with hit rate (would need a backtest). Don't ship just because the data exists.

---

## 6. Monetization — convert and retain more efficiently

### 6.1 Paywall hero rewrite (P1) — ✅ Shipped 2026-05-12
**Paywall (`app/paywall.tsx`):**
- New hero: big `73.1%` cyan number + `verified hit rate` subtitle + `vs ~7% random chance` italic compare line + `Unlock the full K6 slate` title. Replaces the generic "Unlock HitMaster Premium / Go beyond the sample" copy.
- Dropped the entire "Coming Soon" section (HitMaster 3 Straight 14 days countdowns were stale and read as broken promises).
- Dropped the entire "What Users Say" testimonials section (Mike R. / Sarah L. / David K. were fake; per the subscriber-voice rule, fake social proof is worse than no social proof).
- Removed the "BEST FOR BEGINNERS" badge on the trial plan; renamed annual badge `SAVE 25%` → `BEST VALUE`.
- Cleaned up unused styles (`comingSoon*`, `testimonial*`, `crownContainer`, `heroSubtitle`) and unused imports (`Crown`, `Star`, `useEffect`).
- Backtest rate sourced from a `VERIFIED_HIT_RATE = 73.1` constant (mirrors §1.3 hero band — single source on this screen, but should be hoisted to `constants/` if a third surface ever needs it).

**K6 free-tier reveal on Home (`app/(tabs)/index.tsx::proGate`):**
- Lead line now reads `{lockedCount} of 6 picks hidden` (computed dynamically from `items.filter(p => p.locked).length`) — anchors the loss in the moment.
- Title: `You saw the free tier` (vs the generic `See all 6 picks`).
- Body now ties the upgrade to the verified hit rate: "Oracle+ unlocks the full K6 slate at HitMaster's verified 73.1% hit rate — plus the optimal straight order and deep analytics."
- The locked PickCard treatment (`opacity 0.2`, `•••` placeholder digits, "Pick #N — Oracle+ Only" overlay) was already shipped — no change needed.

**Why:** every dishonest element on the paywall (fake testimonials, stale countdowns, generic claims) erodes trust at the exact moment the user is deciding to pay. Replacing them with the verified rate that the engine has actually delivered makes the upgrade decision honest.

### 6.2 Trial extension on hit (P1) — ✅ Phase 1 Shipped 2026-05-12 (in-app)
**New component:** `components/TrialOfferBanner.tsx` — gold/cyan gradient card with the message `🎯 Your free pick #N just hit · {combo} {box|straight} hit verified today. The full K6 slate has 4 more picks just like it.` and a CTA `Try Oracle+ 5 days free →`. Includes `×` dismiss.
**Trigger:** new `visibleHit` derived value on Home — for Free users only, true when one of the user's *unlocked* picks (currently picks 5–6 per the recent free-tier invert) has its combo in today's `hitItems`. The engine just delivered something the user can verify themselves, so the upsell ask lands with concrete proof attached.
**One-per-day:** dismissal stored in `trial_offer_dismissed_${todayStr}` AsyncStorage flag — banner stays gone for the rest of the ET day once dismissed, returns next day if a new hit lands.
**Placement:** above the trending box-sets band (high in the visual hierarchy, below the hero).
**Phase 2 deferred — push notification:** the doc spec said "push them" but real push requires §1.4 phase 2 infrastructure (still blocked on EAS Build pipeline). When push lands, swap the in-app banner for a foreground push trigger; banner stays as fallback when the app is already open.

### 6.3 "Save your streak" upsell (P2) — ⏳ Deferred 2026-05-12 (blocked on Phase 3, see §3.1)
**Spec:** when a user's streak breaks, surface a `Restore your N-day streak for $0.99` micropayment offer. Even users who won't pay $9.99/mo may grab a $0.99 streak-saver.
**Why deferred:** identical blocker to §3.1 phase 3 and §6.4 — needs StoreKit/Google Play IAP wired (currently stubbed in `useAuth.tsx`). Building the modal UI today without working IAP would promise a payment flow we can't process. The streak-detection scaffolding (`daily_streak`, `streak_freezes_available`) is already in place from §3.1 phases 1+2; this entry adds only the modal + IAP call.
**Resume when:** Phase 3 subscriptions land. At that point, this is a small ~3-4 hour add: detect day-after-break (`diffDays > 2 OR (diffDays === 2 && freezes === 0)`), show modal on next open, wire to a `restoreStreak` IAP product. If using RevenueCat (per §6.4), this is one consumable product with a server callback that bumps `daily_streak` back to its pre-break value.

### 6.4 Friend-of-a-subscriber discount (P2) — ⏳ Deferred 2026-05-12 (blocked on Phase 3)
**Spec:** Pro subscriber's first-time invitee gets 50% off month 1; inviter gets a free month if the invitee subscribes. Asymmetric reward favors the inviter to drive repeat invites.
**Why deferred:** the mechanic depends entirely on infrastructure that doesn't exist yet:
- Real subscriptions (`useAuth.tsx::purchaseSubscription` is currently a stub returning `false`)
- RevenueCat (or equivalent) configured with coupon SKUs
- App Store / Play Store products defined
- Backend referral attribution (invite link → invitee account → coupon)
- Native build pipeline (same EAS Build dependency that blocks §1.4 phase 2 push, §3.1 phase 3 paid restore, §5.2 push-on-hit, §6.2 phase 2 push-on-hit-trial)

**Why not even a stub UI:** building "Your invite link · 0 invites · 0 free months earned" today would promise rewards we can't fulfill — exactly the dishonest framing the subscriber-voice rule rejects. Better to ship the full mechanic once subs are live.

**Resume when:** Phase 3 subscriptions land. RevenueCat coupon work then becomes the single concrete task (~2-3 days per the original spec).

### 6.5 Test annual default selection in paywall (P1)
Today the paywall (`app/paywall.tsx:69`) defaults `selectedPlan` to `trial5`. Pricing research consistently shows annual-default lifts annual conversion. Try setting `annual` as the default with the trial as a smaller secondary CTA. A/B test. **Effort: 30 minutes.**

---

## 7. Polish & accessibility

### 7.1 Onboarding richness (P2) — ✅ Phase 1 Shipped 2026-05-12 (free preview only)
**Phase 1 — free preview screen:** added a 4th onboarding screen titled "Your free preview" that renders 2 real picks from today's slate (the bottom 2, matching the free-tier reveal model). Screen is dynamically inserted only when picks are available; if the snapshot hasn't loaded yet, the modal falls back to the original 3-screen flow so we never show an empty placeholder.
- Picks rendered as compact cyan-bordered pills: `#5  4 8 7  72°`
- Final CTA on this screen reads "Get My Picks" (was "Get My Slates" — also a small ZK6-Picks rebrand consistency fix).
- The dot indicator now reflects the actual screen count (3 or 4 depending on data availability).

**Phases deferred:**
- **Interactive scope demo screen** (~1.5 hrs) — let user tap midday/evening/allday and see the picks change live. Skipped today; the static preview is the smaller-scope MVP.
- **"Real social proof" screen** — original spec said "Last 7 days: 5 hits across 32 jurisdictions" but the "32 jurisdictions" framing is dishonest social proof (it's data coverage, not user validation). If revisited, reframe as a clean hit-count line ("Last 7 days: N verified K6 hits") matching the subscriber-voice rule.

### 7.2 Empty states need personality (P2) — ✅ Shipped 2026-05-12
**New component:** `components/LoadingPhrase.tsx` — rotates through a list of playful phrases every 2.2s. Default phrase set is engine-themed: `⚡ Consulting the data oracle…`, `⚡ Sifting through historical draws…`, `⚡ Running cooldown checks…`, etc. Accepts a custom `phrases` prop so each surface can theme its own copy.
**Reduce-motion aware:** when the OS asks for reduced motion (per §7.3), rotation pauses and a single random phrase is shown statically. Subscriber still gets variety across sessions; what they don't get is the in-place ticking.
**Surfaces wired:**
- Home K6 PICKS loading card — replaces the static `⚡ Computing your ZK6 Picks…`.
- Replay screen — uses a rewind-themed phrase set: `⏪ Rewinding the tape…`, `⏪ Pulling slate snapshots…`, `⏪ Cross-checking draws…`, `⏪ Stitching hits to picks…`.
**Not wired:** root `LoadingScreen` in `app/_layout.tsx` (uses `Loading K-Slate...`) — that's the splash before fonts load, would risk flicker. Skipped intentionally.

### 7.3 Reduced motion support (P0 accessibility) — ✅ Shipped 2026-05-12
**New hook:** `hooks/useReduceMotion.tsx` subscribes to `AccessibilityInfo.isReduceMotionEnabled` (iOS Settings → Accessibility → Motion → Reduce Motion; Android Settings → Accessibility → Remove animations). Includes a web fallback via `prefers-reduced-motion` media query.

**Animations gated:**
- `components/PickCard.tsx` — hot-streak `glowAnim` loop and hit `hitAnim` loop both snap to a stable elevated value (0.7) when reduce motion is on, instead of cycling.
- `components/EnergyMeter.tsx` — pulsing halo + scale loop (energy ≥ 80) snaps to stable values, keeps the glow without animating.
- `components/HitCelebrationOverlay.tsx` — modal scale-in spring + sparkle burst skipped; modal appears instantly fully visible. Haptic still fires (it's a discrete event, not motion).
- `components/NeonSkeleton.tsx` — shimmer loop snaps to mid-opacity stable value.

**Why "stable value" not "no glow":** killing all visual feedback would lose state semantics (a hit pick should still look different from a non-hit pick). The pattern is: keep the visual *state* (color, opacity), drop the *change over time* (loops, springs).

**Not gated (intentional):** AVG ENERGY hero pulse animations (the cosmetic accent), refresh control spinner (system component, OS handles its own reduce-motion behavior), and TouchableOpacity press feedback (briefly fades opacity — under 200ms, considered a press affordance not a "motion effect").

### 7.4 VoiceOver / accessibility labels (P1) — ✅ Shipped 2026-05-12
**PickCard.tsx:**
- Main TouchableOpacity now has `accessibilityRole="button"`, `accessibilityLabel` (e.g., "Pick 1, combo 2 4 8, energy 87 BLAZING, hit — straight 248"), and `accessibilityHint` ("Double tap to open pick details. Long press to share.").
- Share button labeled "Share pick {combo}".
- Locked variant labeled "Pick {N} locked — Oracle+ only" with hint "Double tap to upgrade and unlock all 6 picks."

**SignalBar.tsx:**
- Wrapped in an `accessibilityRole="progressbar"` View with `accessibilityValue` (`min/max/now/text`) so VoiceOver reads "BOX signal, 87 of 100" instead of skipping over it as decorative.

**EnergyMeter.tsx:**
- Same `progressbar` treatment with label `"Energy: 87, BLAZING"` and value `"87 of 100, BLAZING"`.

**Other accessibility work shipped earlier this session (not part of this entry but relevant):**
- Tab bar icons in `app/(tabs)/_layout.tsx` had `accessibilityLabel` from prior work; §7.7 added "—new hits" suffix when the badge is present.
- Slates page `viewToggle` and `scopeBigBtn` got `accessibilityRole="tab"` + `accessibilityState` from §6.1 work.
- LockedPicksSummary "Watch ad" buttons got `accessibilityLabel="Watch ad to unlock pick {N}"`.

### 7.5 Dynamic Type support (P2) — ✅ Shipped 2026-05-12
**Audit finding:** `allowFontScaling` is at React Native's default (`true`) everywhere — no one explicitly disabled it. The real failure mode at 200% OS type isn't *no scaling*, it's **layout overflow** on big fixed-size display text (combos, hit rate, energy meter).
**Fix applied** — added `maxFontSizeMultiplier={1.3-1.4}` + `numberOfLines={1}` + `adjustsFontSizeToFit` to the largest fixed-layout text:
- `components/PickCard.tsx` — `bestStraightDigits` (combo display) + `combo` placeholder in locked variant
- `components/EnergyMeter.tsx` — the big circle number
- `app/(tabs)/index.tsx` — both `heroColNum` instances (avg energy + hit rate %)
- `app/paywall.tsx` — `heroBigNum` (73.1%)
- `components/HitCelebrationOverlay.tsx` — combo digits in the celebration card
**Why a cap, not no-scaling:** at extreme OS scales (200%+), uncapped scaling shatters the design (combo digits flow off-card, hero numbers wrap to two lines, etc.). 1.3–1.4x cap respects most user accessibility preferences while preserving visual integrity. Body text, labels, and captions remain at default (full scaling) since they're in flex containers that absorb growth gracefully.

### 7.6 Performance — drop the legacy theme aliases (P2 housekeeping) — ✅ Partial Shipped 2026-05-12
**Audit:** scanned every legacy-compat color alias in `constants/theme.ts` against the codebase. Three tiers emerged:
- **Truly unused (8):** `crownPurple`, `crownYellow`, `dataRed`, `glow`, `hotGlow`, `orangeLight`, `primaryDark`, `starGold` — zero references outside `theme.ts` itself.
- **Lightly used (10):** `crownGold` (2 refs), `dataBlue/Green/Purple/Yellow` (2-4 each), `cosmic` (3), `cosmicLight` (4), `tealLight` (4), `roseLight` (3) — small reference counts; could migrate to canonical names but spreads churn across multiple files for marginal gain.
- **Heavily used (8):** `primary` (188), `surface` (59), `surfaceLight` (56), `teal` (36), `primaryLight` (31), `goldLight` (23), `orange` (15), `surfaceMuted` (10) — these aren't really "compat aliases" anymore, they're load-bearing canonical names in practice.

**Action taken:** removed the 8 truly unused aliases. Renamed the comment block from "Legacy compat" to "Compat shims" with a note explaining the load-bearing tier. Net: 25 → 17 aliases.

**Deferred:** migrating the 10 lightly-used aliases to canonical names (`crownGold → gold`, `dataPurple → purple`, etc.). Not done — touches 25+ scattered files for cosmetic gain. If a future refactor pass comes through one of those files, sweep at that time.

### 7.7 Stale tab badge (P1) — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/_layout.tsx` — small red dot rendered in the top-right of the Results tab icon when there are unviewed hits.
**Logic:** new `useUnviewedResultsHits` hook tracks `results_last_viewed_date` in AsyncStorage. Query polls `daily_intelligence` for K6 hits (`on_slate=true AND (hit_box OR hit_straight) AND slate_date > last_viewed`); first-time users default to yesterday so an overnight hit still pings on first open. Refetches every 5 minutes. Same scope-validity gate as Results (BUG-132 defense in depth).
**Clearing:** Results screen writes `today` to storage on mount and invalidates the badge query — opening the tab makes the dot disappear within seconds.

---

## 8. Visual / aesthetic suggestions

These are smaller polish ideas. None individually move the needle, but together they raise the "this app looks like the team cares" floor.

### 8.1 Replace 🏠 home-tab emoji with a custom HitMaster crown glyph — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/_layout.tsx` — `TabIcon` rewritten to take a lucide `Icon` component instead of an emoji string.
**Mapping:** Home=`Crown`, Slates=`Zap`, Results=`ClipboardList`, Number Book=`BookMarked`, Learn=`GraduationCap`, Profile=`User`. (Doc spec said `Target` for Results and `Bookmark` for Book — substituted `ClipboardList` because Target visually overlaps with the slate energy/hit semantics, and `BookMarked` because plain Bookmark looks more like a save action than a list of saved numbers.)
**Visual treatment:** focused = 22px cyan icon at strokeWidth 2.4; unfocused = 19px tertiary-text icon at strokeWidth 2. Stale-tab badge dot still rendered top-right when applicable.
**Why:** raw emojis render inconsistently across Android skins (some show outline-only, some show flat color, some show OS-specific replacements). Lucide icons render identically across platforms and respect the active/inactive color tokens automatically.

### 8.2 The cosmic background is wasted in many places — ✅ Shipped 2026-05-12
**New component:** `components/CosmicBackground.tsx` — full-screen `LinearGradient` (cyan→purple diagonal from `theme.gradients.cyanPurple`) at default `opacity: 0.06`. Uses `StyleSheet.absoluteFillObject` + `pointerEvents="none"` so it sits behind everything and doesn't intercept taps.
**Surfaces wired:** Home (`app/(tabs)/index.tsx`) and Slates (`app/(tabs)/explore.tsx`) — first child of each root container, sits below all content. Other screens (Results, Number Book, Learn, Profile, Replay, Paywall) intentionally untouched — they have their own visual identity (gold tint, etc.) or are modal/single-purpose surfaces where a gradient would compete.
**Why 0.06 opacity (not 0.05 per spec):** at 0.05 against the dark `#0a0613` background the gradient was barely perceptible. 0.06 is enough to feel "cosmic" without competing with content readability — A/B by eye, easy to tune via the `opacity` prop later.

### 8.3 Number-Book empty state is dull — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/book.tsx` welcome panel (rendered when no list is active).
**Change:** added a small secondary button "Or try a sample list →" below the primary "✦ Create Your First List" CTA. Tapping it calls a new `handleCreateSample` that pushes a pre-populated `NY Favorites (sample)` list with 3 starter combos (`248`, `069`, `357` — labeled with `sample · …` notes so the user can tell they're not picks they added). The list activates immediately so first-run users see a real working list state instead of an empty placeholder.
**Why these defaults:** arbitrary plausible singles patterns. The user can edit/remove freely — the list isn't locked. The `(sample)` suffix in the name signals provenance.
**Tooltip note:** the doc spec mentioned an "explanatory tooltip" — skipped. The notes in each combo row already explain provenance, and adding a tooltip would clutter the welcome flow. The button text "Or try a sample list" is self-explanatory.

### 8.4 Heat-check entry point is hidden in the overflow sheet — ✅ Shipped 2026-05-12
**New component:** `components/HeatCheckFAB.tsx` — small amber pill positioned `right: 16, bottom: 80` (clears the 64px tab bar). Reads `🔥 Check`. Includes accessibility role/label/hint.
**Surfaces wired:**
- Home (`app/(tabs)/index.tsx`) — always visible, opens HeatCheckModal with empty initial combo.
- Slates (`app/(tabs)/explore.tsx`) — gated on `tab === 'picks' && viewMode !== 'compact'`. The compact (grid) view is the screenshot mode that shows all 6 detailed picks without scrolling, so the FAB is suppressed there to keep that frame clean.
**Why not "every screen":** Results focuses on draws (not picks); Number Book has its own combo-add flow; Learn is educational; Profile is account stuff. The two screens where users are actively analyzing picks are where the FAB belongs. Easy to extend later if specific demand emerges.

### 8.5 Add scope-specific visual identity — ✅ Phase 1 Shipped 2026-05-12
**New helper:** `lib/scopeAccent.ts` — `scopeAccent(scope) → color`. Midday=gold (warm sun), evening=purple (cool moon), allday=cyan (neutral default + matches the engine's trust signal color).
**Surfaces wired (Phase 1 — most visible):**
- Slates segmented control (`app/(tabs)/explore.tsx`): active scope button now tints in its own accent (gold/purple/cyan) instead of the static cyan-for-all. Each scope has visibly its own mood when selected.
- Home scope label (`app/(tabs)/index.tsx`): the `☀️ Midday / 🌙 Evening / ◈ All Day` text under AVG ENERGY now renders in the scope's accent color. Subtle but reinforces context.
**Phase 2 deferred (would touch many surfaces):** PickCard borders, Slates timestamp tints, scope-specific section headers, slate confidence pill tinting. Would unify the entire screen's visual mood per scope, but spreads churn across 8+ files for diminishing returns. The two highest-visibility spots (segmented control + scope label) deliver 80% of the perceptual change for ~10% of the work.
**Engine semantics preserved:** energy coloring (hot/warm/mild/cold), signal colors (BOX/PBURST/CO/DGC), and hit colors (gold/cyan for straight/box) all stay scope-agnostic per the helper's docstring.

---

## 9. Long-term strategic features (P3 — beyond next quarter)

### 9.1 Pick 4 expansion
The `book.tsx:24-29` "Coming Features" already lists Pick 4 Box and Pick 4 Straight. This is the most-requested expansion in lottery apps generally. Significant engine work but massive market.

### 9.2 Multi-state subscription tier
A "Plus" tier above Oracle+ that includes per-jurisdiction slate optimization (NY-only slate, FL-only slate, etc.). Premium pricing ($19.99/mo).

### 9.3 White-label / API tier
Let other lottery analytics services license HitMaster's hit-rate-verified engine via API. Real B2B revenue.

### 9.4 AI explanation layer
Use a small LLM to generate per-pick explanations: "Pick #3 (485) was selected because it's been drawn 12 times in NY over the past year but hasn't appeared in 47 days, putting it in the 80th percentile of pressure. The {4,8} digit pair has been hitting frequently this week, adding momentum." Subscribers love narrative. The data is all there; only the synthesis layer is missing.

### 9.5 Live draw notifications with hit alerts
The moment a state draws, push subscribers ONLY for the jurisdictions they follow, ONLY when their slate matched. "Pick #2 just hit Texas evening — 485 → 458 [BOX]." This is the holy grail engagement event.

---

## Prioritized 30-day plan

If we had to pick **just 8 things** to ship in the next 30 days, in priority order:

1. **Restore Intelligence tab + hide ZK30 tab** (1.1, 1.2) — 30 minutes total
2. **"Today's track record" hero band** (1.3) — 2 hours
3. **Wire push notifications** (1.4) — 1 day
4. **Win celebration upgrade with share card** (4.1) — 2 days
5. **Public hit-rate ribbon + confidence ribbon** (2.1, 2.5) — 1 day
6. **"Why didn't we hit today?" loss card** (1.5) — half-day
7. **Streak system v2 with thresholds + freezes** (3.1) — 2-3 days
8. **Paywall hero rewrite with real verified hits** (6.1) — 1-2 days

**Total effort: ~10-12 days of one engineer.** Combined expected impact: noticeably higher conversion, materially higher retention, and (most importantly) a viscerally different feeling of "this app cares about my outcomes."

---

## Locked-pick layout + ad-gated reveal (added 2026-05-12)

**Problem (user-flagged):** on the free tier, picks 1–4 each rendered as their own ~64px locked card with a `UPGRADE TO ORACLE+` pill — 4 cards × ~64px = ~256px of dead space on Home and Slates list view. Eats vital real estate, and the same upgrade affordance is repeated 4×.

**Shipped 2026-05-12 — visual compression + stubbed ad UI:**
- New `components/LockedPicksSummary.tsx` — single ~140px card replacing the 4 stacked locked cards. Shows `4 HIDDEN PICKS · Top-ranked · Oracle+ only` header, then 4 compact rows (`#1 ●●● [👁 Watch ad]` ... `#4 ●●● [👁 Watch ad]`), then a footer link `♛ Or upgrade for full access →`. Saves ~120px per surface.
- Wired into `app/(tabs)/index.tsx` Home and `app/(tabs)/explore.tsx` Slates list view. Grid view (Slates compact mode) intentionally unchanged — it shows all 6 picks in a 2×3 layout that's already screenshot-friendly.
- "Watch ad" button currently stubbed: tapping it shows a toast "👁 Watch-to-unlock launches soon — upgrade for instant access" and opens the paywall. UI is forward-compatible with a real rewarded-ad SDK; only the `onWatchAd` handler swap is needed.

**Deferred — real rewarded-ad SDK integration (Phase 3-adjacent):**
- **Library:** `react-native-google-mobile-ads` (Invertase). The legacy `expo-ads-admob` is deprecated as of Expo SDK 46+ and removed from Expo Go.
- **Blocker:** native build pipeline. The library does not work in Expo Go; needs EAS Build + dev builds. Same blocker as §1.4 phase 2 (push) and §3.1 phase 3 (paid streak restore).
- **Setup checklist when unblocked:**
  1. Add `react-native-google-mobile-ads` + `expo-build-properties` + `expo-tracking-transparency` to package.json.
  2. Add the Expo config plugin to `app.config.ts` with `androidAppId` and `iosAppId` (placeholder until AdMob account exists).
  3. Create Google AdMob publisher account; verify ownership via App Store / Play Store listing.
  4. Create a rewarded ad unit; replace `TestIds.REWARDED` with the production unit ID.
  5. Replace the `handleAdTap` stub in `index.tsx` and `explore.tsx` with a `RewardedAd.createForAdRequest().show()` flow that, on `EARNED_REWARD` event, marks the specific pick rank as unlocked for the session in component state.
  6. Per-session unlock cap recommended (e.g., 1 unlock per ad, max 4/day) to balance ad-fill against revenue dilution.
- **Revenue at scale:** rewarded video eCPM in tier-1 markets is **$15-$40** per 1000 ad views per AppLovin's 2025 benchmarks. Even modest free-tier engagement could meaningfully offset paywall friction.
- **Note on policy:** AdMob restricts ads on gambling apps but explicitly permits lottery analytics / data tools. HitMaster qualifies as analytics — no wagering occurs in the app.

## What this document is NOT

- A redesign. The current design language is strong. Almost every recommendation is additive or surgical.
- A feature wishlist. Every entry has a specific subscriber-retention argument attached.
- A criticism of past work. The v6/v7 chrome cleanup, the cosmic theme, the K6 pick card, the engine signal channels — all of it is excellent. This document is about turning excellent foundations into a product subscribers can't put down.

— end —
