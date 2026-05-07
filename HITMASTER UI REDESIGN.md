HITMASTER — BRIGHT & FUN UI REDESIGN FOR CONVERSION (NO CODE)
Audience: AI Mobile App Engineer (needs step‑by‑step)
North Star: “The secret of winning” — make the path to smarter picks feel exciting, transparent, and responsible. Design to convert Free → Premium → Plus. (Admins are ALWAYS Plus.)

0) BRAND & TONE (apply globally)
• Visual energy: dont stray far fronm the current visual theme. 2xl–3xl rounded cards, soft shadows, playful crown gradients.
• Motion: fast (150–250ms) ease‑out fades/slide‑ups, subtle micro‑glows on “hot” items; respect reduced‑motion.
• Numbers: tabular numerals for readability; clear badges for tiers: FREE, PRO (Premium), PLUS (Admin).

1) ROLE & ACCESS MODEL (enforce everywhere)
• Free: sample slate, 1/day Heat Check, 15‑min delay, summary reasons only.
• Premium (PRO): full K‑slate, unlimited Heat Checks, Pick‑by‑Budget, live updates, detailed reasons, full previous hits.
• Plus: everything in Premium + early‑access toggles, deeper analytics, priority support. (Admins are Plus by definition, with Admin Tools visible.)
• Gating component: PremiumGate wraps all premium/plus modules; inline lock card with Upgrade CTA; optional modal variant with “Maybe Later”. Badges: PremiumBadge (“PRO”), ComingSoonBadge (“Coming <date>”).

2) PRIMARY IA & ROUTES (bright, fun, conversion‑first)
Tabs
• Home — /(tabs)/home
• Slates — /(tabs)/slates
• Results — /(tabs)/results
• Profile — /(tabs)/profile
• Settings — /(tabs)/settings
Secondary
• Paywall — /paywall
• Heat Checker — /heat-checker
• Pick by Budget — /pick-by-budget
• Learn — /learn
• Coming Soon — /coming-soon
• Test Backend & Run‑2E — /settings/test-backend (linked from Settings and Admin Tools)

3) STATUS RIBBON (top of Home/Slates/Results)
• Shows: Tier (FREE/PRO/PLUS), Backend: Online/Offline, Last Slate ET, “Norm: percentile • Winsor: p99”, coverage chips (H01Y ✓, H0nY ⌛). Tappable → opens “What these mean” sheet.

4) PAYWALL SYSTEM (conversion landing)
Where it appears
• Inline lock: PremiumGate replaces premium features with lock card → Upgrade CTA → routes to /paywall.
• Badges on premium content: PRO crown; Coming soon uses ComingSoonBadge.

/paywall Screen
• Header: Back chevron → router.back()
• Hero: gradient crown, title “Unlock HitMaster Premium”, subtitle “Go beyond the sample — unlock the full slate.”
• Coming Soon (value build‑up with countdowns updating every minute):
  1) HitMaster 3 Straight
  2) HitMaster 3 State
  3) HitMaster 4 Box
• Current Premium Features — side‑by‑side comparison (icon + title/desc; Free vs Premium cells):
  - Full K6 Slate: Free=No, Premium=Yes
  - Unlimited Heat Checks: Free=1/day, Premium=Yes
  - Pick by Budget: Free=No, Premium=Yes
  - Live Updates: Free=15‑min delay, Premium=Yes
  - Detailed Reasons: Free=No, Premium=Yes
  - Previous Hits: Free=Summary, Premium=Full
• Plan picker (select exactly one; visual selection state):
  - 5‑Day Access $4.99 (best for new users; no auto‑renew) + tiny checklist
  - Monthly $9.99/mo
  - Annual $89.99/yr (SAVE 25%)
• Social proof: testimonials carousel
• CTAs & Legal:
  - Subscribe (button text reflects selected plan) → purchaseSubscription(selectedPlan) → on success route /(tabs)/home → toast “Welcome to Premium!”
  - Restore Purchase → restorePurchases() → on success route /(tabs)/home
  - Terms, Privacy links (tappable)
• Plus upgrade upsell (visible to Premium): “Go Plus” banner (early features, deeper analytics, priority support).

5) FIX “SUBSCRIPTION SHORTCUTS” (confusing today)
Problem
• Scattered shortcut buttons lead to inconsistent flows and unexpected logins.

Fix
• Single source of truth: ALL upgrades/restore funnel to /paywall.
• Plan‑aware deep links:
  - /paywall?plan=trial5
  - /paywall?plan=monthly
  - /paywall?plan=annual
• Rename shortcuts (examples):
  - “Try Premium 5 Days — $4.99” → ?plan=trial5
  - “Go Premium Monthly — $9.99” → ?plan=monthly
  - “Go Premium Annual — $89.99” → ?plan=annual
  - “Restore Purchase” → /paywall (focus restore area)
• Login alignment: If auth is needed, open a compact login sheet ON /paywall; keep selected plan after login.

6) “TEST BACKEND & RUN‑2E CHECK” PAGE (trust & support)
Route & Access
• /settings/test-backend — visible to all; Admin sees extra diagnostics.

Cards
1) Connection Test — ping health endpoint (e.g., health.check RPC) → shows latency, ✅/❌, timestamp.
2) Snapshot Read Test — read v_latest_slate_snapshots for Midday/Evening/All‑Day → show last updated ET, hash tail, item counts.
3) Entitlement Check — current tier, eligible features, storekit/IAP status.
4) Run‑2E Slate Regen (Admin only) — dry‑run materializer RPC → returns {class coverage, rows touched, gen time, new hash}; compare to latest hash (determinism check).
5) Imports Health (Admin only) — last 5 imports: status, warnings; links to Import History.

Actions
• Run All Tests, Copy Diagnostics, Open Admin Tools (Admin), Contact Support.
Output
• Human‑readable plus expandable JSON. Never crash; show actionable messages.

7) “COMING SOON” PAGE (3 true items)
Route
• /coming-soon — linked from Home banners and Paywall.

Content
• Three features with countdowns + “Notify Me”:
  1) HitMaster 3 Straight
  2) HitMaster 3 State
  3) HitMaster 4 Box
• Progress chips: “In Build • QA • Launch”. For Plus (Admins), show Early Access ribbons where relevant.
• Under‑the‑hood banner (read‑only, tasteful): our internal enhancements in flight:
  - Multi‑pass scoring v2 (recency/presence/integrity/heat/verification; per state/game tunable).
  - Pattern‑aware combos (co‑occurrence without overfitting).
  - Adaptive heat model (per‑state decay, cold‑start smoothing, outlier dampening).
  - Backtest harness (fixed‑seed replays; diagnostics).
  - Explainability (rationale, factor breakdown, lineage).
  - Risk tiers (conservative/standard/aggressive; strike‑probability ranges).

8) SCREEN CONTENT (fill with bright, fun patterns)
Home /(tabs)/home
• Hero: “Today’s Heat” meter + friendly crown mascot.
• Actions: Heat Checker, Pick by Budget, Learn, Paywall, Slates.
• Sections: Trial banner, Lite vs Premium Slate cards, Recent Winners (✅ badges), Engine Status, Responsible Play.
• PremiumGate on full slate for Free users.

Slates /(tabs)/slates
• Ranked K6 with micro‑bars (BOX/PBURST/CO), BestOrder & TopPair chips, ✅ winners (excluded today). Filters: scope Midday/Evening/All‑Day, Singles/Doubles.

Results /(tabs)/results
• Performance metrics (Avg Score, Hit Rate, Consistency, Improvement), Weekly performance chart, “What moved today”, “Today’s exclusions”.

Profile /(tabs)/profile
• Tier (FREE/PRO/PLUS), subscription status, upgrade/restore paths, receipts (if supported), Support & Responsible Play.

Settings /(tabs)/settings
• App preferences (theme, motion), role badges. For Admin: Import Wizard, Health, Test Backend & Run‑2E, Logs/Audit, Engine Settings. Link to Paywall and Coming Soon.

9) ADMIN UX — IMPORTS & SLATE REGEN (clarity + trust)
Import Wizard (Admin)
• Lanes: History (Box & Pair), Daily/ Ledger.
• Steps: Upload → Validate (line‑level; auto‑fix preview: zero‑pad pairs, sort box digits, parse dates, DS≥0) → Review (class, horizon H01Y..H10Y, scope) → Commit → IMPORT CONFIRMATION MODAL.
• Confirmation Modal shows ImportSummary {accepted, rejected, fixed, warnings, p99_cap, first/last_seen} + “View details”.
• Import History page: searchable, paginated; row → Detail Drawer (normalized preview, p99 map version, blend impact). Soft Delete/Undo with server rollback & recompute.
• Horizon Coverage Matrix: classes × H01Y..H10Y (✓ / ⌛ / —); click a gap → prefilled import flow.

Slate Regeneration (Admin)
• Triggers: new horizon import, Daily Input, Ledger commit, manual button, health repair.
• Deterministic pipeline: BOX*, PBURST*, CO* → Indicator = 0.40/0.40/0.20 (+ multiplicity prior); rails: same‑day exclusion, K6 quotas (Singles≤4, Doubles≤2, Triples off), pair repetition cap (≤2 same TopPair), Mid↔Eve guard; sort: Indicator → longest‑horizon Box DS → lexicographic; snapshot: ET timestamp, horizons_present, weights, Top‑K, content hash.
• UI: toast “Slates regenerated (Midday) • 10:12 ET • Hash …7F”; Health shows latest N hashes + determinism compare.

10) CONVERSION COPY HINTS (“secret of winning” tone)
• “Turn today’s heat into smart picks.”
• “See the full slate, not just the sample.”
• “Your edge: live updates + detailed reasons.”
• “Join Plus for early access and deeper insights.”
• Keep a Responsible Play footer with link from Home and Results.

11) IMPLEMENTATION STEPS (do in this order)
[ ] Update theme tokens (colors, radii, shadows, badges, numerals) and apply to core components.
[ ] Add/standardize Status Ribbon component; wire to live snapshot metadata and tier.
[ ] Wrap premium surfaces in PremiumGate; remove ad‑hoc prompts; route all upgrades to /paywall.
[ ] Build /paywall: hero, countdowns, comparison, plan picker, testimonials, Subscribe/Restore/Legal; implement plan deep‑links and login sheet on /paywall.
[ ] Replace “subscription shortcuts” with deep‑linked buttons (trial5, monthly, annual) and a single Restore entry.
[ ] Build /coming-soon: three features with countdowns, Notify‑Me, under‑the‑hood banner.
[ ] Build /settings/test-backend: 5 cards (Connection, Snapshot Read, Entitlement, Run‑2E, Imports Health) + Run All Tests + Copy Diagnostics.
[ ] Admin Import flows: Review step + Import Confirmation modal; Import History + Detail Drawer; Soft Delete/Undo; Horizon Coverage Matrix.
[ ] Slate regeneration UX: add deterministic hash in toasts and Health; ensure rails & sort order are enforced.
[ ] Final pass: accessibility (hit targets ≥44px, reduced motion), analytics events (Paywall Viewed, Plan Selected, Subscribe, Restore, PremiumGate Viewed, Import Committed, Slate Regenerated).

12) ACCEPTANCE CRITERIA
• Free hits a locked feature → sees PremiumGate → /paywall → plan selected → subscribe/restore → routed home with PRO badge.
• fun visuals consistent across Home/Slates/Results; micro‑bars and badges make “secret of winning” feel tangible and exciting.
• Admin receives Import Confirmation after every commit; can view history, soft delete/undo, and fill horizon gaps via matrix.
• /settings/test-backend passes when healthy and provides clear diagnostics on failure.
• Slates regenerate deterministically with visible hash; ribbon shows live ET and coverage chips.
• Role gating is correct: Admin=Plus; Free vs Premium boundaries enforced.

END OF PROMPT — Build boldly for conversion. Keep it playful, transparent, and deterministic.
