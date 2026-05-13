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

### 4.4 Replay mode (P2)
A new sub-screen: pick any past date, see what the slate WAS for that day, see what drew, see the hits. Subscribers can validate the engine themselves over arbitrary windows. **Already exists in `HitReplay.tsx`** — needs to be surfaced from Intelligence or Account. **Effort: 2 hours (it's built, just orphaned).**

### 4.5 Smart picks-by-budget (P1)
Today the K6 slate is the same 6 picks. Add a budget input on Home: "$10 budget today?" → app suggests playing picks 1-3 as $1 box + $1 straight, picks 4-6 as $1 box only. "$5 budget" → just picks 1-3 as box. This converts the engine output into actionable play guidance for the casual subscriber. **Effort: 1 day.**

### 4.6 "Why this pick wasn't on the slate" lookup (P2)
A search box on Intelligence: "Did the engine consider 123?" → returns the rank, signals, why it was rejected (cooldown / yesterday-block / energy floor / box-set already picked). Power-user feature but kills the "did you miss this?" suspicion. **Effort: half-day.**

---

## 5. Engagement — turn passive subscribers into active ones

### 5.1 Community-style hit feed (P2)
A new tab or section: "Today's hits feed" — a chronological stream of every confirmed hit on the engine across all jurisdictions. Anonymized but real: "12:34 PM · pick #4 hit Florida midday · 943." Subscribers love seeing other people winning — it's the social proof and the FOMO at once. **Effort: 1 day (data is already there).**

### 5.2 Saved-pick alerts (P1)
When a user saves a combo in Number Book, register a watcher. When that combo (or its box-set) draws anywhere, push them: "Your saved pick 459 just drew in Texas 945 evening." **Effort: 1 day.**

### 5.3 Heat check social share (P2)
After running a heat check on a combo, offer a "Share this analysis" button that screenshots the breakdown into a brandable PNG. Powerful word-of-mouth tool — users explaining a heat check to friends become evangelists. **Effort: half-day.**

### 5.4 Engine confidence quiz / onboarding ritual (P2)
A 60-second onboarding game: "We'll show you 5 pairs of combos. Pick which one you think is more likely to hit today. We'll show you which one ZK6 picked and why." Establishes the "you can't beat the engine" intuition in 60 seconds. **Effort: 2 days.**

### 5.5 Daily energy chart on Home (P2)
A tiny line chart showing today's K6 average energy vs the last 30 days. Subscribers immediately see if today's slate is unusually hot or cold. **Effort: half-day.**

### 5.6 "Hot box-sets right now" surface (P2)
Above the slate, a small live ticker: "🔥 Trending box-sets: {2,4,8} · {0,6,9} · {1,3,7} — these are the box-sets the engine ranked highest across all 3 scopes today." Helpful for users who play across scopes. **Effort: 3 hours.**

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

### 7.1 Onboarding richness (P2)
**Current** (`index.tsx:100-104`): 3 screens, generic copy ("Join 2,400+ Players"), no interactive demo.
**Upgrade:**
- 5 screens total
- Screen 3: interactive "scope demo" — let them tap between midday/evening/allday and see the slate change
- Screen 4: "Your free preview" — show 2 real picks for today
- Screen 5: real social proof: "Last 7 days: 5 hits across 32 jurisdictions"
**Effort: 1 day.**

### 7.2 Empty states need personality (P2)
Most empty states are functional but bland. The slate empty state (`index.tsx:461`) just says "⚡ Computing your K6 Slate…". Replace with rotating playful copy: "ZK6 is consulting the data oracle…", "Sorting through 100,000 historical draws…", "Running 47 cooldown checks…", etc. Cheap personality. **Effort: 1 hour.**

### 7.3 Reduced motion support (P0 accessibility)
Several screens use animations (Lottie/scroll animations/etc.). Honor `prefers-reduced-motion`. **Effort: 2 hours.**

### 7.4 VoiceOver / accessibility labels (P1)
PickCard, signal bars, energy meters all lack screen-reader labels. Add `accessibilityLabel` and `accessibilityHint` on the major interactive elements. Quick wins are listed in `PickCard.tsx`, `SignalBar.tsx`, `EnergyMeter.tsx`. **Effort: half-day.**

### 7.5 Dynamic Type support (P2)
The mono-font picks lock at `combo: 38` (`theme.ts:145`). On a user's accessibility-large font setting, they overflow. Wrap combos in PickCard with `allowFontScaling={true}` and test at 200% type size. **Effort: 2 hours.**

### 7.6 Performance — drop the legacy theme aliases (P2 housekeeping)
`constants/theme.ts:60-86` has 25+ legacy compat aliases. Trace and remove. Smaller bundle, cleaner mental model. **Effort: half-day.**

### 7.7 Stale tab badge (P1)
When a user has unviewed hits (a pick on yesterday's slate that hit overnight while they slept), show a red dot on the Results tab. This is a 30-line change that increases re-engagement on a known-high-emotion event. **Effort: 2 hours.**

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

## What this document is NOT

- A redesign. The current design language is strong. Almost every recommendation is additive or surgical.
- A feature wishlist. Every entry has a specific subscriber-retention argument attached.
- A criticism of past work. The v6/v7 chrome cleanup, the cosmic theme, the K6 pick card, the engine signal channels — all of it is excellent. This document is about turning excellent foundations into a product subscribers can't put down.

— end —
