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

### 2.2 Per-pick "verified by" footer (P1)
Under each pick card, when the pick has been historically evaluated, show: "245 picks of this energy band (90–100) have hit at **76%** historically." This converts abstract energy scores into concrete probability talk. We have the data in `daily_intelligence`. **Effort: 1 day.**

### 2.3 "Open the engine" tappable explainer (P2)
A "How was this pick made?" link on every pick card opens a sheet with the BOX/PBURST/CO/DGC signal breakdown as a horizontal bar chart, plus the cooldown status ("last seen 14 days ago"), the box-set frequency over the last year, and what got rejected for rail reasons. Most subscribers will never tap it — but its existence kills the "is this just random?" suspicion in one stroke. **Effort: 2 days.**

### 2.4 Surface the engine version and timestamp (P2)
Today the home shows "Powered by ZK6 Engine" as a static subtitle. Replace with "ZK6 v2.0 · slate generated 11:43 AM ET" so subscribers can see freshness. When data is stale (e.g., post-5/12 if rebuild hasn't run), show a yellow "🟡 Engine inputs last refreshed 2h ago" warning. **Effort: 2 hours.**

### 2.5 "Confidence ribbon" on the slate — ✅ Shipped 2026-05-12
**Where:** `app/(tabs)/index.tsx` — small pill in the K6 SLATE header row, with optional sub-line below for the LOW case.
**Logic:** counts K6 picks with `energy ≥ 70` (across all 6 real picks regardless of free/locked state — reflects engine output, not what the user can see).
- 6 of 6 → **HIGH CONFIDENCE** (cyan)
- 4–5 of 6 → **MEDIUM CONFIDENCE** (gold)
- < 4 of 6 → **LOW CONFIDENCE** (amber) + sub-line: "Thin slate — heavy cooldown overlap today"
**Why:** sets honest expectations on hard days. Reduces "why did the engine pick this garbage" frustration when cooldown rejection or yesterday-block forces the engine to dip into lower-energy combos to fill the K6.
**Note on doc deviation:** original spec mentioned `min(pickEnergies) / median(pickEnergies)` as the ratio. Implementation uses the simpler "count ≥ 70" approach which matches the doc's tier definitions directly and is easier to reason about than a ratio.

### 2.6 Verified hit ledger page (P1)
A new section in Account or under Intelligence: "Track record." A chronological list of every slate, marked with hit count, with each hit linked to the specific jurisdiction/draw. Subscribers love receipts. Today the data lives across `daily_intelligence` + `histories` — surfacing it takes one query. **Effort: 1 day.**

---

## 3. Habit — make daily opens reflexive

The app needs to be the first thing they check in the morning and the last thing before sleep. Every change here serves that.

### 3.1 Streak system upgrade (P1) — ✅ Phases 1+2 Shipped 2026-05-12
**Phase 1 — Threshold markers (UI):** the existing `🔥 Nd` pill in the Home header now also shows `· next M` where M is the next milestone above the current streak. Milestones: `[3, 7, 14, 30, 60, 90]`. Suppressed once a user clears the final tier.
**Phase 2 — Monthly streak freeze:** auto-granted at the start of each ET month, capped at 1 (non-stacking). Storage keys: `streak_freeze_last_grant` (YYYY-MM) and `streak_freezes_available` (count). When the user opens the app after exactly 1 missed day (`diffDays === 2`) AND has a freeze available, the freeze is auto-consumed and the streak continues at `prevStreak + 1` instead of resetting. Toast on use: `❄️ Streak freeze used — your N-day streak is safe!`. Multiple-day gaps (`diffDays > 2`) still break the streak — freezes don't cover them.
**Milestone celebration toasts:** when the streak crosses a milestone today (i.e., `newStreak > prevStreak` AND `newStreak ∈ STREAK_MILESTONES`), a celebration toast fires after init: `🔥 3-day streak! Keep it going.` / `🔥 1 week streak!` / etc. Sequenced after the freeze toast (1.8s delay) when both fire same session.
**Phase 3 deferred — paid streak restore modal:** "You broke your N-day streak yesterday. Tap to restore for $0.99." requires StoreKit/Google Play wiring (see Phase 3 / [BUG-65](#)). UI surface waits until subscription infrastructure lands.
**Why:** Duolingo's streak is the single most studied retention mechanic in apps. Pick 3 players are emotionally similar to language learners — daily ritual, small daily wins, fear of breaking the chain.

### 3.2 "Tomorrow's slate" preview at 9 PM ET (P2)
After the evening draw at 7:30 PM, around 9 PM ET show a card on Home: "Tomorrow's slate is being prepared — first analysis runs at 4 AM ET." Optional bell icon: "Notify me when ready." This turns "I'll check tomorrow" into "I'll be notified when the next slate drops." **Effort: half-day.**

### 3.3 Daily summary widget (push or in-app card) (P1)
A push notification each evening: "Today's recap: 1 BOX hit (Mississippi 065 → pick #2). Tomorrow's slate generates at 4 AM. Tap to view yesterday's analysis." Subscribers who didn't open the app during the day get pulled back at the moment of peak relevance. **Effort: 1 day.**

### 3.4 Per-jurisdiction follow lists (P2)
Today `Number Book` (`app/(tabs)/book.tsx`) lets users save combos. Extend it: let them "follow" specific states (NY, FL, etc.). The app filters everything to those states. Push notifications only fire for followed states' hits. Subscribers who play 2-3 specific states get a personalized app. **Effort: 1-2 days.**

### 3.5 Morning coffee mode (P2)
A toggle in Account: "Show me only the K6 picks, no chrome." Renders an ultra-minimal Home: just 6 big pick tiles, scope switcher, draw countdown. Power users who already know everything else just want their numbers fast. **Effort: half-day.**

### 3.6 Drawing-time auto-scope (P1 polish)
**Where:** `app/(tabs)/index.tsx` — `useScope` initialization.
**Logic:** before 1 PM ET, default scope to `midday`. Between 1 PM and 7 PM, default to `evening`. After 8 PM, default to `allday` for tomorrow's planning. Today the app remembers whatever scope you last selected — which means a user who checked evening picks last night opens at 9 AM today and sees evening picks already played. **Effort: 1 hour.**

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

### 4.2 "Last hit" persistent surface (P1)
A small pill at the top of every screen: "Last HitMaster hit: 605 in MS · 2h ago". Tap to see details. This keeps the win salient across the whole app, not just the home screen, not just today. **Effort: half-day.**

### 4.3 Personal hit history (P1)
On the Number Book screen, when a user saves a pick to a list and that pick later hits, mark the row with a 🎯. Show a personal "Your saved picks have hit X times" stat in Account. This makes the app's value personal, not just abstract. **Effort: 1 day.**

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

### 4.5 Smart picks-by-budget (P1)
Today the K6 slate is the same 6 picks. Add a budget input on Home: "$10 budget today?" → app suggests playing picks 1-3 as $1 box + $1 straight, picks 4-6 as $1 box only. "$5 budget" → just picks 1-3 as box. This converts the engine output into actionable play guidance for the casual subscriber. **Effort: 1 day.**

### 4.6 "Why this pick wasn't on the slate" lookup (P2)
A search box on Intelligence: "Did the engine consider 123?" → returns the rank, signals, why it was rejected (cooldown / yesterday-block / energy floor / box-set already picked). Power-user feature but kills the "did you miss this?" suspicion. **Effort: half-day.**

---

## 5. Engagement — turn passive subscribers into active ones

### 5.1 Community-style hit feed (P2)
A new tab or section: "Today's hits feed" — a chronological stream of every confirmed hit on the engine across all jurisdictions. Anonymized but real: "12:34 PM · pick #4 hit Florida midday · 943." Subscribers love seeing other people winning — it's the social proof and the FOMO at once. **Effort: 1 day (data is already there).**

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

### 5.6 "Hot box-sets right now" surface (P2) — ✅ Shipped 2026-05-12
**Where:** Home, between the loss/hit banner area and the ZK6 PICKS section.
**Renders:** `🔥 TRENDING   {2,4,8}  ·  {0,6,9}  ·  {1,3,7}` in an amber-tinted band.
**Logic:** new useQuery in `index.tsx` fetches today's snapshots for all 3 scopes (latest per scope wins). Each K6 pick's comboSet is aggregated; sets are ranked by (1) scope agreement count (a set appearing in 2 or 3 scopes' K6 ranks above a single-scope set), then (2) best energy across those scopes. Top 3 surface in the band.
**Empty state:** band suppressed when no snapshots exist for today.
**Why useful:** subscribers who play across scopes get a one-line "engine consensus" view without flipping between scopes manually.

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

### 6.2 Trial extension on hit (P1)
If a Free user has the app installed and the engine hits on the 2 picks they CAN see, push them: "Your free pick hit today! Try a 5-day Oracle+ trial to see all 6 → first hit free." Highly targeted, only fires when value is concretely demonstrated. **Effort: 1 day.**

### 6.3 "Save your streak" upsell (P2)
Tie streak (3.1) to monetization: streak breaks → "Restore your 12-day streak for $0.99" → micropayment. Even users who don't subscribe to monthly might do micro-purchases. **Effort: included in 3.1.**

### 6.4 Friend-of-a-subscriber discount (P2)
Existing referral mechanic with a twist: a Pro subscriber's first-time invitee gets 50% off their first month AND the inviter gets a free month if the invitee subscribes. Asymmetric reward favors the inviter, which gets them to invite again. **Effort: 2-3 days (RevenueCat coupon work).**

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

### 7.2 Empty states need personality (P2)
Most empty states are functional but bland. The slate empty state (`index.tsx:461`) just says "⚡ Computing your K6 Slate…". Replace with rotating playful copy: "ZK6 is consulting the data oracle…", "Sorting through 100,000 historical draws…", "Running 47 cooldown checks…", etc. Cheap personality. **Effort: 1 hour.**

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

### 8.1 Replace 🏠 home-tab emoji with a custom HitMaster crown glyph
The tab bar (`_layout.tsx:67`) uses raw emojis. On some Android skins these render inconsistently. Migrate to lucide-react-native icons (already imported elsewhere) for consistency. Use `Crown` for Home, `Zap` for Slates, `Target` for Results, `Bookmark` for Book, `GraduationCap` for Learn, `User` for Profile. **Effort: 1 hour.**

### 8.2 The cosmic background is wasted in many places
The theme has gorgeous gradients (`gradients.purpleRose`, `cyanPurple`) but most screens render flat backgrounds. Adding a subtle 5% opacity gradient overlay (e.g., diagonal cyan→purple) on the home + slates background would tie the brand together without overpowering content. **Effort: 1 hour.**

### 8.3 Number-Book empty state is dull
Today: an empty list with `BookOpen` icon. Add: an interactive "Try a sample list" button that auto-creates a "NY Favorites" list with 3 popular box-sets and an explanatory tooltip. First-run gold. **Effort: 2 hours.**

### 8.4 Heat-check entry point is hidden in the overflow sheet
**Where:** `app/(tabs)/index.tsx` — Heat Check moved to overflow per v6 patch.
**Recommendation:** add a small persistent "🔥 Check any number" FAB (floating action button) in the bottom-right corner of every screen. Heat checks are one of the most valuable free-tier teasers and they're currently 2 taps away. **Effort: 2 hours.**

### 8.5 Add scope-specific visual identity
Midday slates → warm gold accents. Evening → cool blue/purple. Allday → green/teal. The data is the same engine; the visual mood signals "this is different time of day." Subtle but reinforces context. **Effort: 1 day.**

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
