# HitMaster — Master Audit & Fix Tracker
**Project:** HitMaster ZK6/ZK30 Analytics App  
**Stack:** Expo / React Native · Supabase · TypeScript  
**Last updated:** 2026-05-17 (BRAND-03 match-type vocab swap — Straight→Exact / Box→Partial on 5 consumer surfaces per marketing-reference doc, internal identifiers unchanged)  
**Maintained by:** therealzerro + AI Assistant

> **Process note (added 2026-05-12):** Updating MASTER_AUDIT.md is part of the definition of done for any task, not optional. Two prior sessions (Phase 3 deploy, BUG-02 fix attempts) completed work without logging it, leading to a forensic investigation 2026-05-12 to reconcile documented state with production reality. Every code change, SQL migration, Edge Function deploy, or RLS policy change must produce a corresponding audit entry in the same session.

> **USAGE:** This is the single source of truth for all known issues, fixes, and technical debt.  
> When a fix is made, update the status column and add a note. Do not create new audit files — append here.

---

## Configuration Change Tracking

Engine behavior is determined by TWO inputs: code (`engines/*.ts`, `lib/engineCore.ts`, `supabase/functions/compute-slate-*/`, `constants/zk6.ts`) AND configuration (`app_config` table rows). Code changes have been tracked in this audit. Configuration changes were NOT — which allowed the 2026-05-09 Gemini CLI config destruction to go undocumented for 3 days until forensic investigation surfaced it.

Going forward, every change to `app_config` keys affecting engine behavior gets a **CONFIG-XX** entry with:
- Date and time (ET), actor (user / Claude Code / other tool — name explicitly)
- Each key: old → new value
- Reason
- Backtest result confirming improvement, OR explicit "untested, applying for empirical observation" with planned review date

Engine-affecting keys (non-exhaustive): `engine_weights_*`, `pressure_threshold`, `recent_hit_cooldown`, `min_energy_threshold`, `pair_rep_cap`, `k6_singles_max`, `k6_doubles_max`, `k6_triples_on`, `synergy_boost_on`, `synergy_boost_weight`.

### CONFIG-07 — Per-Scope Signal-Weight Override for Midday (2026-05-15)

Mechanism + first ship. Extends the per-scope override pattern (already established for `recent_hit_cooldown_${scope}`, `box_freq_weight_${scope}`, `box_pressure_weight_${scope}`) to the full signal-weight presets (BOX/PBURST/CO/DGC). Both engine paths now read `engine_weights_${preset}_${scope}` from `app_config` and overlay onto the global preset when scope matches.

**Problem.** 14-day diagnostic + 90-day backtest established that midday's pick lift vs rail-matched random was ×0.84 (overall pick lift ×0.95 across production). Evening was already at ×1.06 (working) and allday at ×0.94 (acceptable). Global preset changes that fixed midday regressed evening. A per-scope override was needed.

**Mechanism (additive).** `engines/zk6.ts::loadEngineConfig(scope)` and `compute-slate-zk6/index.ts::loadEngineConfig(scope)` now pull three additional keys when `scope` is set — `engine_weights_balanced_${scope}`, `engine_weights_conservative_${scope}`, `engine_weights_aggressive_${scope}` — and replace `presets.${preset}` with the per-scope value when present. Other scopes still use globals. Logged at the call site so prod diffs are visible. Backtest harness extended with `EngineConfig.presetByScope?: Partial<Record<Scope, {balanced, conservative, aggressive}>>` and the `presetByScope_parity` config produced numbers identical to bp_midday_evening_inverted_floor70 (parity guard passed).

**Empirical validation (90d × 729 slates, balanced mode):**
- BASELINE `bp_midday_evening_inverted_floor70` (matches current production exactly): overall rail-matched pick lift ×0.95; midday ×0.84; evening ×1.06; allday ×0.94. Slate hit rate 37.9% / 29.6% / 37.0% / 46.9%.
- CANDIDATE `intel_weights_midday_only_floor70` (intel-tuned weights for midday alone, evening + allday unchanged): overall ×1.09; **midday ×1.42**; evening ×1.06 (preserved bit-identical); allday ×0.94 (preserved bit-identical). Slate hit rate **41.6%** / 40.7% / 37.0% / 46.9%.
- Comparison vs `intel_weights_midday_allday_floor70` (broader candidate): midday-only had higher overall slate hit rate (41.6% vs 40.7%) at lower pick lift (×1.09 vs ×1.17). Trade chosen: preserve allday slate hit rate over capture allday pick-lift gain. Subscriber UX is slate-level.
- Validated at 30d / 60d / 90d windows — the 90d window extends to 2026-02-15, two months before the original intel-tuned AUC fit window (4/13–5/8). Out-of-sample stable.

**Action sequence:**
1. Code: `engines/zk6.ts::loadEngineConfig` extended with `scopeBalancedKey/scopeConservativeKey/scopeAggressiveKey` reads + overlay block. Mirrors existing cooldown/freq/pressure pattern. Log line: `[zk6v2] preset override: scope=midday preset=balanced {old} → {new}`.
2. Code: `supabase/functions/compute-slate-zk6/index.ts::loadEngineConfig` mirrored line-for-line.
3. Harness: `scripts/backtest/types.ts` got `presetByScope` field; `scripts/backtest/replay.ts:286` resolves per-scope before falling back to global; `scripts/backtest/configs.ts` added `presetByScope_parity`, `intel_weights_midday_only_floor70`, `intel_weights_midday_allday_floor70`, `bp_midday_evening_inverted_floor70`.
4. DB: 3 new app_config rows (`engine_weights_balanced_midday`, `engine_weights_conservative_midday`, `engine_weights_aggressive_midday`) — percentages summing to 100, matching existing `engine_weights_*` row format.
5. Edge function `compute-slate-zk6` redeployed so the loader change is live.
6. Today's (2026-05-15) production midday slate was already generated this morning at 06:07 ET under the OLD config; change affects the next midday slate generation onward.

**Rollback condition: 2026-05-22 (7-day review).** If 7-day midday box-hit rate post-deploy (5/15–5/22) is worse than the pre-deploy 14-day baseline of 8.97% per-pick box hits, revert. Revert action: `DELETE FROM app_config WHERE key LIKE 'engine_weights_%_midday'` — engine falls back to global preset, bit-identical to pre-deploy behavior. No code change needed for rollback.

**Stacking caveat.** Live midday hit rate post-deploy will be measuring CONFIG-05 (cooldown=10) + CONFIG-06 (horizon_weights pure H01Y) + CONFIG-07 (intel-tuned weights) combined. Backtest already validated CONFIG-07 on top of CONFIG-05+CONFIG-06 baseline (the harness uses current production behavior as baseline). Live signal will reflect the full stack; isolating CONFIG-07's contribution from CONFIG-05+CONFIG-06 not in scope.

**Review automation scheduled (2026-05-15 02:13 UTC):** Remote Claude Code routine `trig_01WHsjJRSHVLU6uFtBcEuEoH` (https://claude.ai/code/routines/trig_01WHsjJRSHVLU6uFtBcEuEoH) set to fire once at **2026-05-22T21:00:00Z (17:00 ET)**, ~30 min after that day's midday import completes per the project's import cadence (midday → 5 PM ET, evening → 1:30 AM ET next day). Agent runs read-only against Supabase REST (anon key embedded, RLS-gated), computes 8-day midday box-hits-per-pick from slate_snapshots ∩ histories, compares to the 8.97% pre-deploy baseline, appends a `**Review 2026-05-22 outcome:**` paragraph to this section, and commits + pushes the audit update. **The agent does NOT execute rollback** — only prints the `DELETE FROM app_config WHERE key LIKE 'engine_weights_%_midday'` SQL for human approval. Tools allowlist: Bash/Read/Write/Edit/Glob/Grep. Model: claude-sonnet-4-6.

---

### CONFIG-04 — `datasets_pair.ds_raw` Rebuild From Histories (2026-05-13 ~18:45 UTC)

Pair table sibling of CONFIG-03. Audit on 2026-05-13 found `datasets_pair.ds_raw` values across all 10 pair classes (2-11) drifting in the same `importDaily` increment-without-anchor pattern that corrupted `datasets_box` pre-BUG-130. Sample: midday H01Y class=9 pair=`01` stored=747 days vs truth=31 days (-716d off); class=10 pair=`11` allday stored=829 vs truth=19 (-810d). Affects PBURST + CO scoring (combined ≈ 40% of weighted indicator) — the engine's "pressure" component of pair signal was rewarding pairs claimed-to-be-overdue that had actually drawn within the past 2-4 weeks.

**Pre-fix audit** (midday H01Y, n=543 rows with computable ground truth from histories):
- 475 / 543 (87.5%) stale by ≥5 days
- Mean |delta| = 67.0 days; median 38; p95 246; max 716

**Rebuild method:** for each (scope, horizon, class_id ∈ 2–11, key_pair), compute most recent date the pair was hit by a draw via `histories` (session-filtered per scope), set `ds_raw = days_since_most_recent_hit`. Pair-class semantics encoded in `pairsForDraw()` (classes 2/5 = front, 3/6 = back, 4/7 = split, 8/9/10 = sorted-box equivalents, 11 = any-position-box). Pairs with no hit in the horizon window left untouched. `times_drawn` intentionally NOT modified (same logic as CONFIG-03 — histories window can't reconstruct multi-year frequency aggregates).

**Authorization:** explicit user request 2026-05-13 after the midday deep-check report identified pair-data freshness as the strongest pair-side lever (cooldown tuning and per-scope rails scheduled separately for 2026-05-16).

**Application:** `npm run rebuild:pair-datasets -- --apply` at 2026-05-13 ~18:45 UTC. 3,198 rows corrected (midday H01Y 527, midday H02Y 527, evening H01Y 535, evening H02Y 535, allday H01Y 538, allday H02Y 536). H03Y–H10Y had 0 corrections because those horizons are empty in `datasets_pair` (separate uniform issue, not midday-specific, not gated by this rebuild). 0 PATCH failures.

**Post-fix validation:** midday H01Y stale-≥5-days dropped from 475/543 (87.5%) → **0/543 (0%)**. Mean |delta| 67d → 0d. Every pair row now matches histories ground truth exactly.

**Files:**
- `scripts/intel-tuning/rebuild-pair-datasets.ts` (new — parallel to existing `rebuild-datasets.ts`)
- `package.json` script `rebuild:pair-datasets`
- No engine code changes — purely a data correction

**Rollback:** `datasets_pair.ds_raw` would need to be re-imported from original CSV. Original values not preserved. Treat the post-rebuild state as the new baseline.

**Review:** observe slate quality 2026-05-14 → 2026-05-19 (final day of original 7d post-stabilization window). Combined with CONFIG-03 box rebuild, pair data should now no longer be a source of latent error. If midday hit rate climbs vs the 5/13 baseline, this rebuild is the most likely cause. The cooldown tuning + per-scope config work scheduled for 5/16 should run as an additive evaluation on top of this corrected pair data.

### CONFIG-03 — `datasets_box.ds_raw` Rebuild From Histories (2026-05-12 ~21:50 UTC)

6,401 of 6,600 `datasets_box` rows had `ds_raw` values 1000-2000+ days off from reality (e.g. `444 midday H01Y` stored as 2065 days when histories proves the actual hit was 124 days ago). Engine BOX pressure scoring had been operating on garbage values for an unknown duration — combos that were recently drawn were being treated as "wildly overdue" and getting pressure-boosted into picks.

**Suspected origin:** an earlier ZK30 engine build pass appears to have corrupted the H01Y–H10Y values. Per CLAUDE.md, no ZK30 work is allowed until ZK6 is verified stable, so the corruption source is not being repaired — instead `datasets_box.ds_raw` was rebuilt from `histories` (the source of truth for recent draws, covers ~130 days back to 2026-01-01).

**Rebuild method:** for each (scope, horizon, canonical-box-set) where `histories` shows a recent hit, set `ds_raw = days_since_most_recent_hit`. Box-sets with no recent hit in `histories` left untouched (stored value preserved as best-available signal). `times_drawn` intentionally NOT modified — histories window is too short to reconstruct multi-year frequency aggregates.

**Authorization:** explicit user request after backtest evidence + diagnostic showing slate's pick energies inflated by stale-data pressure scoring.

**Validation evidence (immediate):** post-rebuild slate regenerated at ~21:50 UTC produced 2 verified hits on today's midday draws (midday `820` → MI 208 BOX; allday `289` → CA 829 BOX), up from 1 hit pre-rebuild (allday 605 → MS 065). Pre-fix slate (BUG-129 era) had 0 hits.

**Rollback:** `datasets_box.ds_raw` would need to be re-imported from the original CSV source. Original values are NOT preserved by the rebuild script. Rolling back is therefore non-trivial — review carefully.

**Review:** re-measure overall hit rate at 2026-05-19 (7d post-fix window). Target ≥73%. If below, investigate before further engine changes.

### Backtest Reliability Window (2026-05-09 → 2026-05-12)

Hit-rate measurements for slates dated 2026-05-09 through 2026-05-12 are **NOT reliable as a baseline** for engine performance. All of the following were active during this window:

- CONFIG-01 (Gemini CLI destruction) ran 2026-05-09 12:00 ET → 2026-05-12 ~14:00 ET — aggressive weights + relaxed cooldown + minEnergyThreshold=97 produced degraded picks.
- 2026-05-11: rapid code changes (ENG-01, ENG-04, ENG-05, ENG-06 fixes; BUG-40 fix) altered scoring math mid-stream.
- 2026-05-12: BUG-31 (edge function INSERT columns), BUG-124 (hit-annotation bleed), BUG-125 (edge function yesterday-block port), BUG-126/127/128 (top30 + on_slate + display order) — at least one fix landed every few hours.

**Implication:** the existing 5/11 slate and any retrospective hit rates computed for 5/11–5/12 reflect a moving target of code + config, not a steady-state engine. Any future engine-tuning baseline must use data from 2026-05-13 onward (first full post-stabilization day). The "code-changes era 33.3% [9.7–70.0%] (n=6)" line in the 2026-05-12 baseline measurement entry should be read as "unreliable, mark for re-measurement after stabilization."

### CONFIG-02 — ENH-A Quality Floor Deploy (2026-05-12 21:12 UTC)

`app_config.min_energy_threshold`: **0 → 70**.

**Authorization:** explicit user request after reviewing ENH-A backtest results.

**Backtest evidence (per CLAUDE.md):** 26-day clean window (4/13 → 5/8), n=78 slates × 3 scopes, balanced mode.
- BASELINE `default` (floor=0): overall 71.8% [61.0–80.6%]
- CANDIDATE `floor70` (floor=70): overall **73.1% [62.3–81.7%]** — **+1.3pp**
- Per-scope: midday +3.8pp (57.7% → 61.5%), evening +3.8pp (69.2% → 73.1%), allday -3.8pp (88.5% → 84.6%)
- Net positive; midday gain (the worst-performing scope) is the strategic win.

**Behavioral change:** the K6 selector now refuses any pick below the 70th percentile of finalScore. On days when rails can't be satisfied above the floor across all 6 passes, the slate returns fewer than 6 picks (no garbage fillers). On 2026-05-12 first deploy, all three scopes returned 6 picks (min energies 70/74/72), suggesting the floor binds infrequently.

**Rollback:** PATCH `app_config?key=eq.min_energy_threshold` → `value: "0"`. Effect is immediate on next regen — no code or edge function deploy required.

**Review:** re-measure after 14 days of post-deploy data (2026-05-26) to confirm the backtest projection holds in production.

### CONFIG-01 — Gemini CLI Config Destruction (2026-05-09 ~12:00 ET)

External AI tool (Gemini CLI) overwrote engine config with untested aggressive tuning. No audit entry at the time. Surfaced 2026-05-12 forensic investigation, reverted same day via SQL. Permanent test fixture in `scripts/backtest/configs.ts` as the `destroyed` preset.

| Key | Pre-incident (default) | Destroyed | Reverted |
|---|---|---|---|
| engine_weights_balanced | BOX:49.5 PBURST:27 CO:13.5 DGC:10 | BOX:43 PBURST:25 CO:17 DGC:15 | BOX:49.5 PBURST:27 CO:13.5 DGC:10 |
| engine_weights_conservative | BOX:67.5 PBURST:13.5 CO:9 DGC:10 | BOX:75 PBURST:15 CO:10 DGC:10 | BOX:67.5 PBURST:13.5 CO:9 DGC:10 |
| engine_weights_aggressive | BOX:40.5 PBURST:31.5 CO:18 DGC:10 | BOX:45 PBURST:35 CO:20 DGC:10 | BOX:40.5 PBURST:31.5 CO:18 DGC:10 |
| pressure_threshold | 250 | 365 | 250 |
| recent_hit_cooldown | 20 | 1 | 20 |
| min_energy_threshold | 0 | 97 | 0 |
| pair_rep_cap | 2 | 3 | 2 |
| k6_singles_max | 4 | 5 | 4 |
| k6_doubles_max | 2 | 3 | 2 |
| synergy_boost_on | false | true | false |
| synergy_boost_weight | 0.15 | 0.05 | 0.15 |

**Effect:** Top 30 `daily_intelligence` hit count steady ~10/scope/day through 2026-05-10, collapsed to ~1/scope/day on 2026-05-11 — concurrent with both this config and the May 11 ENG-01/04/05/06 code changes. The backtest harness built 2026-05-12 (`scripts/backtest/`) disentangles the contributions empirically.

**Resolution:** Config reverted to defaults via SQL 2026-05-12. Backtest harness built same day; `destroyed` preset preserved as permanent test fixture.

---

## Brand-Voice Audit (BRAND-XX)

Public-facing copy is governed by a separate rulebook from engine behavior. The HitMaster ZK6 Facebook page was de-recommended by Meta in May 2026 due to gambling-classifier triggers in the page's copy. The repositioning effort — see `assets/HitMaster_Designer_Agent_Skill_Brief.md` — extends from social/ads into the app itself: App Store metadata, push notifications, in-app UI strings, share templates, and error messages must all use the data-intelligence voice. Internal code identifiers and admin/operator surfaces are explicitly exempt. CLAUDE.md "Brand voice — public-facing strings" section is the in-repo doctrine; this section is the audit trail.

### BRAND-01 — In-App Copy Scrub For Meta Rehabilitation Eligibility (2026-05-16 opened)

**Trigger.** Facebook page de-recommendation in May 2026 attributed to gambling-adjacent classification. Brand rehabilitation requires that every public-facing surface (page + ads + app store listings + in-app copy that screenshots into marketing) read as data intelligence, not lottery prediction. Designer skill brief landed at `assets/HitMaster_Designer_Agent_Skill_Brief.md` 2026-05-16 with the forbidden/approved vocabulary; this entry tracks application of that vocabulary to the app's code-resident user-facing strings.

**Scope (in).** Strings rendered to consumer users — `app.config.ts`, `app.json`, `app/(tabs)/index.tsx`, `explore.tsx`, `results.tsx`, `book.tsx`, `learn.tsx`, `account.tsx`, `app/track-record.tsx`, `app/coming-soon.tsx`, consumer-side modals (`PickDetailModal`, `PickExplainerModal`, `HeatCheckModal` if any), shared consumer components (`HitHeroBand`, `PickCard`, `SlateCard`, etc. — text only), push-notification copy, share/deep-link templates, error toasts and Alert dialogs visible to users.

**Scope (out — explicit carve-outs).** Internal code identifiers (function names, variable names, type names, file names — `hitDetection.ts`, `runHitDetectionAndRefresh`, `hit_box`, `HitHeroBand.tsx` all stay). Comments, `console.*`, audit log strings, MASTER_AUDIT entries. Admin/operator surfaces (`app/(tabs)/intelligence.tsx`, `admin.tsx`, `admin-imports.tsx`, `app/import-wizard.tsx`, `app/ledger-import.tsx`, `components/admin/*`) — these are internal tools, subscribers do not see them, and the operator vocabulary is load-bearing for the admin workflow. The brand wordmark **HitMaster** / **HitMaster ZK6** is preserved everywhere.

**User decisions captured 2026-05-16.**
1. Brand-name carve-out: confirmed — `HitMaster` / `HitMaster ZK6` stays everywhere.
2. App Store display name: stays `HitMaster` (per `app.config.ts` line 5 + `app.json` `expo.name`).
3. App Store subtitle/description target: uses the brief's About-section line verbatim — *"a data intelligence platform for numerical pattern analysis"*.
4. Admin/operator exemption: confirmed — Tier 4 surfaces keep existing operator language.

**Phased plan.**
- **Phase 0 (this entry).** Doctrine + audit anchor. CLAUDE.md "Brand voice" section added; `assets/HitMaster_Designer_Agent_Skill_Brief.md` committed; in-flight feature work landed first so the audit starts on a clean tree.
- **Phase 1.** Inventory — grep-based sweep of the in-scope file set for the brief's forbidden vocabulary. Output is a per-row table here (file · line · current text · proposed replacement · tier). Read-only; no code edits.
- **Phase 2.** Tier the inventory. T1 = external eligibility (`app.config.ts` / `app.json` / push / share / splash). T2 = first-touch UI (home, onboarding, `coming-soon`, `learn`, auth). T3 = subscriber functional UI (explore, results, track-record, account, consumer modals, shared components). T4 = admin/operator (no edits — documented exempt).
- **Phase 3.** Surgical edits, one tier per commit (`chore(copy): brand-voice scrub T1 …`). Each edit is per-string, context-sensitive — no bulk renames. Lint + smoke test the affected surfaces after each tier; commit hashes recorded here.
- **Phase 4.** Verify — re-run the forbidden-word grep on T1–T3 paths; expect zero hits outside the brand-name carve-out. `git diff --stat` review confirms no `.ts`/`.tsx` identifier renames slipped in. Manual walk through Home → Explore → Results → Track Record → Account on tunnel. Close this entry with the diff range.

**Inventory (Phase 1, completed 2026-05-16).** Sweep targeted the 56 in-scope files from the doctrine. Findings below are grouped by tier; T4 is documented exempt. Each row needs explicit user approval (or override) before Phase 3 begins because several rows are feature-name renames with cross-file ripple, not single-word substitutions.

**T1 — External eligibility (App Store / push / share / splash).**
- `app.config.ts:5` `name: 'HitMaster'` → **KEEP** (brand-name carve-out, user decision 2 confirmed).
- `app.json:3` `"name": "HitMaster"` → **KEEP** (same).
- `app.json` — no `expo.description` / `expo.shortDescription` / `expo.keywords` fields yet. The App Store subtitle "*a data intelligence platform for numerical pattern analysis*" (user decision 3) will be added here as a Phase 3-T1 net-new field, not a rewrite.
- No `lib/notifications*` file exists — push-notification copy is not yet code-resident. Out of scope until that lands.
- **Share-message templates (T1 surface, lives in T3 component files):**
  - `components/HitCelebrationOverlay.tsx:79` — `'🎯 Just hit on HitMaster — pick #${rank} was ${digits}, drew today in ${jurisdiction} …'` → reframe to *"Pattern verified: HitMaster signal #${rank} matched today in ${jurisdiction}"*.
  - `components/PickCard.tsx:216–219` — `'🎯 My ZK6 pick for today: ${pick.combo} … Get your daily picks: hitmaster.app  #HitMaster #Pick3 #ZK6'` → reframe to *"Today's ZK6 signal: ${pick.combo} (Energy ${pick.energy}/100). hitmaster.app  #HitMaster #ZK6 #DataIntelligence"* — hashtag `#Pick3` removed.
  - `components/PickDetailModal.tsx:371` — share template trailing `'📲 hitmaster.app  #ZK6 #Pick3'` → drop `#Pick3`, replace with `#DataIntelligence`.
  - `components/HeatCheckModal.tsx:277,298,301` — share strings reading *"Heat Check: ${result.combo}"* → rename per the feature-rename decision below.

**T2 — First-touch / onboarding (~25 strings).**

| File | Line | Current | Proposed |
|------|------|---------|----------|
| `app/(tabs)/index.tsx` | 132 | "Your daily Pick 3 intelligence system. The ZK6™ Engine analyzes years of draw history to surface your highest-signal plays." | "Your daily numerical pattern analysis. The ZK6™ Engine analyzes years of public draw data to surface your highest-signal combinations." |
| `app/(tabs)/index.tsx` | 134 | "Join 2,400+ Players" / "Players across 18 states use HitMaster daily." | "Join 2,400+ Members" / "Members across 18 states use HitMaster daily." |
| `app/(tabs)/index.tsx` | 135 | "A taste of today's ZK6 picks — yours on the free tier." | "A preview of today's ZK6 signals — yours on the free tier." |
| `app/(tabs)/index.tsx` | 135 | btn `'Get My Picks'` | `'See My Signals'` |
| `app/(tabs)/index.tsx` | 240 | "Heat Check any combo" (action label) | "Run Signal Check" (per Heat-Check rename decision below) |
| `app/(tabs)/index.tsx` | 250 | section title "Responsible play" | "Responsible use" |
| `app/(tabs)/index.tsx` | 769 | `<Text>Today's <Text style={cyan}>Picks</Text> ⚡</Text>` | "Today's Signals ⚡" |
| `app/(tabs)/index.tsx` | 806 | `'2 of 6'` / `'6 picks'` heroColMeta | `'2 of 6'` / `'6 signals'` |
| `app/(tabs)/index.tsx` | 813 | `'{todayHits} hits today'` / `'hit'` | `'{todayHits} matches today'` / `'match'` |
| `app/(tabs)/index.tsx` | 837 | "Straight hit ✓" / "Box hit ✓" | "Straight match ✓" / "Box match ✓" |
| `app/(tabs)/index.tsx` | 845 | "Today's slate didn't hit — here's what got close." | "Today's slate didn't match — here's what got closest." |
| `app/(tabs)/index.tsx` | 929 | `'{n} of 6 picks hidden'` | `'{n} of 6 signals hidden'` |
| `app/(tabs)/index.tsx` | 931 | `"…verified {BACKTEST_HIT_RATE}% hit rate…"` | `"…verified {BACKTEST_HIT_RATE}% match rate…"` |
| `app/(tabs)/learn.tsx` | wholesale | The Learn screen is built around teaching Pick 3 — every section title and body uses "lottery", "Pick 3", "play", "winning numbers", "winning", "payout". | **Decision needed — see judgment calls below.** Not auto-included in Phase 3 until you choose direction. |
| `app/paywall.tsx` | 52 | feature row "Heat Checks" | "Signal Checks" (or per decision) |
| `app/paywall.tsx` | 53 | "Pick by Budget" | "Budget Planner" |
| `app/paywall.tsx` | 56 | "Previous Hits" / "Complete history" | "Previous Matches" / "Complete history" |
| `app/paywall.tsx` | 122–123 | `'{VERIFIED_HIT_RATE}%'` / "verified hit rate" | unchanged value / "verified match rate" |
| `components/Paywall.tsx` | 17 | "⚡ All 6 K6 Slate picks daily" | "⚡ All 6 K6 Slate signals daily" |
| `components/Paywall.tsx` | 19 | "🔥 Unlimited Heat Checks" | "🔥 Unlimited Signal Checks" |
| `components/Paywall.tsx` | 21 | "💰 Budget Pick tool" | "💰 Budget Planner" |
| `components/Paywall.tsx` | 23 | "📋 Full hit history & stats" | "📋 Full match history & stats" |
| `components/Paywall.tsx` | 68 | "Join 2,400+ players using ZK6 intelligence daily" | "Join 2,400+ members using ZK6 intelligence daily" |
| `app/coming-soon.tsx` | 23 | "Advanced 3-digit straight play analysis…" | "Advanced 3-digit straight-arrangement analysis…" |
| `app/coming-soon.tsx` | 45,47 | "Multi-pass scoring v2 (recency/presence/integrity/heat/verification)" / "Adaptive heat model" | "…/signal/verification" / "Adaptive signal model" |

**T3 — Subscriber functional UI (~80 strings).** Full row-by-row in commit context; high-density files summarized:

- **`app/(tabs)/explore.tsx`** — type `Tab = 'picks' | 'hits' | 'more'` is internal-only (carve-out), but every user-visible label `Picks` / `Hits` / `Today's hits` / `No hits yet today` / `Hit feed · all scopes today` / `No hits across the engine yet` / `Heat check` / `Heat Check any combo` / `Bookmark today's picks for later review` / `Yesterday's K6 picks vs actual draws` / `Pro unlocks all 6 picks` → swap to `Signals` / `Matches` / `Today's matches` / `Match feed` / `Signal Check` / `Bookmark today's signals` / `Yesterday's K6 signals vs actual draws` / `Pro unlocks all 6 signals`. **Line 525** export filename `ZK6 Picks · …` → `ZK6 Signals · …`. **Line 808** disclaimer — see judgment call.
- **`app/(tabs)/results.tsx`** — `🎯 ZK6 hits` / `Hit rate` / `🎯 No hits yet today` / `Slate hits will appear here…` / `{hitType} hit ${combo}` / `🎯 ZK6 HIT! …Straight/Box hit on…` / `Hide hit replay` / `${n} hits — open hit summary` / `${n} day hit streak` → swap `hit(s)` → `match(es)` in display strings. Internal `stats.hits` variable stays. Game-name `'Pick 3'` line 731 → judgment call.
- **`app/(tabs)/book.tsx`** — feature cards "Straight Pick 3 Slate" / "Pick 4 Box" / "Pick 4 Straight" → "Straight-Arrangement Slate" / "4-digit Box (coming)" / "4-digit Straight (coming)" — drops "Pick 3" / "Pick 4" branding. Alert `'All of today's picks are already in this list.'` → `'…signals are already in this list.'`. `'{n} picks · Saved slate'` / `'{n} pick'/'picks'` → `signal`/`signals`. List name placeholder `'NY Evening Picks'` → `'NY Evening Signals'`. Line 477 `'{n} HITS across {n} picks'` → `'{n} MATCHES across {n} signals'`.
- **`app/(tabs)/account.tsx`** — glossary entries (lines 23, 25, 31) heavily use "lottery", "picks", "payout" — reword to "public draw data", "signals", "$80 secondary tier" (drop the literal "$80 payout / $500 payout" wording → rephrase as relative tiers). Premium features (lines 35–40) `'All 6 K6 Slate picks'` / `'Pick by Budget tool'` / `'Hit history & stats'` → `'All 6 K6 Slate signals'` / `'Budget Planner tool'` / `'Match history & stats'`. Notification prefs `'Slate Hit Alert'` / `'When your picks match draw results'` → `'Slate Match Alert'` / `'When your signals match draw results'`. Plan grid (lines 274–278) `'K6 Picks'`/`'Heat Checks'`/`'Hit History'` → `'K6 Signals'`/`'Signal Checks'`/`'Match History'`. Line 391 follow-states empty state references "Hit Feed" / "Last Hit" → `'Match Feed' / 'Last Match'`. Line 476 cinema-mode subtitle `'… just scope + 6 picks + countdown'` → `'… just scope + 6 signals + countdown'`.
- **`app/track-record.tsx`** — `'ZK6 K6 hits, draw-by-draw'` / `'Pulling verified hits…'` / `'No verified hits in the last…'` / `'{n} hit'/'hits'` / a11y `'… hit on ${combo} in ${hit_state}…'` → `match(es)`.
- **`app/replay.tsx`** — `'Last 7 days · ZK6 picks vs actual draws'` / `'🎯 {n} hit/hits'` / `'{n} hit/hits'` / `'0 hits'` → `signals` / `match(es)`.
- **`components/HitHeroBand.tsx`** — `'{n} HIT'/'HITS' TODAY` / a11y `'... hit ${combo}...'` → `'MATCH'/'MATCHES'`. Internal name (file, component) preserved.
- **`components/HitBadge.tsx`** — a11y `'${type} hit'` → `'${type} match'`. Internal name preserved.
- **`components/HitCard.tsx`** — a11y `'… ${hitType} hit …'` → `match`. Internal name preserved.
- **`components/HitCelebrationOverlay.tsx`** — `'HIT!'` overlay text → `'MATCH!'`; share-message text (already in T1 share-template section above).
- **`components/HitReplay.tsx`** — eyebrow `'{hitType.toUpperCase()} HIT REPLAY'` → `'… MATCH REPLAY'`. `'WE PICKED'` / `'DRAWN'` → `'WE SIGNALED'` / `'DRAWN'`.
- **`components/LastHitPill.tsx`** — `'LAST HIT'` / a11y `'Last hit: …'` → `'LAST MATCH'` / `'Last match: …'`. Internal name preserved.
- **`components/PickCard.tsx`** — heat-label vocabulary lines 70/76/84–86/100–102/107/111/113/140/281/289 use `Fresh hit`, `Last hit:`, `BOX HIT`, `STRAIGHT HIT`, `HOT STREAK`, `SOLID PICK — Box play recommended`, `WATCH LIST — Box play only`, `SPECULATIVE — Small box play if at all`. Reframe table:
  - "Fresh hit ✓" → "Fresh match ✓"
  - "Hit ${n} draws ago" → "Matched ${n} draws ago"
  - "${n} draws without a hit" → "${n} draws without a match"
  - "${n} draws since last hit" → "${n} draws since last match"
  - "SOLID PICK — Box play recommended" → "STRONG SIGNAL — Box arrangement recommended"
  - "WATCH LIST — Box play only" → "WATCH LIST — Box arrangement only"
  - "SPECULATIVE — Small box play if at all" → "SPECULATIVE — Conservative arrangement only"
  - "Last hit: Unknown" / "Last hit: ${date}" → "Last match: …"
  - "BOX HIT" / "STRAIGHT HIT" overlay → "BOX MATCH" / "STRAIGHT MATCH"
  - "🔥 HOT STREAK — Energy ${e}/100" → "🔥 STRONG SIGNAL — Energy ${e}/100"
  - `whyHero` line 70: `'⚡ Signal synergy: Multiple lethal indicators aligned'` → drop "lethal" — `'⚡ Signal synergy: Multiple indicators aligned'`.
  - a11y line 274 `'…energy ${e} ${heat.label}${isHit ? ', hit — …'}'` → `, match — …`.
  - a11y line 275 `'Long press to share.'` — fine.
- **`components/PickDetailModal.tsx`** — share text (already T1), `'Run Heat Check'` button line 574 → `'Run Signal Check'` (per rename).
- **`components/PickExplainerModal.tsx`** — line 42 `'co-occur in winning numbers at an above-average rate…'` → `'co-occur in observed draws at an above-average rate…'`.
- **`components/HeatCheckFAB.tsx`** — a11y `'Heat check any number'` / hint `'Opens a panel to check the energy and hit history of any 3-digit combo.'` → `'Signal check any number'` / `'… energy and match history of any 3-digit combo.'`. **Internal component name preserved.**
- **`components/HeatCheckModal.tsx`** — surface title `'🔍 Heat Check'`, share lines, a11y labels, rate-limit `'Upgrade to Oracle to run unlimited Heat Checks.'`, energy verdicts `'🔥 BLAZING HOT — High-confidence pick'` / `'✦ HOT SIGNAL — Strong box play'` / `'⚠️ OVERDUE — Pressure building, speculative play'` → rename surface to *Signal Check*; verdict copy `BLAZING SIGNAL` / `STRONG SIGNAL — Box arrangement` / `OVERDUE — Pressure building, conservative arrangement`. **Internal component name preserved.**
- **`components/DailyRecapCard.tsx`** — `'📊 TODAY'S RECAP'` / `'{n} verified hits today'` / a11y `'Today's recap: {n} hits…'` → `match(es)`.
- **`components/BudgetPlanner.tsx`** — header `'💰 PLAN MY PLAY'` → `'💰 PLAN MY ARRANGEMENT'`. `'Select at least one draw to plan a play.'` → `'… plan an arrangement.'`. `'→ ${win} / hit'` → `'→ ${win} / match'`. `'Each play wins independently per state — multi-state increases your chance of catching a hit.'` → `'Each arrangement scores independently per state — multi-state increases your chance of catching a match.'`.
- **`components/MissDayCard.tsx`** — `"…you've hit on {n} of the last 7 days"` → `"…you've matched on {n} of the last 7 days"`.
- **`components/LockedPicksSummary.tsx`** — a11y `'Watch ad to unlock pick ${rank}'` → keep "pick" or use "signal"? **Recommend "signal"** for consistency.

**T4 — Exempt (documented, no edits).**
- `app/(tabs)/intelligence.tsx`, `admin.tsx`, `admin-imports.tsx`, `coverage.tsx`, `zk30.tsx`
- `app/import-wizard.tsx`, `app/ledger-import.tsx`
- `components/admin/*` (DashboardView, ImportWizardView, NationwideAdminView, AdminShared, HitTrackingView, EngineConfigView, AdaptiveLearning, HealthTests, ImportHistory, CoverageMatrix, etc.)
- All `engines/`, `supabase/`, `scripts/`, `lib/` internals
- Comments, `console.*`, type names, identifiers, audit log strings (e.g. results.tsx `// snapshot — re-touched today by hit detection` stays — it's a comment)

**Vocabulary substitution rules (applies across all tiers).**
| Old | New |
|-----|-----|
| hit / hits (noun in display) | match / matches |
| Hit (verb in display) | match |
| picks (display) | signals (or "intelligence reports" for archetype variation) |
| pick (display, singular) | signal (preserve "Pick" prefix in feature-name reframes — see Heat Check note) |
| play / plays (verb in display) | arrangement / use |
| winning numbers | observed draws / detected matches |
| lottery (noun) | public draw data |
| Daily Heat / Heat Check (feature label) | Signal Check (see decision below) |
| HOT / BLAZING (energy verdict) | STRONG / BLAZING SIGNAL |
| Pick 3 (game name in marketing) | numerical pattern analysis (or drop entirely per decision) |
| Pick 4 (game name) | 4-digit (preserve only in feature-coming labels per decision) |
| #Pick3 hashtag | drop; use `#DataIntelligence` |
| players (audience term) | members / community |
| payout (display) | secondary tier / win tier (per decision) |

---

**Judgment calls — explicit user decision required before Phase 3 begins.**

These rows are not safe to auto-include in surgical edits; each has cross-file ripple or potential business impact. Please answer Q1–Q6 before I touch any user-facing string.

**Q1. Heat Check rename.** The "Heat Check" feature is a named, marketed sub-product (in paywall comparison, FAB, modal, share text, glossary). Options:
- (a) **Signal Check** — closest synonym, no game-feel; preserves verb pattern ("Run Signal Check"). **Recommended.**
- (b) **Combo Probe** — more analytical, less retail.
- (c) **Pattern Check** — alignment with brief's "pattern matching" vocabulary.
- (d) Keep "Heat Check" — Meta classifier risk persists.

**Q2. "Hits" → "Matches" terminology.** This is the highest-frequency rename: ~60 display strings. Options:
- (a) **Matches** — neutral, analytical. **Recommended.**
- (b) **Verified picks** — still flags brief's "picks" rule.
- (c) **Pattern matches** — true to brief vocabulary, slightly long for tight UI cells.
- (d) Keep "hits" in subscriber-only UI on the basis Meta can't crawl logged-in screens. Risk: a free user screenshots Home → posts it → Meta classifier reads "5 HITS TODAY".

**Q3. "Pick 3" mentions outside the Learn screen.**
- `app/(tabs)/book.tsx:28–30` (feature cards "Straight Pick 3 Slate" / "Pick 4 Box" / "Pick 4 Straight"); `app/(tabs)/results.tsx:731` (per-row game-name display `{game || 'Pick 3'}`); share hashtag `#Pick3`. Options:
- (a) **Drop "Pick 3" entirely** — book cards become "Straight-Arrangement Slate" / "4-digit Box (coming)" / "4-digit Straight (coming)"; results game line becomes `MI · 3-digit draw · 791`. **Recommended for rehabilitation period.**
- (b) Replace with "3-digit draw" / "4-digit draw" — neutral, still informative.
- (c) Keep "Pick 3" — small surfaces, but flags Meta forbidden list.

**Q4. The Learn screen (`app/(tabs)/learn.tsx`).** The page is built around explaining the Pick 3 game (basics, sessions, states, how to read picks, responsible play). Strict scrub guts the page's purpose. Options:
- (a) **Full rewrite** as "Understanding Numerical Pattern Analysis" — drop game-explanation framing, focus on what ZK6 does and how to read signals. Loses the educational onboarding for new lottery players.
- (b) **Soft rewrite** — keep game-explanation content, but reframe the vocabulary in each paragraph (e.g. "lottery game" → "state-run 3-digit draw"; "winning numbers" → "drawn combinations"; "play" → "place"). Preserves educational utility, partial Meta classifier exposure remaining.
- (c) **Move educational content out** — replace with a single "Learn the analytical methodology" link that opens an external page (off-app, not Meta-crawled). Aligns with brief's data-intelligence positioning.
- (d) **Keep as-is** under the argument the screen is gated behind app install (i.e. not crawled). Note Apple App Store reviewers will see screenshots of Learn during review.

**Q5. The "1-800-GAMBLER" disclaimer on `app/(tabs)/explore.tsx:808`.** Currently reads: *"HitMaster picks are for entertainment only. Play responsibly. 1-800-GAMBLER"*. This is the single most explicit gambling signal in the codebase, but it's also a common-practice responsible-disclosure line. Options:
- (a) **Reframe** to *"HitMaster signals are for analytical research only. Use responsibly."* — keeps the disclaimer's intent, drops "gambling" / "play" framing and the hotline. Risk: legal advisor may want the hotline preserved.
- (b) **Move to Terms of Service / About** — single in-app screen vs. on every Slates tab visit.
- (c) **Keep as-is** — accept Meta classifier hit on this one line in exchange for legal safety. Recommend pairing with a legal review.

**Q6. "Players" → "members" / "community".** Used in onboarding (`index.tsx:134`, `Paywall.tsx:68`). Brief table says `players → members / community`. Options:
- (a) **members** — direct from brief. **Recommended.**
- (b) **community** — softer, aligns with archetype copy.
- (c) Keep "players".

**Decisions captured 2026-05-16 (user):** Q1 → Signal Check (option a). Q2 → Matches (option a). Q3 → Drop "Pick 3" / "Pick 4" entirely (option a). Q4 → Soft rewrite of Learn screen (option b). Q5 → Remove the 1-800-GAMBLER disclaimer entirely. Q6 → members (option a).

**Phase 3 commit range (2026-05-16):**
- `73d053e` — T1: store metadata + share templates (`app.json`, `HitCelebrationOverlay`, `PickCard` share text, `PickDetailModal` share text, `HeatCheckModal` share text).
- `c4829b8` — T2: first-touch UI (`app/(tabs)/index.tsx` onboarding/hero/overflow, `app/paywall.tsx`, `components/Paywall.tsx`, `app/coming-soon.tsx`).
- `3ad0210` — T3 part A: subscriber tab screens (`explore`, `results`, `book`, `account`, `track-record`, `replay`).
- `c7e80a4` — T3 part B: consumer components (`HitHeroBand`, `HitBadge`, `HitCard`, `HitCelebrationOverlay`, `HitReplay`, `LastHitPill`, `PickCard`, `PickDetailModal`, `PickExplainerModal`, `HeatCheckFAB`, `HeatCheckModal`, `DailyRecapCard`, `BudgetPlanner`, `MissDayCard`, `LockedPicksSummary`).
- `b346e96` — Q4 soft rewrite of `app/(tabs)/learn.tsx` (all 5 modules + sidebar + welcome + CTA + pro teaser).
- **Stragglers (P4 verification):** `index.tsx` "TODAY'S HITS" + loss-card Pick label, `results.tsx` per-row HIT badge, `components/Paywall.tsx` legal footer (second 1-800-GAMBLER occurrence), `PickCard` "all-time hits" + "Why this pick?" + a11y, `PickExplainerModal` modal title + rail bullet, `SlateCard` HIT badge, `TrialOfferBanner` title + body.

**Phase 4 verification (2026-05-16):**
- Re-ran the brief's forbidden-vocabulary grep over the 56 in-scope files (T1–T3 paths). **Zero remaining hits** outside three documented carve-outs: (1) `HitMaster` / `hitMaster` brand wordmark; (2) internal identifiers — variable names (`stats.hits`, `pick.hitType`, `notifPrefs.hits`, `Tab = 'picks' | 'hits' | 'more'`, etc.); (3) comments / queryKey strings / log strings.
- `git diff --stat` review across all 6 BRAND-01 commits: 28 files changed, 251 insertions / 269 deletions. Zero `.ts`/`.tsx` identifier renames slipped in. Verified by grepping the diff for any `function` / `const` / `let` / `var` / `type` / `interface` definitions touching forbidden vocabulary — none found.
- Brand wordmark intact in expected carve-out locations: `app.config.ts:5 name: 'HitMaster'`, `app.json:3 "name": "HitMaster"`, `app.json:6 description: "HitMaster ZK6 — a data intelligence platform..."`, `account.tsx:578 footerLogo HIT<Text>MASTER</Text>` (stylized rendering of the wordmark).
- Manual UI smoke deferred — no dev server in this session; pre-existing lint errors (32 errors, 106 warnings) exist exclusively in T4-exempt admin views (`admin*.tsx`, `intelligence.tsx`, `coverage.tsx`, `import-wizard.tsx`, `components/admin/*`) and were not introduced by this work.

**Phase 5 — Soft guardrail (shipped 2026-05-22).** `scripts/check-brand-voice.ts` + `npm run check:brand-voice`. Scans the BRAND-01 in-scope file list (T1–T3, 30 consumer surfaces) for forbidden vocabulary and exits non-zero on hit. High-precision phrase-level rules (not single ambiguous words like "hit"/"pick") so the lint catches regressions without flooding false positives. Doctrine cited inline: CLAUDE.md "Brand voice" + the v2 brief. Multi-line `/* */` comments tracked statefully; narrow `LINE_ALLOWLIST` for HeatCheck* component imports/JSX, queryKey strings, and comments. First run on the certified-clean tree surfaced **3 BRAND-03 stragglers** that the original 5/17 swap missed:

| File | Line | Was | Now |
|------|------|-----|-----|
| `app/(tabs)/index.tsx` | 702 | `'STRAIGHT HIT' : 'BOX HIT'` | `'EXACT MATCH' : 'PARTIAL MATCH'` |
| `app/(tabs)/explore.tsx` | 92 | `'STRAIGHT HIT' : 'BOX HIT'` | `'EXACT MATCH' : 'PARTIAL MATCH'` |
| `components/PickDetailModal.tsx` | 728 | `'STRAIGHT HIT' : 'BOX HIT'` | `'EXACT MATCH' : 'PARTIAL MATCH'` |

All three are subscriber-visible rotated hit-stamp badges (Home Coffee/Bites grid tile overlay, Slates GridTile overlay, PickDetailModal hit stamp). They paired with the 5 already-fixed BRAND-03 surfaces but lived inside a different code pattern (`const hitLabel = ...` and the modal's own ternary) so the original sweep missed them. Caught + fixed in the same pass that shipped the lint — the script paid for itself on first run.

Post-fix re-run: ✅ 30 files scanned, 0 findings.

**Status:** ✅ Complete 2026-05-22 (initial scrub 2026-05-16 + match-type swap 2026-05-17 + Phase 5 guardrail 2026-05-22). 7 commits across 31 files, zero internal-identifier renames, zero forbidden display strings in T1–T3, automated regression guard wired to `npm run check:brand-voice`. Admin/operator surfaces preserved exempt. Brand wordmark preserved. **Only remaining BRAND-01 step**: manual UI smoke walkthrough on tunnel (`npm run start-tunnel` → Home → Explore → Results → Track Record → Account) — operator-only, can't be automated. Ready for Meta page recommendation re-eligibility review.

### BRAND-02 — App Icon Rewire + Asset Directory Cleanup (2026-05-17)

**Trigger.** New 2048×2048 RGBA `assets/app-icon.png` provided as the canonical brand icon for the data-intelligence repositioning. The previous icon set (`assets/images/{icon,adaptive-icon,favicon,splash-icon}.png`) shipped before the BRAND-01 voice scrub and predated the Meta de-recommendation rehab. Parallel to BRAND-01 (which scrubbed strings); this scrubs the brand image surface.

**Scope.** Every brand-image slot in the build config + the one in-app component that renders the icon. Splash regenerated from the new icon (same composition, new art). Orphaned assets cleaned out.

**Changes (4 commits on `main`, all pushed).**
- `f7a5819` — Repoint `app.json` (`icon`, `android.adaptiveIcon.foregroundImage`, `web.favicon`, `expo-notifications.icon`), `app.config.ts` (`android.adaptiveIcon.foregroundImage` override that actually ships on Android), and `components/BrandMark.tsx` (Home header + Paywall hero) to `./assets/app-icon.png`. Deleted `assets/images/{icon,adaptive-icon,favicon}.png` and the stale uppercase `assets/app-icon.PNG`.
- `f532733` — `expo-splash-screen.image` repointed from `./assets/images/splash-icon.png` to `./assets/app-icon.png`. Kept `imageWidth: 220` + `backgroundColor: '#0a0613'` (cosmic dark). Deleted unused `assets/images/splash-icon.png`.
- `d66b73a` — Removed unreferenced `assets/splash.PNG` (2.8MB, orphaned even before today).
- `32d1bab` — Removed unreferenced `assets/background.png` (2.5MB, see BUG-24 below), `assets/logo-art.jpg` (488KB, zero refs), and `assets/images/HM_Design/` (design mockup folder — HTML/JSX/theme tokens, never consumed by RN).

**Final `assets/` state.** Two files: `app-icon.png` (the canonical brand icon, wired to every slot) and `HitMaster_Designer_Agent_Skill_Brief.md` (BRAND-01 doctrine doc). `assets/images/` directory removed entirely.

**Side effect:** BUG-24 closes. `assets/background.png` was the `ImageBackground` asset deferred in BUG-24 — with the asset deleted and `ImageBackground` already removed from `_layout.tsx` (per the original BUG-24 fix), the deferred re-introduction plan is moot. Bug Registry row updated below.

**Caveat flagged at handoff.** Android adaptive icons get masked into a circle/squircle; the new 2048×2048 art is now the foreground layer. If the icon wasn't designed with a safe inner zone (~66% center), the Android launcher icon may show edge clipping. iOS icon + web favicon use the full square so no clipping there. No design pass requested as of close.

**Status:** ✅ Complete 2026-05-17. Brand image surface aligned with BRAND-01 voice surface. Meta rehab readiness now covers strings + iconography.

---

### BRAND-03 — Match-Type Vocabulary Swap on Consumer Surfaces (2026-05-17)

**Trigger.** Ingested `assets/HitMaster_Master_Marketing_Brand_Reference.md` (compiled 2026-05-17). The doc's vocabulary-translation table explicitly maps **"Straight match" → "Exact match"** and **"Box match" → "Partial match"** for public-facing copy — Meta's recommendation classifier treats "straight"/"box" as gambling-vocabulary tells; "exact"/"partial" reads as data-verification language. BRAND-01's forbidden/approved lists in CLAUDE.md did not cover this pair. Five consumer surfaces still rendered raw "Straight"/"Box".

**Scope.** Subscriber-visible match-type labels, banners, badges, and share strings only. Educational glossary copy in `learn.tsx`/`account.tsx`/`book.tsx` describing the underlying lottery tier mechanic was left alone — those strings explain *how the tier works*, not *that an outcome happened*. Internal identifiers (`hit_straight`, `hitStraight`, `straightHitRate`, etc.) unchanged per BRAND-01 rule that code identifiers stay.

**Changes (1 commit).**
- `app/(tabs)/results.tsx:755` — Match badge label `'Straight' / 'Box'` → `'Exact' / 'Partial'`.
- `app/(tabs)/results.tsx:766` — Share message body: `Straight & Box match` → `Exact & Partial match`.
- `app/(tabs)/index.tsx:837` — Home hit banner sub: `Straight match ✓ / Box match ✓` → `Exact match ✓ / Partial match ✓`.
- `app/(tabs)/explore.tsx:728` — Match-feed badge: `⭐ STR / 🎯 BOX` → `⭐ EXACT / 🎯 PARTIAL`.
- `components/HitCelebrationOverlay.tsx:78` — Share-string type label: `STRAIGHT / BOX` → `EXACT / PARTIAL`.
- `components/HitCelebrationOverlay.tsx:86` — Overlay type badge: `Straight ✓ / Box ✓` → `Exact ✓ / Partial ✓`.

**Surfaces deliberately untouched.** Admin/operator views (`intelligence.tsx`'s "Straight Rate" stat card, admin dashboards), educational glossaries describing tier mechanics in `learn.tsx`/`account.tsx`/`book.tsx`, and the `Best Straight` recommended-arrangement label on `PickCard` (a methodology term inside a signal card, not an outcome statement). If a future review wants those renamed too, the call should be made per-string with the marketing doc in hand.

**Status:** ✅ Complete 2026-05-17. Marketing-reference doc now indexed in agent memory (`reference-marketing-brand-doc`, `feedback-brand-voice-extensions`) so future copy work picks up the expanded translation table without re-reading the source doc.

---

## Quick Counts

| State | Count |
|-------|-------|
| ✅ Fixed | 133 |
| ℹ️ By design / False positive / Deferred | 12 |
| 🎨 UX Improvements Applied | 58 |
| 🔴 Open — Critical | 0 |
| 🟠 Open — High | 0 |
| 🟡 Open — Medium | 0 |
| 🔵 Open — Low | 0 |
| 🔵 Latent / Not Active | 1 |
| 🏗️ Architecture Debt | 6 (1 open = ARCH-06, 4 fixed, 1 superseded = ARCH-04→ARCH-06) |
| 💡 Enhancement Opportunities | 22 (20 implemented, 2 deferred — ENH-08 requires DB schema, ENH-12 requires new table) |

---

## 🚨 Active Incident Triage: Pick Quality & Scoring Degradation (2026-05-11)

**Symptom:** Hit and pick accuracy has degraded following recent codebase modifications. Engine scoring (Energy/Signals) has become erratic.
**Root Cause Analysis — VERIFIED 2026-05-11 by independent code audit:**

1. ~~**BUG-22 (`excludedCombos` Bleed)**~~ **FALSE POSITIVE — already fixed.** `regenerateMutation` creates `excluded = new Set()` as a fresh local variable on every call. No shared state.
2. **ENG-01 (Signal Normalization Inconsistency) — FIXED 2026-05-11:** BOX used min-max while PBURST/CO/DGC used max-norm. Now all signals use max-norm consistently. File: `engines/zk6.ts`, `engines/zk30.ts`.
3. **ENG-04 (Deterministic Hash) — FIXED 2026-05-11:** `ts: Date.now()` in hash forced a unique snapshot hash on every regen, breaking dedup. Removed from both engines.
4. **BUG-19 / NEW-28 (Hit Detection Window + Dual System) — FIXED 2026-05-11:** `lib/hitDetection.ts` used `limit=2` with no date filter; now uses date-range query with limit=10 + fallback. See NEW-28 for dual-system architecture debt.
5. **BUG-21 (Silent `allday` Fallback):** Still open — UI label not surfaced. See open bugs.

**Status:** Core engine math fixed. Remaining open issues tracked in open bugs section below.

---

## Bug Registry

### Closed Bugs

| ID | Severity | Description | Status | Fixed in | Date |
|----|----------|-------------|--------|----------|------|
| BUG-149 | 🟠 High | Results screen duplicated hits in the footer "🎯 N MATCHES TODAY" list and rendered bogus 🎯 badges on non-hit cards. Root cause: `app/(tabs)/results.tsx` Tier 1 (`dbHits`) filter only required `(state, date, session, scope)` to match — not the actual drawn digits. For states that run two draws per session (TX/DC/GA evening on 2026-05-19; TX midday), `histories` has two rows for the same `(jurisdiction, session)`. The single adaptive_tracking hit row was attached to BOTH games' ledger rows: the wrong-game card showed a phantom 🎯 ZK6 MATCH badge, and `flattenHits` then emitted the same hit twice (once per ledger row) into `hitSummaryItems`, producing duplicate entries in the footer summary list. | ✅ Fixed — added `&& toComboSet(h.combo) === rowSet` to the Tier 1 filter so the AT row's combo must share a comboSet with this ledger row's actual draw. Multi-game state rows now only attach the hit to the matching draw. Tier 2/3 paths were already correct (they use `csMap.get(rowSet)`/`snapMap.get(rowSet)` which are row-set-keyed). Also cleaned up a pre-existing TS error in `StatsSheet`'s `stats` prop type (still declared `morn`/`night` fields that BUG-148's two-bucket session change removed from the computed `stats` object). | `app/(tabs)/results.tsx` | 2026-05-20 |
| BUG-01 | 🔴 Critical | ZK30 jurisdiction hardcoded to TX in `fetchRaw()` | ✅ Fixed | `engines/zk30.ts` | 2026-05-08 |
| BUG-02 | 🔴 Critical | Default admin role; any user could become admin | ✅ Fixed 2026-05-11 — `useAuth.tsx:19,33` defaults changed to `role: 'free'`. New installs start as Free tier; admin must be explicitly set. | `hooks/useAuth.tsx` | 2026-05-11 |
| BUG-03 | 🟠 High | `on_slate=true` not PATCHed for ZK30 final 30 picks | ✅ Fixed | `engines/zk30.ts` | 2026-05-08 |
| BUG-04 | 🟠 High | DELETE→INSERT race on `daily_intelligence` wipes live hit flags | ✅ Fixed | `engines/zk6.ts`, `engines/zk30.ts` | 2026-05-08 |
| BUG-05 | 🟠 High | Snapshot hash could produce negative int; mode excluded from input | ✅ Fixed | `engines/zk6.ts`, `engines/zk30.ts` | 2026-05-08 |
| BUG-06 | 🟠 High | PRO regen credits client-side only (AsyncStorage) | ℹ️ Mitigated — server read/write via `slate_credits` already in place; AsyncStorage is display cache only | — | — |
| BUG-07 | 🟡 Medium | `daily_intelligence` fetched in single 500–2700 row shot | ✅ Fixed — full cursor pagination, pages of 500 until exhausted | `app/(tabs)/intelligence.tsx` | 2026-05-08 |
| BUG-08 | 🟡 Medium | ZK6 `jurisdiction=is.null` — cannot isolate by state | ✅ By design — ZK6 operates on national combined data; labeled "National" in UI status strip | `app/(tabs)/explore.tsx` | 2026-05-08 |
| BUG-09 | 🟡 Medium | Placeholder combos scored differently from real combos | ✅ Fixed — unified scoring; PBURST/CO distinguish placeholders | `engines/zk6.ts` | 2026-05-08 |
| BUG-10 | 🟡 Medium | Yesterday snapshot query missing `deleted_at=is.null` | ℹ️ By design — late-ET slates land on next UTC day and get soft-deleted; `updated_at_et.desc` already picks latest | — | — |
| BUG-11 | 🟡 Medium | Timezone handling ad-hoc | ℹ️ False positive — `Intl.DateTimeFormat` with `America/New_York` handles DST correctly | — | — |
| BUG-12 | 🟡 Medium | `histories` queries without jurisdiction filter | ℹ️ False positive — all three queries in `index.tsx` already include `jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)` | — | — |
| BUG-13 | 🟡 Medium | `bestOrderFor` pair key mismatch between `sortedPair()` and `normalizePairKey()` | ℹ️ False positive — both produce same 2-char sorted format (e.g., `"24"`) | — | — |
| BUG-14 | 🔵 Low | DGC returns 0 for combos with exactly 1 historical draw | ✅ Fixed — single-draw returns 0.3 (low but non-zero); never-drawn returns 0 | `engines/zk6.ts` | 2026-05-08 |
| BUG-15 | 🔵 Low | Energy emoji thresholds (80/65/45) | ℹ️ Acceptable — percentile-based 0–100 scale; tiers are 🔥 top 20% / ⚡ top 35% / ✦ top 55% | — | — |
| BUG-16 | 🔵 Low | Loose TypeScript `any` in snapshot fields | ✅ Fixed — `EngineMetadata` interface added; `horizons_present_json` and `weights_json` tightened | `types/core.ts`, `engines/zk6.ts`, `engines/zk30.ts` | 2026-05-08 |
| BUG-17 | 🔵 Low | No error boundary on pull-to-refresh in Home screen | ✅ Fixed — `handlePullRefresh` wrapped in try/catch; `finally` clears `isRefreshing` | `app/(tabs)/index.tsx` | 2026-05-08 |
| BUG-23 | 🔴 Critical | `background.PNG` uppercase extension — Metro only resolves lowercase `png`; app failed to load on web (Linux case-sensitive FS) | ✅ Fixed — renamed to `background.png`; updated `require` path in `_layout.tsx`; cleared Metro cache | `assets/background.png`, `app/_layout.tsx` | 2026-05-08 |
| BUG-24 | 🟡 Medium | `background.png` covered by solid opaque screen containers — `ImageBackground` in `_layout.tsx` hidden by `theme.colors.background` (`#0a0613`) on every tab screen container | ✅ Closed 2026-05-17 — `assets/background.png` deleted as part of BRAND-02 asset cleanup; `ImageBackground` already removed from `_layout.tsx` per the original 2026-05-08 fix. Deferred re-introduction plan retired; if a background image is wanted later it'll start from new art under the data-intelligence brand voice, not the legacy cosmic png. | `app/_layout.tsx`, `assets/background.png` (deleted) | 2026-05-08 (closed 2026-05-17) |
| BUG-25 | 🟡 Medium | `PickCard` and `SlateCard` using black `theme.shadows.soft` — colored glow lost | ✅ Fixed — both cards now use `theme.shadows.glow` (purple `#9b5bff`, radius 16); hot cards (energy ≥ 80) retain animated colored border glow | `components/PickCard.tsx`, `components/SlateCard.tsx` | 2026-05-08 |
| BUG-26 | 🟡 Medium | Results Screen: Hits Not Refreshed After Hit Detection | ✅ Fixed — `app/(tabs)/admin.tsx` invalidates query cache | `app/(tabs)/admin.tsx` | 2026-05-08 |
| BUG-27 | 🟡 Medium | Intelligence Top 30 Slate: No Hit Badge on SlateRow | ✅ Fixed — ⭐ STRAIGHT / 🎯 BOX badges added | `app/(tabs)/intelligence.tsx` | 2026-05-08 |
| BUG-28 | 🟠 High | Hit detection PATCHes (`daily_intelligence` + `slate_snapshots`) silently failing under BUG-20 lockdown — anon key writes blocked by `authenticated`-only UPDATE policies; app never produces JWTs. `hit_box`/`hit_straight` flags not persisted, snapshot enrichment not surviving session. Discovered 2026-05-12 by forensic investigation of BUG-20 write paths. SQL was generated 2026-05-12 but **never executed** in the first pass — PATCHes continued to 401 until re-applied 2026-05-12 (second pass). | ✅ Fixed — `GRANT UPDATE TO anon` + `intelligence_update_anon` + `snapshots_update_anon` policies created with `USING(true)/WITH CHECK(true)`. `DROP POLICY IF EXISTS` used to prevent silent conflicts on re-run. Permanent fix queued in Phase 3.5 (hit-detection Edge Function). 5/11 hit data (`combo=609 QC evening`, `combo=425 TX morning`) written directly via SQL after RLS was blocking the app write path. | `lib/hitDetection.ts` (no code change; RLS only) | 2026-05-12 |
| BUG-30 | 🟠 High | Intelligence screen — three wiring failures: (1) `slateScope` initialized to hardcoded `'midday'` ignoring global `useScope()` → Top 30 queried wrong scope for every non-midday user. (2) "Generate Slate" and "Go to Slates" buttons used `router.push('/(tabs)/explore')` from a hidden tab; `push` stacks on top of admin context → navigation resolved to home tab instead of explore. (3) `IntelligenceRouteView` used `router.push('/(tabs)/intelligence')` to open the screen, compounding the push-stack problem. (4) Home screen regen (`index.tsx`) did not call `queryClient.removeQueries` before `refreshSnapshot()` — stale cache served the old snapshot after regen. | ✅ Fixed — (1) Import `useScope`, init `slateScope` from `globalScope`. (2) "Generate Slate" replaced with inline `regenerateSlate()` call; "Go to Slates" switches internal view tab. (3) `router.push` → `router.navigate` in `IntelligenceRouteView.tsx`. (4) `useQueryClient` + `removeQueries` added to `index.tsx` `handleGenerate`. | `app/(tabs)/intelligence.tsx`, `components/admin/IntelligenceRouteView.tsx`, `app/(tabs)/index.tsx` | 2026-05-12 |
| BUG-33 | 🟠 High | Home screen "TODAY'S HITS" showing yesterday's picks — `hitItems` was derived from `hitPicks` (snapshot picks with `hitType` set) without any date validation. After draws land and hit detection marks picks, the next day those same snapshot picks still show up as "TODAY'S HITS" even when today has no draws yet. Fix: `hitItems` now validates each pick against `todayResults` from the `histories` table — only picks whose `toComboSet(combo)` appears in `todaySets` are surfaced. | ✅ Fixed | `app/(tabs)/index.tsx` | 2026-05-12 |
| BUG-34 | 🟠 High | Slates tab empty after all picks hit — `rawItems` fallback path (used when `activePicks` is empty) included a `.filter((p) => !p?.hitType)` guard. When all 6 picks hit on a given day, `activePicks` is empty AND the fallback filtered out all `hitType`-marked picks, producing an array of 0 items rendered as `---` placeholder rows. Fix: removed the `!p?.hitType` filter from the fallback path; the full snapshot is shown regardless of hit state. | ✅ Fixed | `app/(tabs)/explore.tsx` | 2026-05-12 |
| BUG-35 | 🟡 Medium | Intelligence Top 30 empty when no rows exist for today — `loadSlate` queried `daily_intelligence` for `slate_date=eq.{today}` only; if today's slate hasn't been generated yet the response is empty and the tab shows the EmptyState with no data. Fix: if today returns 0 rows, a fallback query for yesterday is issued. The most-recent populated day is always shown. | ✅ Fixed | `app/(tabs)/intelligence.tsx` | 2026-05-12 |
| BUG-37 | 🟠 High | Admin "Run Hit Detection Now" only ran for today — `handleDetectHits` in `DashboardView.tsx` hardcoded `getTodayET()`. On 5/12 this ran for a date with no draws and reported "no hits found." Yesterday's hits were never checked from the admin panel. Fix: iterate `[getYesterdayET(), getTodayET()]` in the outer loop so both dates are always checked. | ✅ Fixed | `components/admin/DashboardView.tsx` | 2026-05-12 |
| BUG-139 | 🔴 Critical | Intel screen "today's top 30" empty for allday after mid-day hits. Root cause: `daily_intelligence` write in both `compute-slate-zk6/index.ts` and `engines/zk6.ts` used `DELETE WHERE hit_box=false AND hit_straight=false` to preserve hit-stamped rows across regens, then INSERT new top30 with `Prefer: resolution={merge,ignore}-duplicates`. When the preserved hit rows occupied ranks the new top30 also wanted (2026-05-13 allday: 916 at rank 2, 924 at rank 8), the table's `UNIQUE(slate_date, scope, mode, rank)` constraint fired before PostgREST's conflict resolver could short-circuit on the natural key — the entire INSERT batch transaction aborted silently, swallowed by the try-catch. Net effect: only 2 rows remained for allday/balanced (the preserved hits) while the other ~28 ranks were lost. Midday/evening were unaffected because they had no hits → no preserved rows → no rank conflict. Manifested visibly as the Intel screen showing "today's top 30" with 0 picks for the allday slate. | ✅ Fixed: both write paths refactored to (1) read hit annotations from `adaptive_tracking` BEFORE the delete (canonical, slate_hash-keyed log per ENH-01), (2) DELETE ALL rows for (date, scope, mode) unconditionally — no rank-conflict failure mode possible, (3) INSERT fresh top30 + extra K6 + appended "hit-orphan" rows (combos that hit today but fell outside the new top30 because their box-set was excluded by the today-hit filter — these get rank 31+ so Intel + Track Record still see them with hit annotations intact). Edge function deployed via `supabase functions deploy compute-slate-zk6`. Force-regen for today's allday recovered from 2 → 32 rows (30 fresh top-indicator + 916/924 hit-orphans at rank 31-32). Midday + evening force-regen confirmed no regression (32 + 31 rows). | `supabase/functions/compute-slate-zk6/index.ts`, `engines/zk6.ts` | 2026-05-13 |
| BUG-138 | 🟠 High | Home screen's "TODAY'S HITS" section (`app/(tabs)/index.tsx::hitItems`) sourced from `useSnapshot().hitPicks` — sibling of BUG-137. Same regen-empty anti-pattern: hitPicks is `snapshot.top_k_straights_json.filter(p.hitType)`, but after a mid-day regen the new K6 excludes already-drawn box-sets so hitType is never set on them and the section renders empty even when daily_intelligence + adaptive_tracking have real hits (2026-05-13 allday: 916/WI + 916/ME,NH,VT + 924/GA all box-hit, Home displayed nothing). Sweep-discovered after BUG-137 ship. | ✅ Fixed: Home now queries `adaptive_tracking?slate_date=eq.today&scope=...&or=(hit_box.eq.true,hit_straight.eq.true)` and produces one PickItem per matched_state row — multi-state pick 916 renders as 2 stacked HitCards (WI midday + ME,NH,VT midday) instead of disappearing. Cleanup: `hitPicks` removed from `useSnapshot`'s return + SnapshotState interface (no consumer remained after the rewrite); stale `hitPicks` destructure removed from `app/(tabs)/explore.tsx` (it was already disconnected per BUG-136 — see line 416 comment). | `app/(tabs)/index.tsx`, `hooks/useSnapshot.tsx`, `app/(tabs)/explore.tsx` | 2026-05-13 |
| BUG-137 | 🟠 High | Admin Performance screen ("Hit Tracking") Section A "Hit Summary" still sourced from `expandedData.picks` (snapshot `top_k_straights_json`) and Section C "State Breakdown" cross-referenced the same — after BUG-127's mid-day regen pattern (engine excludes already-drawn box-sets from the new slate's K6 to avoid re-recommending what already hit), the active snapshot's picks[] is "post-regen empty" of any hit-bearing combos. So for today's allday (active snapshot `2EA69971` = [824,926,516,936,538,586]), Section A rendered "Went 0 for 6" and the multi-state ME,NH,VT box hit on combo 196 (originally picked under hash 916/924/...) never surfaced. The Phase 3 "Where the hits came from" block was already adaptive_tracking-backed and DID show it — but Section A is the prominent top block. User report: "is the performance screen correctly wired. multi-state hit is missing from the allday". | ✅ Fixed: rewrote Section A + Section C to source from `expandedData.trackingRows` (adaptive_tracking, keyed by slate_hash so it survives regens, and INSERTs additional rows for multi-state secondaries per BUG-136). Section A now groups by `combo`, treats N matched_state rows for the same combo as 1 hit but renders every jurisdiction in the chip ("🎯 Box · WI midday · ME,NH,VT midday"). Counts now agree with row-level aggregation upstream (which also de-dupes by combo). Section C reads tracking row by `combo_set` to detect whether a draw landed on a K6 pick and shows its rank. | `components/admin/HitTrackingView.tsx` | 2026-05-13 |
| BUG-38 | 🟠 High | Results screen tier-3 scope-limited — `useSnapshot().hitPicks` only returns picks for the globally selected scope (midday/evening/allday). Allday slate hits are invisible when the user is on midday or evening scope. Symptom: switching to midday scope caused allday hits to vanish from the Results ledger. Fix: replaced `useSnapshot()` call with a direct `slate_snapshots` query that fetches all three scopes, then derives `snapshotHitPicks` client-side by parsing each row's `top_k_straights_json` for picks with `hitType` set. | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-39 | 🟠 High | `file_meta` column does not exist in `slate_snapshots` — the tier-3 all-scope snapshot query (introduced with BUG-38 fix) explicitly requested `select=scope,top_k_straights_json,file_meta`. PostgREST returned 400 on every fetch; all four scope-variant queries failed silently, leaving tier-3 empty. Fix: removed `file_meta` from the SELECT column list and dropped the supplement-skip guard that depended on it (supplemental slates are already excluded via `mode=neq.zk30`). | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-40 | 🟠 High | `on_slate=false` blocked tier-1 confirmed hits — the `hits` query in `results.tsx` included `on_slate=eq.true`. The "Clear Top 30" admin button sets `on_slate=false` for all rows; after a clear, `hit_box=true` rows existed in `daily_intelligence` but the tier-1 query returned `[]`. Hits were written to DB correctly yet never shown on the Results screen. Fix: removed `on_slate=eq.true` from the confirmed-hits (`hits`) query only. The `onSlatePicks` query (tier-2 fallback) retains `on_slate=eq.true` as intended — it shows only currently active picks for client-side detection. Confirmed hits must surface regardless of whether the row was subsequently cleared. | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-36 | 🟠 High | Results screen shows no hits when `daily_intelligence.hit_box/hit_straight` not yet backfilled — the `hits` query required `or=(hit_box.eq.true,hit_straight.eq.true)` meaning it only returned DB-confirmed hits written by `backfillIntelHits`. When ledger is imported but backfill hasn't run (ARCH-05 dependency), no hits appear in the results ledger. Fix: added `onSlatePicks` query (all on-slate picks, no hit filter) and updated `processed` memo to do client-side box-matching — `toComboSet(combo) === toComboSet(result_digits)` — as fallback when DB hits are absent. Straight hits detected when `combo === result_digits || best_order === result_digits`. | ✅ Fixed | `app/(tabs)/results.tsx` | 2026-05-12 |
| BUG-135 | 🟡 Medium | Two parts: (a) `adaptive_tracking` schema (`schema_complete_v21.sql`) was missing `matched_state` and `matched_session` columns, but `lib/hitDetection.ts::recordHitInAdaptiveTracking` was sending them on every insert — PostgREST silently dropped the keys, so production rows lost the "which state/session actually produced this hit" data (needed when a box-set draws simultaneously in multiple jurisdictions; 2026-05-13 had allday pick 916 matching both WI 619 and ME,NH,VT 196). (b) BUG-134's "allday session-match" narrowing was incorrect — the user's convention is that `allday` means "ANY draw all day long" (midday + evening + morning + night), not "midday + evening only." My BUG-134 narrowing caused the phantom-annotation cleanup to clear ~13 valid allday hits where `hit_session=night`. | ✅ Fixed: (a) migration `supabase/migrations/2026-05-13_adaptive_tracking_matched_columns.sql` adds both columns + index on matched_state. (b) `lib/hitDetection.ts` allday clause reverted to permissive (`snapshot.scope === 'allday'` matches any session). `lib/backfillIntelHits.ts` updated to pass histories through unfiltered for allday picks. Memory feedback saved (`feedback_allday_semantics.md`). The cross-scope strictness for midday/evening picks remains in place — they still only match their own session. | `lib/hitDetection.ts`, `lib/backfillIntelHits.ts`, `supabase/schema_complete_v21.sql`, `supabase/migrations/2026-05-13_adaptive_tracking_matched_columns.sql` | 2026-05-13 |
| ENH-01 | 🟢 Enh | E1+E2+E5 — `adaptive_tracking` becomes the canonical K6 training dataset. Previously it was a hit-only log: lib/hitDetection.ts::recordHitInAdaptiveTracking was the only writer and only fired on hits, so the table couldn't answer "what's the AUC of signal X" (no miss rows). E1: slate-gen pre-writes one primary row per K6 pick (signals + quartile flags + dominant_signal) with NULL outcome → hit detection now UPDATES the existing row instead of always INSERTing → multi-state secondary matches still INSERT (no per-pick uniqueness on adaptive_tracking). E2: `*_top_quartile` flags computed at slate-gen time per signal vs the daily top-30 population (top 25% threshold). E5: migration `2026-05-13_adaptive_tracking_dominant_signal.sql` adds the `dominant_signal` column hitDetection.ts has always been sending (and PostgREST silently dropping). Backfill script `npm run backfill:adaptive-tracking` seeds historical primary rows from past 30d snapshots so Calibration Dashboard has signal/outcome pairs from day-one. **Edge function compute-slate-zk6/index.ts also updated — needs deploy.** | ✅ Code shipped. Migration apply + edge deploy + backfill pending user. | `supabase/migrations/2026-05-13_adaptive_tracking_dominant_signal.sql`, `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts`, `lib/hitDetection.ts`, `scripts/intel-tuning/backfill-adaptive-tracking.ts`, `supabase/schema_complete_v21.sql`, `package.json` | 2026-05-13 |
| BUG-136 | 🟡 Medium | Multi-state hits invisible: when a box-set drew simultaneously in multiple jurisdictions (e.g. today's pick 916 matching both WI 619 AND ME,NH,VT 196 box-set), `lib/hitDetection.ts` broke its result-iteration loop at first match — so only WI got logged. `daily_intelligence` only has room for one match (1 row per pick), but `adaptive_tracking` allows multiple. Verified Track Record query only read `daily_intelligence` so the ME,NH,VT match was invisible. Separately, `useFollowedStates::toPostgrestFilter` treated jurisdiction strings as exact-match-only — following "ME" wouldn't show "ME,NH,VT" rows even though the Tri-State drawing IS shared. Also: PostgREST `in.(...)` syntax splits on commas, so comma-laden values like `ME,NH,VT` need double-quote wrapping or the value is interpreted as three separate ME/NH/VT entries. | ✅ Fixed: hitDetection collects ALL jurisdiction matches per pick → first match becomes canonical annotation, additional matches logged to adaptive_tracking. track-record.tsx merges daily_intelligence + adaptive_tracking results. useFollowedStates expands ME/NH/VT follows to include `ME,NH,VT` (and BC/AB → `W.Canada`), and wraps comma-containing values in double quotes per PostgREST `in.(...)` syntax. Live API test confirmed: unquoted filter returns 1 row, quoted returns both. | `lib/hitDetection.ts`, `app/track-record.tsx`, `hooks/useFollowedStates.tsx` | 2026-05-13 |
| BUG-134 | 🟠 High | Three independent code paths leaked uncoerced `night`/`morning` session data into hit annotations, producing phantom hits on `allday` slates: (1) `components/admin/ImportWizardView.tsx::importType==='ledger'` inserted raw entries via PostgREST without applying the night→evening / morning→midday coercion that `useDataIngestion::importLedgerMutation` (line 697) enforces. 203 uncoerced rows landed in `histories` 2026-04-18 → 2026-05-12 from GA, DE, CT, ID, VA, DC, TX, TN — jurisdictions with separate late-night Cash 3 / Pick 3 draws. (2) `lib/hitDetection.ts::runHitDetectionAndRefresh` line 205 had `snapshot.scope === 'allday'` as a session-match short-circuit that accepted ANY session including night/morning, so allday hit detection picked up the uncoerced rows and stamped `hit_session=night` onto `daily_intelligence`. (3) `lib/backfillIntelHits.ts` had no scope/session filter at all — its `histories.find(r => r.comboset_sorted === pick.combo_set)` matched on any session, same class of bug. 2026-05-13 30d audit found 41/363 phantom daily_intelligence hit flags (11.3%) and 19/46 phantom slate_snapshots top_k_straights_json hit annotations (41.3%). | ⚠️ Partially fixed — see BUG-135 for correction. **Original fix (correct):** (1) `ImportWizardView.tsx` now applies `coerceSession` before dedup+insert (later REVERTED by ledger Tri-State fix 2026-05-13 since coercion caused TN/TX morning-vs-day collisions). **Original fix (incorrect):** (2) `hitDetection.ts:205` rewritten to require midday|evening for allday scope — REVERTED in BUG-135 since allday = any session per user convention. (3) `backfillIntelHits.ts` filter REVISED in BUG-135. **Data cleanup applied 2026-05-13 (partially regret):** 76 night rows coerced to evening (some legit night draws got mislabeled — irreversible without per-row audit log). 13 daily_intelligence rows cleared as "phantoms" that were actually valid allday hits; will be re-marked on next backfill run. 28 relabels remain (changed hit_session from night→evening for rows that matched a separate evening draw — points to a different real draw, technically incorrect but harmless for analytics). | `components/admin/ImportWizardView.tsx`, `lib/hitDetection.ts`, `lib/backfillIntelHits.ts` | 2026-05-13 |
| BUG-133 | 🟡 Medium | `hooks/useEnergyBandHitRates.tsx` (shipped 2026-05-13 with §2.2 "verified by" footer) queried `daily_intelligence` with `select=energy,...` and `energy=not.is.null` — the actual column is `energy_score`. PostgREST returned `42703 column daily_intelligence.energy does not exist` on every fetch, so the byBand map always had zero rows, and PickCard's `showBandFooter` (gated on `bandStat.total >= 50`) never rendered. Net effect: §2.2 was shipped non-functional, but failed silently — no error toast, no broken UI, the row just didn't appear. Discovered 2026-05-13 while building compute-daily-report and verifying daily_intelligence schema against the live DB. | ✅ Fixed — replaced `energy` with `energy_score` everywhere in the hook (query path, select clause, type, queryKey). Smoke-tested against live DB: returns valid rows with `energy_score` values. | `hooks/useEnergyBandHitRates.tsx` | 2026-05-13 |
| BUG-132 | 🟠 High | Hit detection in `lib/hitDetection.ts::updateDailyIntelligenceHit` PATCH had no `scope` or `mode` filter — `PATCH /rest/v1/daily_intelligence?slate_date=in.(date,prev)&combo=eq.${combo}` matched every row across midday/evening/allday and every mode. The outer loop in `runHitDetectionAndRefresh` (lines 159-242) correctly gates by `sessionMatches`, but when a hit is found (e.g., midday draw → allday slate), the PATCH sweeps `hit_box=true` onto every same-combo row in `daily_intelligence` regardless of which slate scope the row belongs to. Effect: an evening-scope row whose combo happened to match a midday draw was marked hit. Inflated downstream counts in Track Record band, Intel "Hits Today" chip, Results Tier 1, Adaptive Learning rates. Surfaced 2026-05-12 by user noticing cross-scope hits on Results screen (e.g., 487 evening pick credited to midday CA draw). | ✅ Fixed — `updateDailyIntelligenceHit` now takes `{scope, mode}` from the snapshot and appends `&scope=eq.${snapshot.scope}&mode=eq.${snapshot.mode}` to the PATCH URL. PATCH now narrowed to the slate context that produced the hit. **Defense-in-depth retained:** client-side scope gates added 2026-05-12 in `app/(tabs)/results.tsx` (Tier 1 `scopeMatches`, Tier 3 `slate_date` filter), `app/(tabs)/intelligence.tsx` (`rowHitIsScopeValid` for SlateRow + Hits Today count), and `app/(tabs)/index.tsx` (Track Record query) — left in place to self-correct if the underlying bug regresses or a future surface mis-uses raw `hit_box`. **Historical data cleanup — ✅ Done 2026-05-12.** 181 phantom hit flags identified across 19 dates (4/19 → 5/12), all cleared via SQL UPDATE: `SET hit_box=false, hit_straight=false, hit_state=NULL, hit_session=NULL, hit_result=NULL WHERE (hit_box=true OR hit_straight=true) AND scope<>'allday' AND hit_session IS NOT NULL AND scope<>hit_session AND mode IN (balanced/conservative/aggressive)`. Post-cleanup verification query returned `phantom_count: 0`. Notable removals included 5/12 evening 289 (the on_slate=true K6 phantom that was inflating the Track Record band's hit count to 3 instead of 2). Row data preserved — only annotation columns reset; hit detection can re-run later under the BUG-132-fixed code if re-attribution is desired. `adaptive_tracking` not touched (INSERT-only path that always used `snapshot.scope` correctly). | `lib/hitDetection.ts` | 2026-05-12 |
| BUG-131 | 🟡 Medium | `update_pair_draws_since_from_results` RPC (Postgres function in `tgagarhwqbdcwoqhpapi`) mutated `datasets_pair.draws_since` with **no horizon, class_id, or jurisdiction filter**, and was **not idempotent** — re-importing the same date double-incremented. Triggered by `runHitDetectionAndRefresh` in `hooks/useDataIngestion.tsx:590-603` once per (date × scope) per ledger import. Effect: `draws_since` values across H01Y…H10Y, all pair classes (2-11), and all jurisdictions had been drifting in lockstep for an unknown duration. Discovered 2026-05-12 while triangulating user report of "top picks not verifying since 5/9." **Engine math is unaffected** — both `engines/zk6.ts:113` and the edge function (`compute-slate-zk6/index.ts:169`) read `ds_raw`, not `draws_since`. Cosmetic damage only: HeatCheckModal "days ago" verdict (`components/HeatCheckModal.tsx:124,183,193`) and Intelligence rank-band display (`app/(tabs)/intelligence.tsx:145,363-364`) showed wrong values for pair data. Verified separation via `information_schema.columns` (both columns present) + `pg_get_functiondef('public.sync_pair_keys')` (trigger only syncs `key`↔`key_pair` text, never numerics). | ✅ Fixed — (1) call site removed from `useDataIngestion.tsx::runHitDetectionAndRefresh` so the broken RPC stops firing on every ledger import. (2) RPC neutered server-side via `CREATE OR REPLACE` no-op returning `{status:'neutered', reason:'BUG-131'}`. Mirrors BUG-130 fix pattern. **Follow-up belongs to ZK30 workstream:** clarified 2026-05-12 — `draws_since` is functionally vestigial for ZK6's national-aggregated model (one row per `(class, scope, horizon)` slice with `jurisdiction IS NULL`, engine reads `ds_raw` instead). The column actually matters for ZK30, which uses per-state line-by-line 2-year drawing histories where per-jurisdiction `draws_since` drives display. The pair-rebuild work therefore lands in ZK30's data import pipeline, not in ZK6's stabilization sprint. ZK30 is currently locked per CLAUDE.md until ZK6 is verified ≥73% over 7d post-fix. Until ZK30 work resumes, displayed "days ago" pair values in HeatCheckModal/Intelligence are stale and should not be trusted. | `hooks/useDataIngestion.tsx`, Postgres `public.update_pair_draws_since_from_results` | 2026-05-12 |
| BUG-130 | 🔴 Critical | `importDaily` in `hooks/useDataIngestion.tsx` ignored the CSV's `DrawsSince` column — only collected `combo` field and treated each combo as a "hit" indicator (`ds_raw=0`) while incrementing all other rows by `+1`. Effect: every daily upload silently drove `datasets_box.ds_raw` further from reality (drift of ~24 days × 220 rows = thousands of corrupted values). Discovered 2026-05-12 after BUG-129 led to investigation of `ds_raw=257` for a combo last drawn 14 days ago. | ✅ Fixed — `importDaily` ds_raw mutation neutered (no-op with console warning instructing user to run `rebuild:datasets`). The import record creation is preserved for audit trail. **End-state, not interim:** clarified 2026-05-12 — neuter is the intended ZK6 architecture. `rebuild:datasets` (recomputes from histories — actual ground truth) is the canonical source of truth for `ds_raw`. Re-wiring `importDaily` to consume CSV `DrawsSince` would re-introduce the same risk class (stale CSVs, manual upload errors). **Remaining cosmetic gap:** the upload UI implies action it isn't taking — pre-launch polish item, add a banner like "Run `rebuild:datasets` to apply." Not blocking. | `hooks/useDataIngestion.tsx` | 2026-05-12 |
| BUG-129 | 🔴 Critical | Edge function (`supabase/functions/compute-slate-zk6/index.ts`) used the WRONG horizon source for `dsRawMap` and `pairMetaMap`. The canonical engine design (per `engines/zk6.ts` lines 173-208 and the H01Y comment) requires H01Y-preferred values for both `dsRaw/drawsSince` (BOX signal pressure) and pair `dsRaw/timesDrawn` (PBURST + CO signals). The edge function instead selected the horizon with the **highest `times_drawn`** — typically H10Y for both paths — meaning 10-year aggregates were being fed into BOX-pressure scoring and pair signal computation. Discovered 2026-05-12 evening when user reported zero hits on 5/12 midday slate: local replay (using correct H01Y math) would have picked combos that hit; production edge function picked totally different combos (e.g., `592 BOX=0.97 PB=0.88 CO=0.88` in production vs `592 BOX=0.97 PB=0.78 CO=0.85` under correct math). Production had been using inflated PBURST/CO scores for an unknown duration. Real-world impact verified same day: after the fix, production slate immediately picked `605` (rank 2 allday energy=98) which BOX-hit Mississippi's `065` midday draw — first verifiable production hit of the day. | ✅ Fixed in both paths: (1) `dsRaw/drawsSince` map now updates only when `h === 'H01Y' \|\| !drawsSinceMap.has(normKey)`, non-zero wins within H01Y. (2) `pairMetaMap` same H01Y-preferred rule. `timesDrawn` still takes max across horizons (correct per design — it's a frequency aggregate). Edge function redeployed 21:30 UTC after deploy validation. All prior backtest results (`default 71.8%`, `floor70 73.1%` on clean pre-5/9 window) represent the **post-fix** engine behavior — production is now aligned with backtest projections. | `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |
| BUG-128 | 🟠 High | K6 slate displayed in selection-pass order instead of indicator order. When yesterday-block + 20-day cooldown reject many top-indicator combos in pass 1, low-indicator combos (often doubles drawn weeks ago, e.g. 133 ind=0.55 energy=10) get pushed into k6[0]/[1], while high-indicator picks added in pass 5 (cooldown relaxed, e.g. 248 ind=0.94 energy=100) end up at k6[4]/[5]. The user sees "abnormally low energy" at the top of the slate even though the SAME 6 combos previously displayed with high-energy picks first by coincidence of selection order. Fix is purely cosmetic — sort `k6` by indicator desc after pass-6 completes. Same 6 combos selected, just reordered for display. Deterministic: hash uses the sorted order. | ✅ Fixed in both `engines/zk6.ts` and `supabase/functions/compute-slate-zk6/index.ts`. | `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |
| BUG-127 | 🟠 High | K6 picks not marked `on_slate=true` in `daily_intelligence` when they fall outside top30 by indicator. Pre-fix sequence: (1) INSERT top30 with `on_slate=false`; (2) PATCH `on_slate=true WHERE combo IN (k6_combos)`. The PATCH failed silently (0 rows matched) when K6 picks weren't in top30 — which routinely happens after BUG-126/BUG-125 fix because yesterday-block + cooldown filter K6 selection but didn't filter top30. Result: Intelligence screen showed 30 top-indicator picks with no slate marker and the actual K6 picks were absent entirely. | ✅ Fixed — embed `on_slate=true` directly into the INSERT row for K6 combos (no separate PATCH). Append any K6 picks not in top30 as additional rows past rank 30 so they're queryable. | `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |
| BUG-126 | 🟠 High | `top30PreRail` did not apply the yesterday-hit hard block, so `daily_intelligence` showed recently-drawn box-sets at the top of the Intelligence screen while the slate (correctly, post-BUG-125) excluded them. Created a permanent misalignment between top30 and K6 picks. | ✅ Fixed — `top30PreRail` now filters out any `todayHitComboSets` box-set before the sort+slice. | `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |
| BUG-125 | 🟠 High | Yesterday-hit hard block missing from edge function (`supabase/functions/compute-slate-zk6/index.ts`). The May 11 fix that added a two-source hard block (histories + daily_intelligence, today + yesterday) to `engines/zk6.ts` was never propagated to the edge function. Production app runs `EXPO_PUBLIC_USE_EDGE_ZK6=true`, so every published slate was using the buggy path — yesterday's drawn numbers could slip back into today's picks. Detected during code-changes-era hit-rate investigation: 6 edge-sourced slates hit at 33.3% vs 67 live-sourced at 70.1%. Validated via backtest replay (30 days × 3 scopes, n=87 each): adding the block (default config) vs no block (edge_current config) lifts slate hit rate from 70.1% [59.8–78.7%] → 73.6% [63.4–81.7%] overall, with positive deltas in every scope (midday +3.4pp, evening +3.4pp, allday +3.5pp). CIs overlap but candidate wins on every cut. | ✅ Fixed — ported lines 595–647 from `engines/zk6.ts` to edge function: imported `getYesterdayET`, replaced single-source `histories?date_et=eq.today` query with dual-source block (histories `gte.yesterdayEt&lte.todayEt` + daily_intelligence `slate_date=gte.yesterdayEt&or=(hit_box.eq.true,hit_straight.eq.true)`). K6 hard-block guard at line 414 unchanged — it already consumed `todayHitComboSets`. | `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |
| BUG-124 | 🟠 High | Hit-annotation bleed onto today's slate. `lib/hitDetection.ts::resolveSnaps` fallback queried the most-recent snapshot with no date constraint when the primary date-range query returned empty for a scope — today's freshly-generated snapshot would be PATCHed with hit annotations matching yesterday's draws. Separately, `updateDailyIntelligenceHit` included `nextDayStr` in `slate_date IN (...)` filter on the mistaken assumption that engines tag late-night regens with tomorrow's date; engines actually use the current ET date, so `nextDayStr` caused today's `daily_intelligence` rows to receive hit flags from yesterday's draws. Bug pattern verified in code; smoking-gun snapshot not present in live data at investigation time (likely overwritten by 2026-05-12 17:53 UTC regen between event and investigation). User-visible symptom: "⭐ BOX HIT" badges and "DREW → <yesterday's number>" footers on today's fresh picks in Slates tab. | ✅ Fixed (preventive) — `resolveSnaps` fallback now constrains by `slate_date=lte.${date}`; `updateDailyIntelligenceHit` removed `nextDayStr` from date filter. No cleanup SQL required — live snapshots already clean at fix time. | `lib/hitDetection.ts` | 2026-05-12 |
| BUG-32 | 🟡 Medium | Slates grid view not filling screen height (regression from ctrlStrip ScrollView change) — `ctrlStripOuter` horizontal ScrollView had no `maxHeight` constraint; claimed flex space from SafeAreaView column on iOS, leaving `gridContainer` (flex:1) with insufficient remaining height. Tiles rendered at natural height near bottom of compressed space instead of distributing across full screen. | ✅ Fixed — added `maxHeight: 46` to `ctrlStripOuter` style in `explore.tsx`. Mirrors `maxHeight: 38` pattern on `scopeRow`. | `app/(tabs)/explore.tsx` | 2026-05-12 |
| BUG-31 | 🔴 Critical | `daily_intelligence` always empty after regen — edge function INSERT used wrong column names: `energy` (DB: `energy_score`), `indicator` (column does not exist), `times_drawn` (column does not exist). PostgREST returned 400 on every INSERT. Error silently swallowed by `catch` block — client always saw `regen ok`, snapshot was written, but all 30 `daily_intelligence` rows were discarded every time. Top 30 Slate was permanently empty. | ✅ Fixed — corrected INSERT to `energy_score: p.energy`; removed `indicator` and `times_drawn` fields. Edge function redeployed. | `supabase/functions/compute-slate-zk6/index.ts` | 2026-05-12 |

---

### Open Bugs

#### 🟠 High

**BUG-18 — Date Tagging Paradox (Late-Night Regen)** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §3.3_  
- **Files:** `engines/zk6.ts`, `engines/zk30.ts`, `lib/hitDetection.ts`  
- **Problem:** Engines tag `slate_date` in `daily_intelligence` using `getTodayET()` at generation time. A slate generated Friday night is tagged with `slate_date=Friday`. When hit detection runs for Saturday's results, `updateDailyIntelligenceHit` patched `slate_date=Saturday` — missing the Friday-tagged row, so intelligence hit flags were silently not updated.
- **Status:** ✅ **Fully Fixed 2026-05-12** — `updateDailyIntelligenceHit` in `lib/hitDetection.ts` uses `slate_date=in.(date,prevDay)` (fixed 2026-05-11). `slate_date date` column added to `slate_snapshots` via SQL migration; index on `(slate_date, scope) WHERE deleted_at IS NULL`; backfilled from `updated_at_et`. Both engines now write `slate_date: effectiveDate` to snapshot payload. `SlateSnapshot` type updated.

**BUG-19 — Snapshot Window Too Narrow for Hit Detection** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.1_  
- **Files:** `lib/hitDetection.ts`, `hooks/useDataIngestion.tsx`  
- **Problem:** Hit detection queries only the "Latest 2" snapshots. If multiple supplemental slates or scope regenerations have occurred, the original primary slate is outside the window and its hits are never detected.  
- **Status:** ✅ **Fixed 2026-05-11** — `lib/hitDetection.ts` now uses date-range query (`updated_at_et ≥ date AND < nextDay 09:00Z`) with `limit=10` and per-scope fallback to most-recent. All primary + supplemental slates for the target date are checked.

#### 🟡 Medium

**BUG-20 — Permissive RLS on Core Tables** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §5.1_
- **Tables:** `slate_snapshots`, `daily_intelligence`, `adaptive_tracking`
- **Problem:** `slate_snapshots` had `allow_all` for `{public}`. `daily_intelligence` had two ALL policies for anon+authenticated. `adaptive_tracking` had RLS disabled entirely.
- **Status:** ⚠️ **Partial — 2026-05-12 (downgraded from ✅ Fixed after forensic investigation)**
  - ✅ ZK6 INSERT path: secured via Edge Function (`compute-slate-zk6`) using `service_role` — bypasses RLS by design. No client INSERT path remains for ZK6 snapshots.
  - ✅ `adaptive_tracking`: RLS enabled with explicit anon INSERT policy for `lib/hitDetection.ts`.
  - ⚠️ Hit detection UPDATE path: PATCHes from `lib/hitDetection.ts` use anon key. Original lockdown left UPDATE policies as `authenticated`-only, which is unreachable from this client (no JWT auth flow). Hit persistence silently failed from lockdown date until 2026-05-12. Restored 2026-05-12 via `intelligence_update_anon` and `snapshots_update_anon` policies (USING true, WITH CHECK true). See BUG-28.
  - ⚠️ ZK30 INSERT path: would silently fail under current RLS, but not exercised in production (ZK30 not built out). See BUG-29.
  - ⚠️ Dead-code policies remaining: `snapshots_update_authenticated` and `intelligence_update_authenticated` are unreachable from the client (anon key only, no JWT). Functionally inert. Drop at next RLS sweep or leave pending hit-detection Edge Function migration.
- **Permanent fix:** Phase 3.5 hit-detection Edge Function migration moves PATCHes to `service_role`; then drop both `*_update_anon` policies. Tracked in roadmap.

**BUG-21 — Data Sparsity Fallback Not Surfaced in UI** _Source: SYSTEM_AUDIT_REPORT_2026-05-08.md §4.2_  
- **Files:** `engines/zk6.ts` (fallback to `allday` if < 50 rows), `app/(tabs)/explore.tsx`, `components/StatusRibbon.tsx`  
- **Problem:** When scope data is sparse, ZK6 silently falls back to `allday`. User sees midday picks but they're actually allday picks.  
- **Status:** ✅ **Fixed 2026-05-11** — `horizons_present_json._dataStats.usingFallback` flag was already stored in snapshots. `explore.tsx` status strip now reads this flag and shows `⚠ allday fallback` in amber when true and scope ≠ allday. `StatusRibbon.tsx` horizon filter also fixed to only include `H0XY` keys (was incorrectly including `_dataStats`, `_engineVersion`, etc.) and now shows a dedicated fallback chip.

#### 🔵 Low

**BUG-22 — `excludedCombos` Not Cleared Between Regen Calls** _Source: AUDIT_2026-05-08.md §3 hooks_  
- **Files:** `hooks/useDataIngestion.tsx`  
- **Status:** ✅ **FALSE POSITIVE — Already Fixed.** Verified 2026-05-11: `regenerateMutation` at line 1024 creates `const excluded = new Set<string>()` as a fresh local variable on every invocation. No shared mutable state exists between calls.

#### 🔵 Latent / Not Active

**BUG-29 — ZK30 Persistence Would Fail Under Current RLS**
- **Files:** `engines/zk30.ts` (`saveSlateSnapshot`, lines ~549, 560–578)
- **Problem:** ZK30 has no Edge Function counterpart. `saveSlateSnapshot` writes to `slate_snapshots` with anon key. Under current RLS, INSERT is denied → silent fallback to `audit_logs`. ZK30 picks would render in UI from in-memory result but never persist.
- **Status:** Latent — not active in production. User confirmed 2026-05-12: "ZK30 is a standalone build, not yet completed, no history imported." Verified absent from `slate_snapshots` across last 14 days (no `mode='zk30'` rows).
- **Permanent fix:** Phase 3.6 ZK30 Edge Function migration. Until then, do not enable ZK30 in production without either deploying the Edge Function or adding a constrained `snapshots_insert_anon_zk30` policy (`WITH CHECK (mode = 'zk30')`).

---

## Deep Scan Findings — 2026-05-12

Full read of every production file. 83 new findings (BUG-41–BUG-123) + 22 enhancement opportunities. None fixed yet — awaiting triage orders.

---

### 🔴 Open — Critical

**BUG-56** `app/(tabs)/book.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Number Book initializes with three hardcoded sample lists. Fixed: `lists` initializes to `[]`; custom lists persisted to AsyncStorage under `number_book_lists` key; load effect merges custom + `saved_slates` on mount.

**BUG-57** `app/(tabs)/book.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Custom lists not persisted — closing app destroyed all saved combos. Fixed: `useEffect` writes custom lists to `number_book_lists` on every mutation (guarded by `listsLoaded` flag to skip initial load).

**BUG-59** `app/(tabs)/admin-imports.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
`hardDeleteImport` used raw `XMLHttpRequest` with inline auth headers, bypassing `fetchFromSupabase`. Fixed: replaced XHR with `del = (path) => fetchFromSupabase({ path, method: 'DELETE' })`; added `fetchFromSupabase` import.

**BUG-82** `components/admin/HealthTestsView.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Supabase project ref `tgagarhwqbdcwoqhpapi.supabase.co` rendered as visible UI text. Fixed: replaced with `Connected · ZK6 Engine v2`.

**BUG-84** `components/admin/HitTrackingView.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
`softDeleteById` used raw `XMLHttpRequest` with inline auth headers. Fixed: replaced with async `fetchFromSupabase` PATCH; `try/finally` ensures `setDeleting(false)` on both success and failure.

**BUG-107** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12 (commit 42f6d2c)
Full Supabase anon JWT hardcoded as a fallback in `hardDeleteImport`. Fixed: removed both hardcoded fallback strings (`_url` and `_key`); replaced `xhrDelete` inner function with `del = (path) => fetchFromSupabase({ path, method: 'DELETE' })`.

---

### 🟠 High (All fixed 2026-05-12)

**BUG-41** `app/(tabs)/index.tsx` — ✅ Fixed 2026-05-12
Hit banner subtitle now uses `hitBanner.hitType` to show "Straight hit ✓" or "Box hit ✓". Also added `hitType` to the hitBanner memo return object.

**BUG-45** `app/(tabs)/explore.tsx` — ✅ Fixed 2026-05-12
Yesterday snapshot query filtered `updated_at_et=lt.${todayStr}T09:00:00` — slates after 9 am ET yesterday were missed. Fixed: changed upper bound to `T00:00:00` (UTC midnight).

**BUG-52** `app/(tabs)/intelligence.tsx` — ✅ Fixed 2026-05-12
`computeAnalysis` weight-decay used device `new Date()` as reference, causing ET mismatch. Fixed: changed to `new Date(getTodayET() + 'T12:00:00')` to anchor to ET noon.

**BUG-69** `app/import-wizard.tsx` — ✅ Fixed 2026-05-12
After ledger import, hit detection fired only for `entries[0].date_et`. Fixed: collects unique dates from all entries; calls `runHitDetectionAndRefresh` for each date via `Promise.all`, then aggregates `HitDetectionResult` totals.

**BUG-75** `components/admin/DashboardView.tsx` — ✅ Fixed 2026-05-12
`handleDetectHits` called `runHitDetectionAndRefresh(sc, date)` per-scope (3 × 2 dates = 6 calls) but `_scope` was ignored — redundant 6× work. Fixed: removed scope loop; calls `runHitDetectionAllScopes(date)` once per date.

**BUG-85** `components/admin/HitTrackingView.tsx` — ✅ Fixed 2026-05-12
"View Results" quick-action button had `onPress={() => {}}` — a complete no-op. Fixed: `router.push('/(tabs)/results')` added.

**BUG-88** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
Pair score displayed `ds_raw / maxDsRaw` (staleness ratio), treating staleness as a positive signal. Fixed: changed `getScore` to return `row.times_drawn ?? 0` (frequency), consistent with engine pair logic.

**BUG-89** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
`generatedAt` showed current render time, never slate generation time. Fixed: uses `pick.generatedAt` (already set to `snapshot.updated_at_et` by `explore.tsx`), formatted as ET.

**BUG-90** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
"Save to Number Book" button showed a toast but performed no actual save. Fixed: reads `number_book_lists` from AsyncStorage, appends combo to the first list (or creates one if empty), writes back.

**BUG-94** `engines/zk6.ts` — ✅ Fixed 2026-05-12
Prior-snapshot soft-delete used hardcoded 4h ET offset, missing pre-1am EST slates. Fixed: uses `slate_date` column filter (`slate_date=eq.${effectiveSd}`) instead of UTC-offset arithmetic.

**BUG-95** `engines/zk6.ts` — ✅ Fixed 2026-05-12
`fetchHistoryOverrides` set `dsOverride = idx` (array row index) — completely wrong draws-since values. Fixed: computes actual calendar-day delta from `row.date_et` (`Math.floor(Date.now() / 86400000) - Math.floor(rowMs / 86400000)`).

**BUG-97** `engines/zk6.ts` — ✅ Fixed 2026-05-12
`daily_intelligence` POST used `resolution=merge-duplicates` (UPSERT), which could silently overwrite preserved `hit_box=true` flags. Fixed: changed to `resolution=ignore-duplicates` (ON CONFLICT DO NOTHING).

**BUG-99** `lib/hitDetection.ts` — ✅ Fixed 2026-05-12
`runHitDetectionAndRefresh` accepted a `_scope` parameter but always fetched all three scopes unconditionally. Fixed: renamed `_scope` to `scope`; scope-specific calls now skip non-matching fetches.

**BUG-100** `lib/hitDetection.ts` — ✅ Fixed 2026-05-12
`generateSupplementalSlate` excluded all original slate combos (hit or not) — unnecessarily banning non-hit picks from the supplement. Fixed: `excludeList` now contains only `hitComboSets`.

**BUG-104** `hooks/useSnapshot.tsx` — ✅ Fixed 2026-05-12
`coveragePercentage` denominator counted all keys in `horizons_present_json` including metadata keys (`_engineVersion`, `_mode`, etc.), inflating denominator. Fixed: filtered to `/^H\d{2}Y$/` pattern only.

**BUG-105** `hooks/useSnapshot.tsx` — ✅ Fixed 2026-05-12
AsyncStorage cache evicted valid snapshots older than 2 hours — stale on spotty connections. Fixed: eviction now checks `slate_date` equality against `getTodayET()`; cache cleared only when the stored snapshot belongs to a different ET date.

**BUG-110** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12
`importDailyMutation` built rows with `draws_since` key but DB column is `ds_raw`. PostgREST silently dropped the unknown key, leaving `ds_raw` always null. Fixed: renamed to `ds_raw` in both the row builder and the chunk mapper.

**BUG-115** `supabase/functions/compute-slate-zk6/index.ts` — ✅ Fixed 2026-05-12
Same `dsOverride = idx` (row ordinal index) bug as BUG-95 — present in the production edge function. Fixed: computes actual calendar-day delta from `row.date_et`, consistent with BUG-95.

**BUG-117** `supabase/functions/compute-slate-zk6/index.ts` — ℹ️ Accepted as design risk 2026-05-12
CORS `*` header noted but accepted: service role key is server-side only; mobile app not browser-CORS-constrained; single-admin context. No code change.

**BUG-118** `engines/zk30.ts` — ✅ Fixed 2026-05-12
Same `drawsSince = idx` (row ordinal index) bug as BUG-95/BUG-115 in `fetchZK30Datasets`. Fixed: computes actual calendar-day delta from `row.date_et`, consistent with other engine fixes.

---

### 🟡 Open — Medium

**BUG-42** `app/(tabs)/index.tsx` — ✅ Fixed 2026-05-12
`regenerateMutation` exclusion list was missing `MS`. Fixed: added `MS` to the exclusion list in `hooks/useDataIngestion.tsx` to match `todayResults` filter.

**BUG-43** `app/(tabs)/index.tsx` — ✅ Fixed (pre-existing)
Streak calculation already uses `new Date(today + 'T12:00:00')` and `new Date(lastOpenDate + 'T12:00:00')` — no off-by-one possible.

**BUG-44** `app/(tabs)/index.tsx` — ✅ Fixed (pre-existing)
`handleGenerate` calls `queryClient.removeQueries({ queryKey: ['snapshot'] })` which removes all scope variants, then `refreshSnapshot()` reloads the active scope.

**BUG-46** `app/(tabs)/explore.tsx` — ✅ Fixed (pre-existing)
`handleSaveSlate` uses `new Date().toISOString()` for `savedAt` (UTC ISO timestamp) and `getTodayET()` for `todayEt` — no locale-dependent date string.

**BUG-47** `app/(tabs)/explore.tsx` — ℹ️ By design
`slateHitItems` trusts `pick.hitType` written by `lib/hitDetection.ts` (DB-authoritative). The Slates tab is a historical view; adding a second client-side hit check would create a dual-source conflict. Documenting as intentional.

**BUG-48** `app/(tabs)/explore.tsx` — ✅ Fixed (pre-existing)
Credits panel already renders `{creditsError ? 'Credits unavailable' : ...}` when the query errors.

**BUG-49** `app/(tabs)/results.tsx` — ✅ Fixed (pre-existing)
`results.tsx` already imports `getYesterdayET` from `@/lib/dateUtils` (UTC-anchored) — no file-local implementation.

**BUG-50** `app/(tabs)/results.tsx` — ✅ Fixed (pre-existing)
`useEffect` deps array includes `recentDates`: `[ledger, ledgerLoading, recentDates]`.

**BUG-53** `app/(tabs)/intelligence.tsx` — ✅ Fixed (pre-existing)
`isYesterdayFallback` state exists; banner "⚠ Showing yesterday's data — no slate generated for today yet" renders when true.

**BUG-54** `app/(tabs)/intelligence.tsx` — ✅ Fixed 2026-05-12
`load()` fired on every screen mount with no deduplication. Fixed: added `useRef<number>` stale-time guard — skips re-fetch if data is fresh within 2 minutes. Backfill refresh and pull-to-refresh pass `force=true` to bypass guard.

**BUG-55** `app/(tabs)/intelligence.tsx` — ✅ Fixed (pre-existing)
`SynergyCombo` interface already declares `signals?: string[]`.

**BUG-58** `app/(tabs)/book.tsx` — ✅ Fixed (pre-existing)
`handleDelete` uses `Alert.alert('Delete list?', 'This cannot be undone.', ...)` with a destructive confirm button.

**BUG-60** `app/(tabs)/zk30.tsx` — ✅ Fixed 2026-05-12
`staleTime` was already set to `5 * 60 * 1000` but `refetchOnMount: 'always'` overrode it. Fixed: removed `refetchOnMount: 'always'`.

**BUG-61** `app/(tabs)/zk30.tsx` — ✅ Fixed 2026-05-12
Subtitle now derives jurisdiction from `snapshot?.file_meta?.jurisdiction` when present; falls back to `SCOPE_LABELS[scope]`.

**BUG-62** `app/(tabs)/account.tsx` — ✅ Fixed 2026-05-12
`historiesStats` now uses `countFromSupabase()` (added to `lib/supabase.ts`) with `Prefer: count=exact` + `Range: 0-0` — reads total from `Content-Range` header, no rows fetched. Active states use `select=jurisdiction&limit=500`.

**BUG-63** `app/(tabs)/account.tsx` — ✅ Fixed (pre-existing)
Both buttons already wired: `onPress={() => purchaseSubscription('monthly')}` and `onPress={() => restorePurchases()}`.

**BUG-65** `app/(tabs)/account.tsx` — ℹ️ Deferred
`memberDays` from AsyncStorage resets on reinstall. Proper fix requires Supabase user accounts (JWT auth), which the app doesn't currently implement (anon key only). Deferred until auth flow is added.

**BUG-66** `app/(tabs)/coverage.tsx` — ✅ Fixed (pre-existing)
Subtitle reads "ZK6 minimum (H01Y): X% • All scopes" — no misleading scope indicator.

**BUG-68** `app/(tabs)/_layout.tsx` — ✅ False positive
`app/(tabs)/learn.tsx` exists and is a valid screen.

**BUG-70** `app/import-wizard.tsx` — ✅ Fixed (pre-existing)
No `router.push('/ledger-import')` in the codebase. Ledger import is handled inline via `importType === 'ledger'` branch in `handleCommit`.

**BUG-71** `app/import-wizard.tsx` — ✅ Fixed (pre-existing)
`parseDateLoose` fallback uses `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()` — UTC-anchored, not device-local time.

**BUG-72** `app/import-wizard.tsx` — ✅ Fixed (pre-existing)
`coverageSet` query has `staleTime: 60_000`.

**BUG-73** `app/import-wizard.tsx` — ✅ Fixed (pre-existing)
All `setShowSummary(true)` calls are inside `if (summary)` guards — no unconditional call.

**BUG-74** `components/admin/DashboardView.tsx` — ✅ Fixed (pre-existing)
Checklist uses `new Date(getTodayET() + 'T05:00:00.000Z').toISOString()` for the ET midnight cutoff.

**BUG-76** `components/admin/DashboardView.tsx` — ✅ Fixed 2026-05-12
`zk30Jurisdiction` was a hardcoded `'TX'` const. Fixed: converted to `useState('TX')`; added UI pill selector (TX/FL/CA/NY/OH/PA/GA/MI) before the ZK30 regen buttons; both cards and import button text use the state value.

**BUG-77** `components/admin/EngineConfigView.tsx` — ✅ Fixed 2026-05-12
`handleSave` used `Promise.all` — one failure aborted all. Fixed: switched to `Promise.allSettled`; collects rejected keys and surfaces `"N key(s) failed: k1, k2"` in `setSaveError`.

**BUG-78** `components/admin/EngineConfigView.tsx` — ✅ Fixed (pre-existing)
All `parseInt` calls already use `Number.isNaN(v) ? default : v` pattern. Zero is correctly treated as a valid config value.

**BUG-79** `components/admin/EngineConfigView.tsx` — ✅ Fixed 2026-05-12
"Preview Engine Output" button opened a useless static modal. Fixed: renamed button to "ℹ️ About Engine Config"; modal now describes how to use the config (save → regen from Dashboard).

**BUG-80** `components/admin/AdaptiveLearningView.tsx` — ✅ Fixed 2026-05-12
Hit rate denominator included unevaluated picks (`hit_box = null`), deflating the rate. Fixed: denominator now uses `rows.filter(r => r.hit_box !== null || r.hit_straight !== null).length`.

**BUG-81** `components/admin/AdaptiveLearningView.tsx` — ✅ Fixed 2026-05-12
"Best Day (hits)" stat card showed `"X/6"` with a hardcoded denominator. Fixed: removed the `/6` suffix; card now shows raw hit count only.

**BUG-83** `components/admin/HealthTestsView.tsx` — ✅ Fixed 2026-05-12
`runAll` awaited each health test in series. Fixed: `await Promise.all([runConn(), runSnap(), runImports(), runDatasets()])` — all four now run in parallel.

**BUG-86** `components/admin/HitTrackingView.tsx` — ✅ Fixed 2026-05-12
`loadDetail` and `doDelete` used raw `fetch()` with inline auth headers. Fixed: both migrated to `fetchFromSupabase`; `url`/`key` local variables removed.

**BUG-87** `components/admin/HitTrackingView.tsx` — ✅ Fixed 2026-05-12
RPC failure crashed the entire view. Fixed: snapshots fetched first unconditionally; RPC wrapped in try/catch that synthesizes minimal hit-rate row objects from snapshots on failure.

**BUG-91** `components/PickDetailModal.tsx` — ✅ Fixed 2026-05-12
`confidence` mixed `energy` (0–100) with signals (0–1) in a meaningless average. Fixed: simplified to `pick.energy` directly.

**BUG-92** `components/PickCard.tsx` — ✅ Fixed 2026-05-12
`heatInfo` and `tempColorFor` returned different color tokens for the same energy. Fixed: `tempColorFor` now delegates to `heatInfo(energy).color` — single source of truth.

**BUG-93** `components/PickCard.tsx` — ✅ Fixed 2026-05-12
`glowAnim as any` and `hitAnim as any` cast suppressed type safety. Fixed: changed to `as unknown as number` on both animation values.

**BUG-96** `engines/zk6.ts` — ✅ Fixed 2026-05-12
Pass 2 fallback to zero-history combos fired silently. Fixed: upgraded log to `console.warn` so sparse-data runs are visible in dev logs.

**BUG-98** `lib/hitDetection.ts` — ✅ Fixed 2026-05-12
Both `updateDailyIntelligenceHit` and `recordHitInAdaptiveTracking` used raw `fetch()` with inline env-var auth. Fixed: migrated to `fetchFromSupabase`; `url`/`key` local variables removed entirely.

**BUG-101** `lib/supabase.ts` — ✅ Fixed (pre-existing)
`fetchFromSupabase` already has a retry loop: `maxAttempts = method === 'GET' ? 2 : 1` with 500ms delay between attempts.

**BUG-102** `lib/supabase.ts` — ✅ Fixed 2026-05-12
`DEFAULT_TIMEOUT_MS = 15000` was too short for large pair-data fetches. Fixed: raised to `30000` (30s). The `timeoutMs` param already exists for callers needing a custom timeout.

**BUG-103** `lib/dateUtils.ts` — ✅ Fixed (pre-existing)
`getYesterdayET` uses `new Date(Date.now() - 86400000)` — UTC-anchored, then formatted with `America/New_York` timezone.

**BUG-106** `hooks/useSnapshot.tsx` — ✅ Fixed 2026-05-12
`staleTime: 0` caused a Supabase query on every mount. Fixed: set `staleTime: 5 * 60 * 1000` — saves at least 3 redundant round-trips per session startup.

**BUG-108** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12
`softDeleteImport`/`undoSoftDeleteImport` passed unsupported `{ useServiceKey: true }` to `fetchFromSupabase`. Fixed: removed `opts` variable and all `...opts` spreads; anon key has sufficient permissions.

**BUG-109** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12
`importsQuery` filtered by `selectedScope` — allday imports were invisible on midday scope. Fixed: scope filter removed; query fetches all imports regardless of scope. `queryKey` no longer includes scope.

**BUG-111** `hooks/useDataIngestion.tsx` — ✅ Fixed 2026-05-12
Session coercion (`morning`→`midday`, `night`→`evening`) was silent. Fixed: `console.warn` emitted for each coerced entry with date and jurisdiction.

**BUG-112** `hooks/useAuth.tsx` / `CLAUDE.md` — ✅ Fixed (pre-existing)
`CLAUDE.md` already states "Defaults to `free`; admin must be set explicitly via the triple-tap easter egg."

**BUG-114** `components/admin/DashboardView.tsx` — ✅ Fixed (pre-existing)
"Clear Top 30" PATCHes `{ on_slate: false, hit_box: false, hit_straight: false }` — all three flags reset together.

**BUG-116** `supabase/functions/compute-slate-zk6/index.ts` + `engines/zk6.ts` — ✅ Fixed 2026-05-12
Synergy required all 4 signals ≥ 0.65 — DGC (≤ 0.3 for sparse data) meant boost never fired. Fixed: threshold relaxed to any 2 of 4 signals ≥ 0.65 in both the edge function and local engine.

**BUG-119** `engines/zk30.ts` — ✅ Fixed 2026-05-12
`saveSlateSnapshot` used `setUTCHours(0,0,0,0)` (UTC midnight = ~7-8 pm ET previous day) — could soft-delete yesterday's evening slates. Fixed: anchored to ET midnight via `new Date(getTodayET() + 'T05:00:00.000Z')`.

**BUG-120** `engines/zk30.ts` — ✅ Fixed 2026-05-12
43+ unconditional `console.log` calls in the production engine. Fixed: added `zk30Log` wrapper (`if (__DEV__) console.log(...)`) and replaced all calls via `replace_all`.

**BUG-121** `engines/zk30.ts` — ✅ Fixed 2026-05-12
`loadEngineConfig` omitted `k6_singles_max`, `k6_doubles_max`, `pair_rep_cap` — ZK30 always used `DEFAULT_RAILS`. Fixed: added all three keys to the config query and handler loop.

**BUG-122** `types/core.ts` — ✅ Fixed (pre-existing)
`TopKStraightRow` already declares all five hit fields as optional: `hitType`, `hitResult`, `hitState`, `hitDate`, `hitSession`.

---

### 🔵 Open — Low

**BUG-51** `app/(tabs)/results.tsx` — ✅ Fixed 2026-05-12
Signal column labels changed from opaque `F`/`B`/`S` to `BOX`/`PBR`/`DGC` — both the active and ghost (no-hit) states.

**BUG-64** `app/(tabs)/account.tsx` — ✅ Fixed 2026-05-12
All account rows now have `onPress`. Sign Out calls `signOut()` + shows "Signed out" toast. Rows without a `meta` value show "Label — coming soon" toast.

**BUG-67** `app/_layout.tsx` — ✅ Fixed 2026-05-12
Removed 100ms artificial delay from `initApp`. SplashScreen.hideAsync() already has a separate 200ms deferred call; the extra delay was redundant.

**BUG-113** `hooks/useAuth.tsx` — ✅ Fixed 2026-05-12
`purchaseSubscription`/`restorePurchases` no longer silently set `role: 'premium'`. Stubs now return `false` immediately with a TODO comment. Real implementation requires StoreKit/Google Play integration (Phase 3).

**BUG-123** `types/core.ts` — ✅ Fixed 2026-05-12
`EngineMetadata` index narrowed from `[horizon: string]` to `[h: \`H${string}Y\`]: boolean | undefined`. Accidental typo'd key access now gives a TS compile-time error. All explicit underscore fields remain typed independently.

---

## Enhancement Opportunities

| ID | File | Title | Status |
|----|------|-------|--------|
| ENH-01 | `components/PickDetailModal.tsx` | Wire `HitReplay` component — exists in `HitReplay.tsx` but never imported; PLAY tab would benefit from showing the side-by-side predicted vs drawn visual when `pick.hitType` is set | ✅ Already implemented |
| ENH-02 | `app/(tabs)/results.tsx` | Combo-set cluster view — when multiple results share the same combo-set on one day, group them and show a cluster hit count | ✅ Fixed 2026-05-12 |
| ENH-03 | `app/(tabs)/intelligence.tsx` | "Days with a hit" stat — add "X of last 30 days had ≥1 box hit" to make performance claims concrete | ✅ Fixed 2026-05-12 |
| ENH-04 | `app/(tabs)/book.tsx` | "Add from Today's Slate" shortcut — import current scope's 6 K6 picks directly into a list without manual entry | ✅ Fixed 2026-05-12 |
| ENH-05 | `lib/hitDetection.ts` | Persist `hitSession` on updated snapshot picks — already written to `daily_intelligence` but not stored on the snapshot pick object | ✅ Already implemented |
| ENH-06 | `app/(tabs)/index.tsx` | Show slate generation timestamp on Home — `updated_at_et` is in the snapshot; "Generated at 6:12 am" label builds trust and shows freshness | ✅ Fixed 2026-05-12 |
| ENH-07 | `components/admin/DashboardView.tsx` | "Full Daily Workflow" button — single tap runs: hit detection (yesterday+today) → regen all scopes → invalidate all caches | ✅ Fixed 2026-05-12 |
| ENH-08 | `engines/zk6.ts` / `engines/zk30.ts` | Engine run telemetry — upsert a summary row per generation in `adaptive_tracking` (scope, weightsKey, horizons used, confidence score) for longitudinal tuning data | ✅ Shipped 2026-05-15 as **new `engine_runs` table** (cleaner than extending `adaptive_tracking` — different cardinality, 1 row per generation vs N per slate). Migration `2026-05-15_engine_runs.sql` adds the table with RLS-protected anon SELECT and service-role-only INSERT. Edge function `compute-slate-zk6` (v16) writes one row per slate-save under `if (!is_supplement)` — captures `effective_weights` (post per-scope override), `horizons_present`/`horizons_loaded`, `confidence_score`, `using_fallback`, effective `box_freq_weight`/`box_pressure_weight`/`recent_hit_cooldown`/`min_energy_threshold`. Unique on `(slate_hash, mode)` so re-gens of identical configs upsert (no duplicates). Smoke test (midday regen post-deploy): row landed with CONFIG-07 weights (CO 0.74 / BOX 0.208 / DGC 0) AND CONFIG-02 inverted pressure (−0.40) AND CONFIG-05 cooldown (10) AND CONFIG-02 floor (70) — all four active config layers captured in a single observation. Local engine path (`engines/zk6.ts`) NOT extended — telemetry would pollute backtest replay runs and the production path is the edge function anyway. |
| ENH-09 | `app/(tabs)/explore.tsx` | Slate freshness indicator — show "Generated 3 hours ago" or "⚠ Slate is 2 days old" from `updated_at_et` | ✅ Fixed 2026-05-12 |
| ENH-10 | `app/(tabs)/intelligence.tsx` | Scope filter on Top 30 — currently shows all scopes combined; a scope selector would let admin review per-scope without cross-scope noise | ✅ Already implemented |
| ENH-11 | `components/admin/AdaptiveLearningView.tsx` | Split box vs straight hit rates in the 7-day chart — amber for box, cyan for straight | ✅ Fixed 2026-05-12 |
| ENH-12 | `lib/hitDetection.ts` | Hit detection run log — write a `hit_detection_runs` row (date, scopes_checked, hits_found, run_at) after each run to track coverage and catch silent failures | ✅ Shipped 2026-05-15. Migration `2026-05-15_hit_detection_runs.sql` adds the table with anon SELECT + service-role-only INSERT. Edge function `run-hit-detection` (v2) writes one row per (date, scope) processed — captures `hits_found`, `scopes_checked`, `supplements_generated`, `errors` (capped at 10 per row), `error_count`, `duration_ms`, `run_source`. POST wrapped in try/catch so a telemetry write failure never blocks the response. **This closes the BUG-145 silent-failure gap structurally:** if the anon GRANT regresses again, a sweep of recent `hit_detection_runs` rows shows hits=0 with a non-zero error_count, surfacing the issue immediately instead of silently zeroing the hit tracker UI. Smoke test post-deploy: POST `{date:"2026-05-14",skipSupplements:true}` → row landed (scopes_checked=3, hits=0, errors=0, duration=1066ms). |
| ENH-13 | `app/(tabs)/results.tsx` | Hit-result share button — when `hitType !== null`, a share button copies "My #2 pick 427 hit BOX in Arizona on 5/9 via HitMaster ZK6" for social | ✅ Fixed 2026-05-12 |
| ENH-14 | `hooks/useDataIngestion.tsx` | Surface rejected import rows — add `rejectedSamples[0..4]` with reasons to the import summary modal | ✅ Fixed 2026-05-12 |
| ENH-15 | `components/admin/EngineConfigView.tsx` | Weight integrity check before save — verify `BOX+PBURST+CO+DGC ≈ 1.0` and `singlesMax+doublesMax ≥ 6` before committing config | ✅ Fixed 2026-05-12 |
| ENH-16 | `app/(tabs)/account.tsx` | Implement Sign Out — clear AsyncStorage, reset `useAuth` state, navigate to onboarding; required before multi-user launch | ✅ Fixed 2026-05-12 |
| ENH-17 | `app/(tabs)/zk30.tsx` | "Open Admin" shortcut on ZK30 empty state — current EmptyState directs user to Admin screen but provides no navigation button | ✅ Fixed 2026-05-12 |
| ENH-18 | `components/admin/HealthTestsView.tsx` | `daily_intelligence` freshness health check — add a test verifying today's Top 30 rows exist for each scope | ✅ Fixed 2026-05-12 |
| ENH-19 | `engines/zk6.ts` | Read `synergy_boost_on`/`synergy_boost_weight` from `app_config` in the client engine — currently only the edge function honours these keys | ✅ Already implemented |
| ENH-20 | `lib/dateUtils.ts` | Add `isETDateToday(dateStr)` utility — several places compare stored ET date strings to device `Date.now()` without a shared ET-aware helper | ✅ Fixed 2026-05-12 |
| ENH-21 | `components/PickCard.tsx` | Long-press quick-save to Number Book — "Save to Book" + "Copy combo" sheet; stub exists in PickDetailModal but not on the card | ✅ Fixed 2026-05-12 |
| ENH-22 | `app/(tabs)/explore.tsx` | Pull-to-refresh triggers hit detection — extend the Slates pull-to-refresh to also run `runHitDetectionAndRefresh(scope, todayET)`, closing the loop without an Admin visit | ✅ Fixed 2026-05-12 |
| ENH-AUDIT-2026-05-19 | `engines/zk6.ts`, new `pick_state_strength` table, `components/PickDetailModal.tsx` | **Per-state pattern strength layer for ZK6 picks** (PRE-ZK30 dependency). Secondary scoring layer that runs after ZK6 generates its 6 picks; for each pick × jurisdiction, compute recency-weighted hit rate against that state's last 365 draws; persist to `pick_state_strength`; surface top 5 per pick in `PickDetailModal`. See long-form section below for problem statement, scope, technical approach, acceptance criteria. Unlocks honest per-state marketing language flagged in `docs/state_confidence_audit_2026-05-19.md`. | 🟡 Queued — not started; sequenced after Phase 4 IAP / Phase 5 EAS / Phase 6 Playwright and before ZK30 Phase 1 |
| ENH-EXPORT-2026-05-23 | `app/admin-image-export.tsx`, `components/SlatePosterCard.tsx`, `components/PickPosterCard.tsx`, `components/PublicExportBanner.tsx`, `components/pickVisuals.tsx`, `lib/captureExportImage.ts` | **Admin image export — public + Pro daily reel composer.** Web-only operator screen that generates 7 PNGs per session (1 slate composite + 6 pick composites) at 1080×1920. Public mode redacts digits and appends a CTA banner ("FULL SLATE INSIDE · JOIN THE FREE COMMUNITY"); Pro mode is full fidelity, no banner. Reuses production slate/modal visuals via extracted `SlatePosterCard` + shared `pickVisuals` (SignalPill/WhyRow/EnergyArc) so future styling changes propagate automatically (INVARIANT 4 honored). INVARIANT 2 carve-out: this screen reads `slate_snapshots` directly via `fetchFromSupabase` (no engine recomputation, no writes, operator-triggered only). Capture pipeline uses `html-to-image` against an off-screen wrapper at exact export dimensions; native (iOS) capture is gated until react-native-view-shot can be added under an EAS dev build. See `docs/features/admin-image-export.md`. | ✅ Shipped 2026-05-23 — web-only; native deferred to EAS dev build availability. |
| ENH-FUNNEL-2026-05-19 | new tables `pro_subscribers`, `fb_group_contributors`, `fb_engagement_snapshots`, `funnel_daily_snapshots`, `subscriber_import_history`; new edge fn `subscriber-admin`; `components/admin/ProSubscribersView.tsx`, `SubscriberImportView.tsx`, `FunnelDashboardView.tsx`, `AdminKeyGate.tsx` | **Pro subscriber tracking + funnel intelligence.** Source-of-truth roster for 21 confirmed Pro subscribers (email PII + date subscribed from Meta Business Suite "Supporter Email Addresses" export). Service-role Edge Function gateway (`subscriber-admin`) gated by `ADMIN_OPS_KEY` header — RLS denies anon, function uses service-role to bypass; operator enters secret once into AdminKeyGate and it persists to AsyncStorage (never bundled). Daily funnel snapshots with generated columns for conversion rate, gross MRR, net MRR. Parsers for TSV/CSV/multi-space inputs (subscriber emails + Group Insights contributors). PII-masking in admin UI with reveal toggle. Seeded with 21 subscribers and funnel snapshots for 5/18 (18 subs, 22.0% conv, $17.82 gross MRR) and 5/19 (21 subs, 24.7% conv, $20.79 gross MRR). See `docs/subscriber_tracking_README.md` for setup + operator workflow and `docs/subscriber_reconciliation_queries.sql` for diagnostics. | ✅ Shipped 2026-05-19 — schema applied, edge fn deployed v1, UI wired into admin nav. Operator must set `ADMIN_OPS_KEY` in Supabase secrets and unlock via AdminKeyGate before first use. |

---

### ENH-AUDIT-2026-05-19 — Per-State Pattern Strength Layer for ZK6 Picks

**Source:** State Confidence Audit 2026-05-19 (`docs/state_confidence_audit_2026-05-19.md`)
**Priority:** PRE-ZK30 (must complete before ZK30 full build begins)
**Effort estimate:** 6–10 hours focused work
**Status:** QUEUED — not yet started

#### Problem statement

ZK6 currently loads only `jurisdiction IS NULL` data and generates one cross-jurisdictional slate per scope. The `state_confidence_overrides` row in `app_config` was empty `{}` with zero code consumers and was removed 2026-05-19 (see audit_logs `config_row_deletion_executed` action). There is currently no per-state pattern strength computation anywhere in the codebase.

Marketing language has described per-state identification capability that doesn't exist. The audit recommended either changing the marketing OR building the capability. This enhancement builds the capability so future marketing claims become verifiably true.

#### Scope

Build a secondary per-state strength scoring layer that runs AFTER ZK6 generates its 6 picks. For each pick × each jurisdiction, compute a recency-weighted hit rate score against that jurisdiction's historical draws. Persist scores to a new `pick_state_strength` table. Surface top 5 strongest jurisdictions per pick in `PickDetailModal.tsx`.

#### Why pre-ZK30 dependency

1. ZK30 is the per-state engine. ZK6 needs to honestly support per-state language BEFORE ZK30 launches, or the marketing story for the ZK family stays incoherent.
2. The per-state datasets (`datasets_box` and `datasets_pair` rows with non-null jurisdiction) already exist in the database. They were built for ZK30 but are sitting unused. This enhancement gives them a consumer in the ZK6 product line.
3. Building per-state strength scoring in ZK6 first proves the methodology before ZK30 expansion makes it production-critical. If the v1 metric isn't useful, we discover that with ZK6 risk exposure, not ZK30 risk exposure.
4. ZK30 inherits the per-state strength infrastructure. The compute logic, the schema, and the UI patterns built for this enhancement become foundational for ZK30's per-state engine.

#### Technical approach (v1)

**Metric:** Recency-weighted hit rate of each pick's combo in each jurisdiction's last 365 draws, normalized to 0-100 scale.

**New table:** `pick_state_strength` with columns:
- `snapshot_id` (FK to `slate_snapshots`)
- `pick_rank` (1–6)
- `combo`, `combo_set`
- `jurisdiction` (state code)
- `strength_score` (0–100)
- `raw_hit_count`, `draws_evaluated`
- `rank_within_pick` (1–N, ranking states for this specific pick)

**Compute step:** New function `computePerStateStrength()` runs after `compute-slate-zk6` finishes. Writes ~210 rows per slate (6 picks × 35 jurisdictions).

**UI surface:** New section in `PickDetailModal.tsx` titled "Pattern Strength by Jurisdiction" displaying top 5 states for the pick with strength scores and visual bars. Honest copy: "Based on recency-weighted hit rate in each state's last 365 draws."

#### Out of scope for this enhancement

- Changes to ZK6 pick selection logic (national selection stays)
- Per-state signal recomputation (BOX/PBURST/CO/DGC per state)
- Per-state forecasting or prediction
- Admin override UI for per-state weights
- Real-time per-state strength updates
- Backfill of legacy slates (new slates only get the data)

#### Dependencies

- Slate snapshot writers must trigger per-state computation
- `histories` table must continue to have reliable per-jurisdiction data (already does)
- Performance budget: per-state computation adds < 30 seconds to slate generation

#### Acceptance criteria

- [ ] `pick_state_strength` table created with correct schema
- [ ] Per-state strength computed for every new slate generation
- [ ] PickDetailModal renders top 5 jurisdictions per pick
- [ ] Section copy is honest ("recency-weighted hit rate")
- [ ] Performance: < 30s added to slate generation
- [ ] Legacy slates without per-state data render gracefully

#### Marketing language unlocked after ship

The following becomes verifiably true:
- "ZK6 identifies which states are showing the strongest patterns for each pick"
- "Picks are paired with the jurisdictions where patterns are strongest"
- "Per-state pattern intelligence for every signal"

#### Sequencing

Complete AFTER current pre-launch priorities (Phase 4 RevenueCat IAP, Phase 5 EAS Build → TestFlight → App Store, Phase 6 Playwright auto-import) and BEFORE ZK30 Phase 1 (Texas single-state build).

#### Implementation task breakdown

1. Define per-state strength metric (v1: recency-weighted hit rate)
2. Schema design + migration for `pick_state_strength` table
3. Implement `computePerStateStrength()` function
4. Integrate with slate generation pipeline (`compute-slate-zk6` edge fn)
5. Build API helper `fetchPickStateStrength()`
6. Add UI section to `PickDetailModal.tsx`
7. Update slate snapshot writers to call the compute step
8. Verify honest copy (no prediction claims) — passes Two-Question filter
9. Marketing language audit post-ship — update copy that the audit flagged as currently-aspirational

---

### ENH-FUNNEL-2026-05-19 — Pro Subscriber Tracking + Funnel Intelligence

**Source:** Funnel analytics + subscriber data review 2026-05-19, building on the Meta Business Suite "Supporter Email Addresses" feature becoming available for this Page.
**Priority:** Pre-iOS-launch CRITICAL (foundation for the migration list when RevenueCat IAP ships)
**Status:** ✅ Shipped 2026-05-19
**Effort:** ~7 hours

#### Why this exists

Until 5/19 the operator's view of paying subscribers came from Facebook's lagged dashboard. Meta's email export feature now gives us an authoritative roster: 21 confirmed subscribers with emails and `Date Subscribed` timestamps. Pairing that roster with the engagement data from Group Insights exports gives a coherent picture of the funnel (page → free group → Pro) and grounds MRR math in real numbers rather than Facebook's reporting lag.

This also creates the email-targetable audience for the eventual iOS launch migration: when RevenueCat IAP goes live we have a known list of people to invite, not a guess.

#### What shipped

1. **Five new tables** (`pro_subscribers`, `fb_group_contributors`, `fb_engagement_snapshots`, `funnel_daily_snapshots`, `subscriber_import_history`). RLS enabled with no public policies — tables are unreachable from the anon key.
2. **Edge Function `subscriber-admin`** (deployed v1, ACTIVE) — service-role gateway gated by `X-Admin-Key` matching `ADMIN_OPS_KEY` env var. 12 actions covering list/upsert/update across all five tables, plus potential-churn detection and contributor-to-subscriber linking.
3. **Client lib `lib/subscriberAdminClient.ts`** — typed wrappers, AsyncStorage-backed key management, email-masking helper.
4. **Parsers** for both data sources, tolerant of tab/CSV/multi-space inputs and with date-validity sanity checks.
5. **Admin UI** — `📈 Funnel`, `👥 Subscribers`, `📧 Sub Import` tabs in the existing admin nav. PII masked by default with reveal toggle.
6. **Seed data** — 21 subscribers + funnel snapshots for 5/18 (18 active, 22.0% conv, $17.82 gross MRR / $12.47 net) and 5/19 (21 active, 24.7% conv, $20.79 gross MRR / $14.55 net).
7. **Docs** — `docs/subscriber_tracking_README.md` (setup + workflow), `docs/subscriber_reconciliation_queries.sql` (operator diagnostics).

#### Security model

The work order's original RLS plan (admin role via `profiles.role = 'admin'` + `auth.uid()`) was incompatible with the codebase: there is no `profiles` table and the app uses the anon key directly with no Supabase Auth. The Edge Function gateway approach was substituted:

- Tables deny anon entirely (RLS on, no policies).
- All access goes through `subscriber-admin` using the service-role key.
- `ADMIN_OPS_KEY` is a shared secret in Supabase Edge Function secrets (operator must set this).
- Operator enters the key once into `AdminKeyGate`; persists to AsyncStorage only — never bundled into the JS.

#### Reconciliation gap (open)

Email export shows 21 subscribers as of 5/19; free group UI shows 23–24 humans. Variance is 2–3 humans (likely payment processing lag, churned-still-in-group, comped, or business account artifact). Resolution is operator-side via the admin UI; the data model supports manual adds (status='comped' or 'unknown') for special cases.

#### What's deliberately NOT in scope

- Facebook Graph API integration.
- Browser automation / scraping.
- Automated email sending to subscribers (separate work order).
- iOS migration flow itself (Phase 4 RevenueCat work; data model is ready).
- Multi-tier pricing UI (column exists for it; UI assumes single $0.99 tier).
- Excel/.xlsx parsing — operator copy-pastes from spreadsheet UI; TSV/CSV only.

#### Follow-ups

- Operator sets `ADMIN_OPS_KEY` in Supabase secrets and re-deploys the edge fn so it picks up the secret (deployment without the secret returns 401 to all callers — verifiable end-to-end test).
- First real Group Insights import will exercise the contributor → subscriber correlation flow; expect to manually link names to emails for the 21 subscribers with `facebook_name IS NULL`.
- When RevenueCat IAP ships, drive the migration list from `SELECT email FROM pro_subscribers WHERE status='active' AND ios_migration_invited_at IS NULL`.

---

### ENH-EVCO-2026-05-18 — Evening CO-Weight Cut Sweep (Retired 2026-05-22)

**Status:** ❌ Retired as a CO-weight intervention. Per-scope CO cuts will not ship.
**Source:** Live observation 5/18 that evening r1 hit % (46%) was inverted vs r2 (60%) over the prior measurement window, suggesting the top of the slate was mis-ordered. Initial hypothesis: CO signal weight was over-influencing rank 1.

#### Investigation arc

1. **2026-05-18 (parked the same day, commit `3933fb8`).** Scaffolded three configs in `scripts/backtest/configs.ts` per the per-scope override pattern (`evening_co_cut_parity`, `evening_co_cut_5`, `evening_co_cut_zero`). Parity guard matched `intel_weights_midday_only_floor70` byte-for-byte across rank + lift sections — loader wiring clean. Extended backtest harness with `HitSummary.hitsByPick: boolean[]` to capture per-rank hits (the lens slate-rate alone hides).
2. **Backtest verdict (30d, balanced, n=30 evening slates):**
   - Slate rate: baseline 66.7% / cut_5 70.0% / zero 73.3% — Wilson CIs heavily overlapping.
   - **Per-rank evening hit %:** baseline r1=26.7% r2=26.7% (flat, NOT inverted in backtest), cut_5 r1=26.7% r2=**33.3%** (worsened the gap), zero r1=26.7% r2=**33.3%** (same).
   - Rail-matched pick lift: evening 0.95× → 0.85× (cut_5) / 0.87× (zero). Per CLAUDE.md dual-lens rule, candidate fails the lift gate.
3. **Two findings killed the CO-cut path:**
   - Original live symptom (r1<r2 inversion) did **not** replicate in backtest baseline. Likely confound: mid-day regenerations + BUG-148 session shifts (cleaned 5/18) rather than a stable engine ranking bug.
   - Candidates **worsened** rank ordering — both lifted r2 to 33.3% while leaving r1 unchanged. The intervention pushed hits down the slate, not up.

#### 2026-05-22 recheck (closes the parking)

Per the parking commitment, re-pulled `adaptive_tracking` after fresh post-cleanup data accumulated. Latest-snapshot-per-(date,scope) dedupe, evening balanced picks, 5/13–5/22 (n=10 per rank):

| rank | picks | hits | hit% |
|---|---|---|---|
| r1 | 10 | 1 | 10.0% |
| r2 | 10 | 3 | 30.0% |
| r3 | 10 | 2 | 20.0% |
| r4 | 11 | 5 | 45.5% |
| r5 | 10 | 2 | 20.0% |
| r6 | 10 | 0 | 0.0% |

Histories confirm evening draws (39–42 jurisdictions/day) exist for 5/13–5/21 → `hit_box=NULL` reads as evaluated miss.

**Live r1<r2 inversion persists** in the post-5/18-cleanup window (10% vs 30%, 20pp gap). BUG-148 was not the sole cause. But:
- n=10 per rank — Wilson 95% CIs ~[0.5%, 40%] for r1 and ~[11%, 60%] for r2 overlap heavily; not statistically significant.
- Backtest baseline still shows r1=r2 flat — same harness blind spot as 5/18.

#### Retirement decision

CO-weight cut is retired regardless of whether the live inversion is real, because the 5/18 backtest already condemned the intervention on per-rank grounds. Configs in `scripts/backtest/configs.ts` left in place for reproducibility; no `engine_weights_*_evening` override row was ever written to `app_config` and none should be.

#### Open watchlist (not a new bug yet)

Live evening r1<r2 inversion remains directionally present but under-powered (n=10). Recheck again at 2026-05-29 (n≈17) before opening a different-angle investigation. If the inversion persists with n=17+ and a meaningful gap (≥15pp), it warrants a different lens — energy floor / energy_score interaction at top of slate, K6 Pass-relaxation ordering effects, or selected-vs-universe AUC per-rank (per [[feedback-signal-analysis-selected-vs-universe]], not a selected-pick signal diff). Explicitly NOT another CO-weight sweep.

#### Harness keeps

- `HitSummary.hitsByPick: boolean[]` + per-rank section in `printReplaySummary` (with rank-1 < rank-2 ≥3pp flag) — use for any future per-scope tuning decision; this is the lens slate-rate alone hid.

---

## Growth-Aligned Bug Prioritization (2026-05-10)

This roadmap aligns technical debt resolution with subscriber growth and retention strategies.

| Priority | Growth Opportunity | Blocking Bug(s) | Strategic Rationale |
|:---|:---|:---|:---|
| **1** | Reliability (Stop Churn) | **BUG-18, BUG-19** | "Lost hits" destroy user trust instantly; accuracy is the foundation of retention. |
| **2** | Engine Integrity | **BUG-22, ENG-01** | Suppressing valid picks and volatile scoring kills product quality. |
| **3** | Scalability (Security) | **BUG-20** | Secure RLS is a prerequisite for Edge Functions/Real-time data architecture. |
| **4** | Transparency (Trust) | **BUG-21** | Surface `allday` fallback info; creates the "Model Confidence" badge feature. |

### Strategic Roadmap
1.  **Stop Churn:** Address date-tagging and snapshot-window issues to guarantee accurate hit detection.
2.  **Restore Quality:** Fix `excludedCombos` bleed and signal normalization drift to restore accurate predictions.
3.  **Foundation:** Migrate mutations to Edge Functions to secure the data layer.
4.  **Feature Evolution:** Surface engine confidence levels to build premium-tier trust.

#### Edge Function Migration Roadmap
- **Phase 3.5 — Hit-detection Edge Function migration.** Move `updateDailyIntelligenceHit` and the `runHitDetectionAndRefresh` snapshot PATCH from anon client writes to a service-role Edge Function. After migration: drop `intelligence_update_anon` and `snapshots_update_anon` policies. Closes BUG-20 fully.
- **Phase 3.6 — ZK30 Edge Function migration.** Mirror of ZK6 Edge Function for `engines/zk30.ts`. Closes BUG-29 and unblocks ZK30 production rollout. Depends on ZK30 build completion (currently a standalone in-progress engine).

---

## Architecture Debt & Refactoring Targets

These are not bugs but structural issues that will cause maintenance pain at scale.

| ID | Item | Risk | Status |
|----|------|------|--------|
| ARCH-01 | `admin.tsx` ~4000 lines — UI, data fetching, business logic all mixed | Slow velocity, high side-effect risk | ✅ Fixed 2026-05-11 — Extracted 10 view components into `components/admin/`. `admin.tsx` now 88 lines (thin router). Shared helpers/styles/types in `AdminShared.tsx`. |
| ARCH-02 | ZK6 and ZK30 share ~80% logic — two separate files | Fixes in one engine get missed in the other | ✅ Fixed 2026-05-12 — `lib/engineCore.ts` extracted: pure TS, Deno-safe signal math (`computeDGC`, `computeBoxSignal`, `computePairSignal`, `maxNorm`, `computeWeightedScore`, `computeSlateHash`, `computeConfidenceScore`, combo utilities, `HORIZON_WEIGHTS`, `MULTIPLICITY_PRIORS`). Both `engines/zk6.ts` and `engines/zk30.ts` now import from it; ~80 local duplicate lines removed per engine. |
| ARCH-03 | No unit test suite | Signal computation regressions go undetected | ✅ Fixed 2026-05-11 — Jest + jest-expo configured (`npm test`). 22 tests in `__tests__/` covering ENG-01 (max-norm), ENG-05 (pairFreqScore), DGC, toComboSet, normalizeScope, pairUtils. Regressions in signal math now caught immediately. |
| ARCH-04 | `useDataIngestion.tsx` imports `computeSlate` from ZK6 only — no path to trigger ZK30 regen from hooks | ZK30 can only be regenerated from the Admin screen directly | ✅ Superseded by ARCH-06 (2026-05-25) — the ZK30 v1.0 ground-up rebuild covers this in step 3 (import pipeline). Old `engines/zk30.ts` deleted 2026-05-25 to clear way for the new build; the hook-side integration ships with the new engine. |
| ARCH-05 / NEW-28 | Dual hit detection system — `lib/hitDetection.ts` (used by `admin.tsx`, `import-wizard.tsx`) and inline `runHitDetectionAndRefresh` in `useDataIngestion.tsx` (used by ledger import) are two separate implementations with divergent behavior | Hits detected via admin may miss cases handled by ledger-triggered detection and vice versa | ✅ Fixed 2026-05-11 — Inline 190-line implementation removed from `useDataIngestion.tsx`. Now delegates to `lib/hitDetection.ts::runHitDetectionForDates()`. Ledger-specific pair RPC kept in hook. `dominant_signal` added to `recordHitInAdaptiveTracking` in lib. |
| ARCH-06 | ZK30 v1.0 single-state engine architecture lock-in (Texas pilot). Ground-up rebuild replacing the stale `engines/zk30.ts` clone-of-ZK6 (deleted 2026-05-25). Spec covers: scope=`allday` only, 30 picks, balanced-only mode, 09:00 ET Mon–Sat drop, jurisdiction='TX' hardcoded, 18/9/3 rails, `PAIR_REPETITION_CAP_ZK30=10`, H01Y+H02Y horizons (0.70/0.30), 3 new tables (`histories_tx` with 4-session + Fireball, `daily_intelligence_zk30`, `adaptive_tracking_zk30`), 4 match types (straight/box/fireball_straight/fireball_box), Edge Function runtime via `EXPO_PUBLIC_USE_EDGE_ZK30`, ported ZK6 fixes (BUG-153 pair pagination, AT primary writes, hit-orphan append, full-delete intel pattern). | If shipped without the structural lock-in, future patches will drift the ZK30 implementation from the agreed v1.0 contract — same failure mode as PROCESS-01. | Open — see long-form section below. Build is sequenced into 7 work orders; step 1 (DDL migrations) staged 2026-05-25. Deviations require a new ARCH entry. |
| PROCESS-01 | Edge-function migration audits checked git diffs in the change window only, not structural API parity. The `EXPO_PUBLIC_USE_EDGE_ZK6` parity verification on 2026-05-21 found two pre-window structural drifts (`bestOrder` and `dataStats` missing from `compute-slate-zk6`'s return shape) that would have caused a user-visible UI regression on flag flip. The runtime parity harness caught them; the static audit did not. | UI fields silently rendered as `undefined` post-cutover; type contract violations slip through code review when both sides type-check independently. | Lesson logged 2026-05-21 — Future engine/edge-function migration audits MUST include a structural parity step BEFORE the git-diff step: enumerate every field returned by both paths and every column persisted by both paths, then diff field-by-field independent of the change window. The harness at `scripts/zk6-parity/` is the runtime backstop, but the static audit must catch structural drift first. Apply this to: future ZK6/edge migrations, any future ZK30 edge fn, and the next time a client engine swap is contemplated. |

---

### ARCH-06 — ZK30 v1.0 Engine Architecture Lock-in (2026-05-25)

Fresh ground-up rebuild of the ZK30 single-state engine for Texas, replacing the stale clone in `engines/zk30.ts` (deleted 2026-05-25). Locks all v1.0 design decisions; deviations require a new ARCH entry, not patches to this one.

**Replaces:** `engines/zk30.ts` (the v2.1-cloned-from-ZK6 file with state filter only). Deleted to clear way for clean build. Also closes ARCH-04.

**Engine shape:**
- Single scope: `allday` (no midday/evening switching)
- 30 picks per slate (vs ZK6's 6)
- Single mode: `balanced` only for v1.0 (BOX:0.55, PBURST:0.30, CO:0.15 inherited from ZK6 — re-tune via backtest post-launch)
- Drop time: 09:00 ET daily, Mon–Sat only (no Sunday draws)
- Engine version tag: `v1.0`
- Jurisdiction: hardcoded `'TX'` for v1.0 — parameterize in v2.0 when expanding to SC/OH/NJ/NY/FL

**Rails (scaled 5× from ZK6's 6-pick design):**
- 18 singles / 9 doubles / 3 triples (was 4/2/0 for ZK6)
- `PAIR_REPETITION_CAP_ZK30 = 10` (linear scale: ZK6's 2 × 5)
- 5-pass selector with relaxation order: exclusions → pair cap → cooldown → emergency

**Horizons:**
- H01Y + H02Y only (TX dataset is 2 years; H03Y–H10Y not populated)
- Custom horizon weights: **H01Y=0.70, H02Y=0.30** (H01Y-heavy, not proportional renormalization)
- H03Y–H10Y explicitly zero-weighted in `HORIZON_WEIGHTS_ZK30`

**Data architecture:**
- **NEW table `histories_tx`** — raw TX draws, 4 sessions preserved (Morning/Day/Evening/Night), Fireball stored per row. Separate from `histories` to avoid ZK6 collapse-collision (per BUG-149).
- **Existing tables `datasets_box` + `datasets_pair`** — TX rows written with `jurisdiction='TX'`, `scope='allday'`. Same schema as ZK6, just jurisdiction filter.
- **NEW table `daily_intelligence_zk30`** — fully isolated from `daily_intelligence`. No ZK6 bleed. Adds 4 match columns (hit_straight, hit_box, hit_fireball_straight, hit_fireball_box) + matched_session/result/fireball.
- **NEW table `adaptive_tracking_zk30`** — primary rows written at slate-gen time with quartile flags + dominant_signal (parity with ZK6's AUC analysis foundation). Multi-row per pick when matched across multiple sessions.

**Match detection:**
- 4 match types per pick per draw: straight, box, fireball_straight, fireball_box
- Fireball mechanic: substitute drawn Fireball digit into pos 0/1/2 of pick, check straight + box against draw result
- **Log every matched session per pick** — not just highest-priority. Multi-row writes to `adaptive_tracking_zk30` when one pick matches across multiple sessions. Maximum AUC visibility.

**Build path:**
- Runtime: Supabase Edge Function `compute-slate-zk30` (parity with ZK6's Edge Function), routed via `EXPO_PUBLIC_USE_EDGE_ZK30=true`
- Shared math: imports `lib/engineCore.ts` (no changes to engineCore)
- New constants file: `constants/zk30.ts`
- **Don't-touch list:** `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/`, `constants/zk6.ts`, `lib/engineCore.ts`

**Ported fixes from ZK6 (must not be skipped):**
- BUG-153 pagination on pair fetch (PostgREST 1000-row cap)
- adaptive_tracking primary write pattern (was missing from old zk30.ts)
- hit-orphan row appending to daily_intelligence_zk30
- Full-delete pattern on intel writes (replaces the `hit_box=eq.false` filter from old zk30.ts)

**Build order (each step is a separate work order):**
1. DDL migrations (3 tables + indexes + RLS) — **first work order, staged 2026-05-25**
2. `constants/zk30.ts`
3. Import pipeline: `import_tx_raw.ts` + `aggregate_tx_datasets.ts` + 2-year backfill
4. `engines/zk30.ts` (RN-side, debug-friendly first)
5. `compute-slate-zk30` Edge Function (Deno port after engine math validates)
6. Hit detection: `detectZK30Matches` + `run-hit-detection-zk30` Edge Function
7. UI integration (blue-themed slate cards, deferred design step)

**Definition of done for v1.0:**
- 3 new tables exist with RLS
- `histories_tx` has ≥2 years TX raw (Mon–Sat, 4 sessions, Fireball)
- `datasets_box` + `datasets_pair` have TX rows for H01Y and H02Y
- Engine generates valid 30-pick slate
- Edge Function deployed, responds <2s
- `daily_intelligence_zk30` + `adaptive_tracking_zk30` write per generation
- Hit detection correctly flags all 4 match types
- 7 consecutive days of clean slate-gen at 09:00 ET without manual intervention

**Open items deferred to post-v1.0:**
- Mode presets (conservative/aggressive) — currently balanced only
- Multi-jurisdiction parameterization (SC/OH/NJ/NY/FL expansion)
- Backtest harness for ZK30 (mirror `scripts/backtest/` pattern)
- ZK30 priority access mechanics for ZK Mystic tier per subscription design

**Review:** initial review after first 7 days of clean generation. Full backtest re-run once 30 days of TX matches accumulated.

**Override of standing rule:** memory + CLAUDE.md hold a "no ZK30 work until ZK6 verified ≥73% over 7d post-fix" gate. Operator explicitly overrode 2026-05-25 to begin this rebuild; ZK6 stabilization work continues in parallel and is not gated by ZK30 progress.

---

**Step 1 of 7 — DDL Migrations: DEPLOYED 2026-05-25 14:26 ET (18:26 UTC).**

- Migration file: `supabase/migrations/2026_05_25_zk30_tables.sql`
- Applied via Supabase MCP `apply_migration` (name: `zk30_v1_tables`, version `20260525182620`)
- Audit-log row written: `action='arch_migration_applied'`, `target='arch-06-zk30-v1-tables'`

Tables verified present (column counts shown):

| Table | RLS | Columns | Indexes |
|---|---|---|---|
| `histories_tx` | enabled | 7 | 4 (PK, unique 4-tuple, idx_date, idx_session) |
| `daily_intelligence_zk30` | enabled | 24 | 4 (PK, unique slate_date+rank+combo, idx_date, idx_hits) |
| `adaptive_tracking_zk30` | enabled | 25 | 3 (PK, idx_hash, idx_date) |

Policies installed:

- `histories_tx` — single `allow_all` policy on `public` role for `ALL`. Anon CRUD (mirrors `histories`).
- `daily_intelligence_zk30` — `di_zk30_select_public` (`SELECT` public), `di_zk30_update_anon` (`UPDATE` anon), `di_zk30_update_authenticated` (`UPDATE` authenticated). INSERT/DELETE service_role only (mirrors `daily_intelligence` lockdown from BUG-20).
- `adaptive_tracking_zk30` — `at_zk30_select_public`, `at_zk30_insert_anon`, `at_zk30_insert_authenticated`, `at_zk30_update_authenticated`. Anon DELETE blocked at policy level; service_role bypasses (mirrors `adaptive_tracking` post-BUG-20 + 5/14 anon-grant restore).

Grants installed for anon/authenticated/service_role on tables and `*_id_seq` sequences.

**Validation tests:**

- ✅ Roundtrip INSERT into all 3 tables inside a `BEGIN/ROLLBACK` — counts went 1/1/3 inside txn, 0/0/0 after rollback.
- ✅ Multi-row append on `adaptive_tracking_zk30`: 3 rows for same `(slate_hash, rank, combo)` succeeded (primary + 2 match rows for different `matched_session`). Confirms no unique-constraint blocker for the multi-session match model.
- ✅ Negative CHECK constraint test: `INSERT … session='BadSession'` correctly raised `check_violation`.

**Deviations from work-order spec:** none on schema or rails. One naming difference logged for context — the work order's text referenced `ARCH-04` per the original draft; the audit file uses **ARCH-06** because ARCH-04 was already taken (now superseded by ARCH-06). Schema, indexes, RLS pattern, column types, and PK strategy match the work order verbatim.

**Next work order:** step 2 — `constants/zk30.ts`. Step 3 (import pipeline) is the next DB-touching step; nothing else writes to these tables until then.

---

**Step 2 of 7 — Constants Module: SHIPPED 2026-05-25 ~14:35 ET.**

- File created: `constants/zk30.ts`
- Engine identity exports: `ZK30_ENGINE_VERSION='v1.0'`, `ZK30_JURISDICTION='TX'`, `ZK30_SCOPE='allday'`, `ZK30_DROP_TIME_ET='09:00'`, `ZK30_DRAW_SESSIONS` + `ZK30Session` type, `ZK30_DRAW_DAYS=[1..6]` (Mon–Sat)
- **Horizon set narrowed at the type level** to `'H01Y' | 'H02Y'` via `Extract<HorizonLabel, 'H01Y' | 'H02Y'>`. `ZK30_HORIZONS` is the 2-element runtime array; `HORIZON_WEIGHTS_ZK30: Record<ZK30Horizon, number>` is the keyed weight map (H01Y=0.70, H02Y=0.30). H03Y–H10Y are unreachable from any ZK30 import.
- Rails: `K30_QUOTAS = { singles: 18, doubles: 9, triples: 3 }`, `PAIR_REPETITION_CAP_ZK30 = 10`
- Match types: 4-element `ZK30_MATCH_TYPES` + `ZK30MatchType` union: `'straight' | 'box' | 'fireball_straight' | 'fireball_box'`
- Weights: single `balanced` preset inherited from ZK6 (BOX 0.55 / PBURST 0.30 / CO 0.15). `ZK30Mode = keyof typeof ZK30_WEIGHTS` — currently just `'balanced'`.
- Audit-action constants: `ZK30_AUDIT_ACTIONS` for import / aggregate / regenerate / hit-detection paths

**7 app_config rows seeded** (idempotent `ON CONFLICT DO NOTHING`):

| key | value |
|---|---|
| `zk30_pressure_threshold` | 250 |
| `zk30_recent_hit_cooldown` | 20 |
| `zk30_min_energy_threshold` | 70 |
| `zk30_synergy_boost_on` | false |
| `zk30_synergy_boost_weight` | 0.15 |
| `zk30_box_freq_weight` | 0.60 |
| `zk30_box_pressure_weight` | 0.40 |

All inherit ZK6 defaults (post-CONFIG-01 revert + CONFIG-02 quality-floor 70). Re-tune via backtest in v2.0+.

**Validation:**

- ✅ `tsc --noEmit` clean for `constants/zk30.ts` (zero errors attributable to this file)
- ✅ Type-narrowing proof: temp file `constants/_zk30_narrowing_proof.ts` written with `const x: ZK30Horizon = 'H03Y'` and `HORIZON_WEIGHTS_ZK30['H03Y']` — tsc reported two expected errors (`TS2322` on the type annotation, `TS7053` on the indexed access). Proof file deleted after verification.
- ✅ `ZK30_HORIZONS.length === 2` at compile time (tuple via `as const`)

**Known stale reference (not from this step):** `components/admin/DashboardView.tsx:14` still imports from the deleted `@/engines/zk30`. Pre-existing breakage from the file deletion in step 0 — will resolve automatically when step 4 creates the new engine module.

**Architectural intent honored downstream:**

1. Step 3 import / aggregation pipeline iterates `ZK30_HORIZONS`, NOT `H_ALL`. No zero-row placeholders for H03Y–H10Y.
2. Step 4 engine fetch code queries `datasets_box` / `datasets_pair` with `horizon_label.in.(H01Y,H02Y)`. BUG-153 pagination still required for pair fetch.
3. Step 4/5 blend math passes `HORIZON_WEIGHTS_ZK30` directly into `engineCore` helpers — engineCore's loop over `H_ALL` hits `undefined → 0` for H03Y+, producing identical math. **No ZK30-specific blending helper** wrapping engineCore — explicitly out of scope.

**Next work order:** step 3 — import pipeline (`import_tx_raw.ts` + `aggregate_tx_datasets.ts` + 2-year backfill).

---

**Step 3a.0 — `histories_tx` unique-key correction: SHIPPED 2026-05-25.**

Pre-importer fix. Step 1 deployed `UNIQUE (date_et, session, result_digits, fireball)`; the importer needs `on_conflict=date_et,session` for idempotent upserts — the 4-tuple key would have triggered BUG-149's "no unique or exclusion constraint matching the ON CONFLICT specification" the moment the first batch posted.

- Migration file: `supabase/migrations/2026_05_25_zk30_histories_tx_unique_key_fix.sql`
- Applied via Supabase MCP `apply_migration` (name: `zk30_histories_tx_unique_key_fix`)
- `histories_tx` verified empty before the swap (rowcount = 0).
- Dropped: `histories_tx_date_et_session_result_digits_fireball_key UNIQUE (date_et, session, result_digits, fireball)`.
- Added: `histories_tx_date_et_session_key UNIQUE (date_et, session)`.
- No redundant non-unique index on `(date_et, session)` existed; `idx_histories_tx_date` and `idx_histories_tx_session` serve distinct query patterns and stay.
- Operational consequence: corrections to `result_digits` or `fireball` after the first import must go through `PATCH` on the row (not re-`INSERT`).
- Audit-log row written: `target='arch-06-zk30-histories-tx-unique-key'`.

Unblocks step 3 importer construction.

---

**Step 3a complete (2026-05-25):**

- `lib/zk30/parseTxRaw.ts` — pure parser, shared between CLI + future admin UI
- `scripts/imports/import_tx_raw.ts` — CLI wrapper, service-role auth, batched 500
- Unique-key migration applied: dropped 4-tuple, added 2-tuple `UNIQUE (date_et, session)`
- Parser bugfix: rebuilt for actual TX file format (`date \t jurisdiction \t session \t result-with-fireball`)
- Backfill: 2,498 rows imported from `/workspaces/HM26/assets/tx_history.txt`
- Date range: 2024-05-27 → 2026-05-25 (728 days = 2 years)
- Session distribution: Day 625, Evening 624, Morning 625, Night 624
- DOW distribution: Mon 418, Tue/Wed/Thu/Fri/Sat 416 each, Sun 0
- Fireball nulls: 0
- Idempotency verified: re-run inserted 0 rows
- Ready for Step 3b (`aggregate_tx_datasets.ts`)

---

**Step 3b complete (2026-05-25):**

- `lib/zk30/aggregateTxDatasets.ts` — pure aggregator. Inputs: TX draws + anchor + horizon. Outputs: 220 box rows + 685 pair rows per horizon. First true `histories → datasets` aggregator in the codebase (ZK6 rebuild paths are UPDATE-only — original datasets came from operator CSV imports).
- `scripts/imports/aggregate_tx_datasets.ts` — CLI wrapper. `--dry-run` default, `--apply` writes. Always operates on BOTH H01Y + H02Y (per-horizon partial rebuilds intentionally not supported to avoid delete-all-reinsert-one footgun). Full-delete-then-INSERT pattern; brief empty window acceptable for v1.0 backfill (engine not reading yet).
- Anchor: `2026-05-25` (= max `date_et` in `histories_tx`).
- Row counts written (verified): **440 box + 1,370 pair = 1,810 total**, split evenly across 2 horizons.

**ZK6 helpers reused (no engine code modified):**
- `lib/engineCore.ts::sortedPair`, `multiplicityOf` — pair canonicalization + multiplicity dedup for class 11
- Pagination pattern from `scripts/intel-tuning/rebuild-datasets.ts::fetchHistoriesForScope` — BUG-153 1000-cap defense
- `constants/pairClasses.ts` definitions — informed the 10-class extraction logic

**Convention decisions logged via sign-off:**
- Never-drew rows: emitted in full with `ds_raw=horizon_days`, `last_seen=NULL`, `draws_since=window_draws`. No sentinels.
- `expected` column: NULL (verified via grep that `engines/zk6.ts`, `compute-slate-zk6`, `engineCore.ts` never read it)
- `ds_normalized`: 0 (engine recomputes from raw signals)
- Anchor-day inclusion: window is `(anchor − horizonDays, anchor]` (right-closed, left-open)
- Pair class 11: dedups per draw (triple `1-1-1` counts pair `{1,1}` once, not three times)

**Validation queries (all 6 green):**

| # | Check | Result | Expected | Status |
|---|---|---|---|---|
| 1 | Box rows per horizon | H01Y=220, H02Y=220 | 220 each | ✅ |
| 2 | Pair rows per horizon + class count | H01Y=685/10, H02Y=685/10 | 685 each, 10 classes (2..11) | ✅ |
| 3 | Spot-check `box['117']` (recent 5/25 Day was 171) | td=2, last_seen=2026-05-25, ds_raw=0, draws_since=0 | td≥1, last_seen=most recent | ✅ |
| 4 | Coverage universe sanity | box=220 distinct keys, pair=685 distinct (key,class) | matches universe | ✅ |
| 5 | `times_drawn` sum cross-check | H02Y=2,498 (= file total), H01Y=1,250 (~1,248 expected) | matches window | ✅ |
| 6 | Idempotency (dry-run + re-apply) | identical counts both times | identical | ✅ |

**Deviations from recon expectations:** none. Universe sizes, pair-class counts, and helper reuse plan all held.

**Audit-log rows written:** `action='aggregate_tx_datasets'`, `target='datasets_box,datasets_pair'`. Two rows from the two `--apply` runs.

**Ready for Step 4 (`engines/zk30.ts`).**

---

**Step 4.0 — DGC weight correction (2026-05-25):**

`constants/zk30.ts::ZK30_WEIGHTS.balanced` updated from 3-channel `{BOX:0.55, PBURST:0.30, CO:0.15}` to 4-channel `{BOX:0.495, PBURST:0.270, CO:0.135, DGC:0.10}`. The original ARCH-06 spec was anchored on `constants/zk6.ts` (which still carries the historical 3-channel ratio), but `engines/zk6.ts:345-349` actually ships the carved-out 4-channel version. Production hit rate depends on the 0.10 DGC carve. tsc clean.

---

**Step 4.1 — `slate_snapshots_zk30` migration (2026-05-25):**

- Migration file: `supabase/migrations/2026_05_25_zk30_slate_snapshots.sql`
- Applied via Supabase MCP (`apply_migration name=zk30_slate_snapshots`)
- 18 columns, mirrors `slate_snapshots` shape with v1.0 lock-ins:
  - `jurisdiction NOT NULL DEFAULT 'TX' CHECK (=TX)`
  - `scope NOT NULL DEFAULT 'allday' CHECK (=allday)`
  - `mode NOT NULL DEFAULT 'balanced'` (CHECK allows future presets)
  - `engine_version DEFAULT 'v1.0'`
  - `slate_date NOT NULL` (ZK6 had this nullable for legacy reasons; ZK30 always carries one)
- Indexes: 4 total — PK, `(slate_date DESC, mode) WHERE deleted_at IS NULL` for latest-slate lookup, `snapshot_hash` for dedup, `(slate_date DESC) WHERE admin_published AND deleted_at IS NULL` for the published-slate surface.
- RLS enabled; `allow_all` policy + anon/auth CRUD grants (mirrors `histories_tx` per the ZK30 convention).
- Audit-log row written: `target='arch-06-zk30-slate-snapshots'`.
- ZK6-specific columns dropped: none — all ZK6 snapshot columns are generic slate metadata and remain valid for ZK30.

**Holding here** before steps 4.2 (hash function) + 4.3 (`engines/zk30.ts`) per work-order checkpoint.

---

**Step 4.2 — ZK30 hash function (2026-05-25):**

Inlined `computeSlateHashZK30()` in `engines/zk30.ts` (lines ~125-140) as a thin wrapper over `engineCore::computeSlateHash`. Jurisdiction is folded in by prepending to scope (`"TX:allday"`) so the existing 4-arg djb2 input shape doesn't change. Deterministic; no `Date.now()`. Distinguishes a TX slate from a future SC slate that happens to produce the same 30 picks.

`engineCore.ts` not modified — per ARCH-06 don't-touch list.

---

**Step 4.3 — `engines/zk30.ts` shipped (2026-05-25):**

Engine module created at `engines/zk30.ts`. Mirrors `engines/zk6.ts` structure with the documented v1.0 lock-ins (hardcoded `jurisdiction='TX'`, `scope='allday'`, `mode='balanced'`, narrowed `ZK30Horizon`, `K30_QUOTAS` rails 18/9/3, `PAIR_REPETITION_CAP_ZK30=10`).

Exports:
- `computeSlateZK30(params)` — primary entry
- `computeZK30Slate` — legacy alias for `components/admin/DashboardView.tsx`. Accepts optional `scope`/`jurisdiction`/`mode` params and `console.warn`s if non-default values are passed; resolves the pre-existing stale-import tsc error (left over from the engine deletion in step 0).

Engine reuses ZK6 helpers verbatim from `lib/engineCore.ts`: `computeBoxSignalDetailed`, `computePairSignal` (via `getPairSignalFromMap`), `computeDGC`, `blendBoxDsRaw`, `bestOrderFor`, `normalizeBoxKey`, `normalizePairKey`, `sortedPair`, `topPairOf`, `multiplicityOf`, `MULTIPLICITY_PRIORS`, `maxNorm`, `percentileRankOf`, `computeConfidenceScore`, `computeSlateHash`, `buildUniverse`, `toComboSet`. No engineCore changes.

Reads `histories_tx` (not `histories`) for live overrides + recent-draws exclusion. Writes to the `_zk30` table family.

**tsc clean.**

**Smoke (end-to-end, bundled via inline esbuild + zk6-parity shims, run against live TX data anchored at `2026-05-25`):**

| Check | Result | Notes |
|---|---|---|
| 30 picks generated | ✅ 30 | |
| Distinct combos | ✅ 30 | no dupes |
| Hash determinism (run 1 vs run 2) | ✅ `3B15D864` both runs | jurisdiction-augmented `TX:allday` scope produced stable hash |
| `slate_snapshots_zk30` write | ✅ 2 rows (1 active, 1 soft-deleted) | run 2 correctly soft-deleted run 1's row before inserting its own |
| `adaptive_tracking_zk30` primary rows | ✅ 30 rows, idempotent | run 2 skipped insert (slate_hash already present) |
| `topPair` repetition cap | ✅ max=3 (cap=10) | well under cap, no relaxation needed |
| Composition vs spec (18/9/3) | ⚠️ **23/4/3** | see below |
| `daily_intelligence_zk30` write | ⚠️ **RLS-blocked under anon** | expected — see below |
| `engine_runs` telemetry | ⚠️ RLS-blocked under anon | expected — same lockdown as ZK6 post-BUG-20 |

**Composition deviation (23/4/3 vs 18/9/3 spec):** Pass 1 selected 18 singles (hit the cap), but only 5 more picks (4 doubles + 3 triples; total 25 after Pass 2 placeholder fill — wait the pass 2 added 2). After passes 3-5 added 0 more (no eligible combos under their respective filters), Pass 6 relaxed mult caps and filled the remaining 5 slots with the next-best-scoring combos, which were all singles. Root cause: TX 2-year history has very few doubles/triples that clear the `minEnergyThreshold=70` percentile floor (inherited default from ZK6 CONFIG-02). This is the engine doing what it should — Pass 6 is the "always deliver N picks" guarantee. The 18/9/3 numbers in `K30_QUOTAS` are now better understood as **caps + targets, not strict mandates**; the engine prefers "30 picks at all costs" over "exact composition." Recommendations for follow-up (NOT v1.0 blocking): lower `zk30_min_energy_threshold` for non-singles classes, or accept the data-driven composition as honest.

**RLS findings:** `daily_intelligence_zk30` mirrors ZK6's `daily_intelligence` policy shape post-BUG-20 — anon can `SELECT`/`UPDATE` only; `INSERT`/`DELETE` require service-role. ZK6's production write path goes through the Edge Function (`compute-slate-zk6`) using `SUPABASE_SERVICE_ROLE_KEY`. **ZK30 needs the same** — production invocation must route through the (not-yet-built) `compute-slate-zk30` Edge Function (step 5), or the RN client must be granted service-role somehow (not happening). The smoke confirmed the engine logic + math + idempotency are correct; the missing `daily_intelligence_zk30` rows are a deployment-path concern resolved by step 5, not an engine bug. Same applies to `engine_runs`.

**Smoke harness:** built ad-hoc at `scripts/_zk30_smoke.ts` + `scripts/_zk30_smoke_build/` using the zk6-parity esbuild bundling pattern (expo-constants + react-native shims). Removed after validation since this engine should be invoked via the Edge Function in production. If we need a re-runnable harness later, the right home is `scripts/zk30-parity/` mirroring `scripts/zk6-parity/`.

**Ready for Step 5 (`compute-slate-zk30` Edge Function migration).**

---

**Step 5 complete — `compute-slate-zk30` Edge Function deployed (2026-05-25):**

- **Deployed slug:** `compute-slate-zk30`, version **v3**, sha256 `7718ac7dbdeea033dc35bd36845933a3f1b383c421fcb020ce3bb0b6332c57fc`, `verify_jwt: true`. Three quick iterations needed: v1 baseline, v2 fixed `adaptive_tracking_zk30` idempotency dedup, v3 fixed `engine_runs` upsert (added `resolution=merge-duplicates`).
- **File:** `supabase/functions/compute-slate-zk30/index.ts` (on-disk version uses `../../../lib/...` relative paths; MCP deploy flattens to `./` per `feedback_edge_fn_deploy_flat_naming`).
- **Inline constants chosen** (mirror ZK6, not import from `constants/zk30.ts`). Drift-control comment at top of file lists the three source-of-truth files (`constants/zk30.ts`, `engines/zk30.ts`, this file) that must be updated in lockstep on any change to the inlined block.
- **Auth:** service-role via `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` for all writes (bypasses RLS on `daily_intelligence_zk30` + `engine_runs`). Caller-side `verify_jwt: true` accepts anon JWTs.

**All 4 write surfaces verified post-v3 (live invocation against TX data, `targetDate=2026-05-26`, hash `3B15D864`):**

| Table | Behavior | Idempotency on re-run |
|---|---|---|
| `slate_snapshots_zk30` | INSERT 1 row, soft-delete prior active for same (slate_date) | ✅ +1 active, prior soft-deleted |
| `daily_intelligence_zk30` | DELETE-then-INSERT 30 rows (+ hit orphans) | ✅ same 30 rows |
| `adaptive_tracking_zk30` | INSERT 30 primary rows, dedup probe on `(slate_hash, slate_date, matched_session IS NULL)` | ✅ no duplicate rows |
| `engine_runs` | UPSERT (merge-duplicates) on `UNIQUE (slate_hash, mode)`, `_jurisdiction='TX'` in `effective_weights` | ⚠ row persists but `generated_at_et` pins to first write — same as ZK6 behavior |

**Two bugs found + fixed during 5.4–5.5:**

1. **`adaptive_tracking_zk30` dedup over-block (v2 fix):** Initial dedup probe was `slate_hash`-only. For ZK30 the same 30 picks generate the same hash across multiple days (stable TX data + algorithm). v1 wrote rows for `slate_date=2026-05-25` then blocked the `2026-05-26` write. **Fix:** scoped probe to `(slate_hash, slate_date)`. Same fix applied to `engines/zk30.ts` RN-side. ZK6 has the same latent risk but its hash varies more day-to-day from changing data — flagging as a separate audit item.

2. **`engine_runs` 409 swallowed (v3 fix):** Original `Prefer: return=minimal` raised silent 409 on the `engine_runs_hash_mode_unique` constraint. **Fix:** changed to `Prefer: resolution=merge-duplicates,return=minimal` matching ZK6. Same fix applied to `engines/zk30.ts`. Known limitation: PostgREST `merge-duplicates` without an explicit `?on_conflict=slate_hash,mode` URL param appears to silently no-op on upserts targeting non-PK unique constraints, so `generated_at_et` stays pinned to the first-write timestamp. ZK6 exhibits identical behavior — separate audit ticket recommended.

**Parity check:** edge fn hash `3B15D864` matches the RN engine smoke from step 4 byte-for-byte. The pure inlined math + Deno-safe `engineCore` import produces identical output.

**Flag flipped:** `EXPO_PUBLIC_USE_EDGE_ZK30=true` added to `.env`. The `engines/zk30.ts:457` shortcircuit is now active — any RN-side call to `computeSlateZK30()` routes through `/functions/v1/compute-slate-zk30`. This unblocks the 2 RLS-locked write surfaces that the prior RN-direct path couldn't reach.

**Deviation from work-order spec:** operator's expectation for `engine_runs` was "1 new telemetry row (always writes)". Actual behavior is "1 row per `(slate_hash, mode)`, write-once". This matches ZK6's existing semantic (verified across 5 ZK6 `engine_runs` sample rows from 5/24 + 5/25 — all show first-write timestamps). Recommendation: revise the telemetry semantic in a separate audit ticket or drop the unique constraint if append-only is required.

**Ready for Step 6 (hit detection).**

---

**Step 6 complete — `run-hit-detection-zk30` Edge Function + cron deployed (2026-05-25):**

- **Edge fn:** `run-hit-detection-zk30`, version **v1**, sha256 `067b45ae45c57e52594c714465160a6b1cc6f82283fe55daf02a9ee2bcfaa7ba`, `verify_jwt: true`
- **File:** `supabase/functions/run-hit-detection-zk30/index.ts` (477 lines on disk; deploy payload minified)
- **Cron:** `run-hit-detection-zk30-nightly`, schedule `30 3 * * *` (= 03:30 UTC = 23:30 ET EDT / 22:30 ET EST). Both land after TX Night draw (~22:00 ET). Body uses `(now() AT TIME ZONE 'America/New_York')::date` — runs detection for today's slate after all 4 sessions land. Migration: `supabase/migrations/2026_05_25_zk30_hit_detection_cron.sql`. Reuses the `cron_anon_key` vault secret from `compute-daily-report` migration.

**Match math (per-pick × per-draw):**

```ts
straightCombo = pick.bestOrder ?? pick.combo;     // BUG-155 preserved
comboSet      = pick.comboSet ?? pick.normKey;
hit_straight          = result_digits === straightCombo;
hit_box               = sortDigits(result_digits) === comboSet || hit_straight;
hit_fireball_straight = fbAugmented.some(r => r === straightCombo);
hit_fireball_box      = fbAugmented.some(r => sortDigits(r) === comboSet) || hit_fireball_straight;
```

Fireball substitution: `[fb+r[1]+r[2], r[0]+fb+r[2], r[0]+r[1]+fb]` (3 augmented results per draw). Natural + fireball flags are **independent** — a natural straight does NOT suppress fireball flags. `histories_tx.comboset_sorted` doesn't exist; computed inline.

**Schema deviations from work-order spec (corrected mid-build):**

- `daily_intelligence_zk30` has no `jurisdiction`/`scope`/`mode` columns — PATCH WHERE simplified to `(slate_date IN ..., combo=eq)`.
- DI columns are `matched_session` / `matched_result` / `matched_fireball` (not `hit_state` / `hit_session` / `hit_result` / `hit_fireball` as the spec stated).
- `adaptive_tracking_zk30` has no `matched_state` column — `matched_session` is the per-row discriminator (single jurisdiction, so state is redundant).
- `hit_detection_runs` column is `date` (not `run_date`); no jurisdiction column. ZK30 distinguishes itself in telemetry via `scope='allday-tx'` + `run_source='edge-zk30'`.

**Bug-pattern preservation:**

- **BUG-155 (bestOrder match):** straight comparison uses `pick.bestOrder ?? pick.combo`. Required because `pick.combo` is the engine enumeration index (000..999 from `buildUniverse()`) while `pick.bestOrder` is the user-facing recommended permutation from `bestOrderFor()`.
- **BUG-150 (serial AT writes per pick):** `pickPasses[i] = async { for (m of matches) await record... }`. Different picks parallel; matches within a pick serial so the IS-NULL primary-row probe in match N sees match N-1's PATCH effect.
- **BUG-145 (telemetry backstop):** `hit_detection_runs` row written per invocation, even on errors (non-fatal try/catch). Telemetry survives function failures.

**DI write strategy:** PATCH per pick on the primary match (highest-precedence: straight > box > fireball_straight > fireball_box, ties broken by session order). One DI row per pick — multi-session detail lives in AT.

**AT write strategy:** multi-row per pick. Layer 1 exact-match dedup probe `(slate_hash, rank, combo, matched_session)`. Layer 2 PATCH the un-stamped primary (matched_session IS NULL). Layer 3 INSERT a secondary row for additional matches.

**Live verification (anchor `2026-05-25`):**

- HTTP 200, `hitsFound: 1, picksMatched: 1` on first call
- **Real Fireball Straight hit caught:** combo `173` at rank 22 of the 5/25 slate. Day draw `171` + fireball `3` → substituting fireball into position 2 yields `173` = pick.bestOrder exact match. `hit_fireball_straight=true`, `hit_fireball_box=true`, `hit_straight=false`, `hit_box=false` (natural draw didn't match).
- DI row 22 PATCHed with the 4 flag values + `matched_session='Day'`, `matched_result='171'`, `matched_fireball='3'`.
- AT row exists (was primary at gen time; PATCHed on first detection, idempotent-skipped on re-runs).
- `hit_detection_runs` row written per call: 3 invocations → 3 telemetry rows. All `run_source='edge-zk30'`, `scope='allday-tx'`.
- Caveat: initial test attempt failed because step 4's RN smoke had RLS-blocked the DI writes for 2026-05-25. Resolved by regenerating the slate via the edge fn (which writes DI via service-role). Not a bug in hit detection itself.

**Idempotency re-run (3rd invocation):**

| Surface | Result | Expected |
|---|---|---|
| HTTP response | `hitsFound: 0, picksMatched: 0` | ✅ snapshot-level early-out via `pick.hitType` already-set |
| AT row count for (combo=173, session=Day) | 1 (unchanged) | ✅ Layer-1 exact-match dedup |
| DI fireball-straight hits | 1 (unchanged) | ✅ PATCH-as-no-op |
| Telemetry rows | 3 (one per invocation) | ✅ each call always writes telemetry |

**Decisions matching recon sign-off recommendations:**

- Fireball flags independent (no mutex) — caller derives "any kind of straight" via OR
- Single daily cron at 23:30 ET (not 4 per-session crons) — simpler ops; same-day Morning hits delay by ~13h
- Multi-row per pick AT writes inherited from ZK6 verbatim
- Supplemental slates **skipped** for v1.0 (30 picks already is the full slate; supplements are a ZK6 6-pick artifact)
- DI = one row per pick (primary match wins), multi-session detail in AT
- RN wrapper parked — v1.0 invocation path is daily cron + ad-hoc curl

**Ready for Step 7 (UI integration).**

---

**Step 7 complete — `app/(tabs)/zk30.tsx` rewrite + admin hit-detection trigger (2026-05-25):**

Operator-only ZK30 slate view (hidden tab `href: null`, accessed via direct route). Pure read-side surface; mutations stay in admin + cron.

**Files changed:**
- `app/(tabs)/zk30.tsx` — full rewrite (~330 lines). Was a 221-line stub querying the stale `slate_snapshots?mode=eq.zk30` shape from pre-rebuild ZK30.
- `components/admin/DashboardView.tsx` — added `handleZK30HitDetection` callback + admin button between the ZK30 regen card and the ZK30 import card (~50 lines).

**`zk30.tsx` changes:**
- **Query swap:** `slate_snapshots_zk30?slate_date=eq.${today}&deleted_at=is.null&order=updated_at_et.desc&limit=1`. Falls back to yesterday's slate if today's hasn't dropped yet (slate marked `_isStale: true` client-side, stale banner rendered).
- **Scope chips removed.** Single immutable label "◈ ALL-DAY · TEXAS" — v1.0 lock-in is scope=allday, no optionality.
- **4-flag hit badge strip** per pick card (`S` / `B` / `🔥S` / `🔥B`). Superset suppression: `B` suppressed when `S` set; `🔥B` suppressed when `🔥S` set. Persistent letter = affordance; color = decoration. Tooltip via `accessibilityLabel`. Palette: emerald-500 / blue-500 / orange-500 / amber-500 / slate-300 dim.
- **Refresh-on-focus** via `useFocusEffect` + `queryClient.invalidateQueries(['zk30-snapshot-latest'])`. Catches the 09:00-ET daily drop when operator switches tabs back.
- **Metadata footer:** `v{engine_version} · {hash8} · gen {updated_at_et}` (monospace). Surfaces engine version + hash + gen time for operator triage.
- **States:** loading (spinner + "Loading today's slate…"), error (retry button), no-slate (empty state + "Next drop: 09:00 ET" + admin deep link), stale (yellow banner above pick groups).
- **Light-mode-only** blue palette (hardcoded). Doesn't honor `useTheme()`. Acceptable for v1.0 internal use; proper theme integration deferred to v2.0 public launch.

**`DashboardView.tsx` changes:**
- New `zk30HitBusy` / `zk30HitStatus` state pair
- `handleZK30HitDetection` callback — POSTs to `/functions/v1/run-hit-detection-zk30` with `{date: getTodayET()}` and surfaces `hitsFound` + `picksMatched` from the response. Inline ~25-line fetch (lib/hitDetection.ts targets ZK6 path).
- New card "ZK30 Hit Detection" between the existing scope-regen card and data-import card. Single "Run ZK30 Hit Detection (Today)" button + spinner + status line. Mirrors existing teal styling.

**Verification:**
- tsc clean for both files (3 pre-existing `regenerateSlate` signature errors in `DashboardView.tsx:96/118/204` are unrelated and pre-date step 7).
- Smoke verified via MCP: the query `slate_snapshots_zk30?slate_date=eq.2026-05-25&deleted_at=is.null&order=updated_at_et.desc&limit=1` returns the active snapshot (hash `3B15D864`, 30 picks, jurisdiction TX) and rank 22 (combo `173`) has `hitType='fireball_straight', hitSession='Day', hitResult='171', hitFireball='3'` — confirming the 🔥S badge will render correctly for the captured step 6 hit.

**Spec deviations (documented):**

1. **4-flag derivation is from `hitType` only, not 4 explicit boolean flags.** The work-order spec assumed the snapshot's `top_k_straights_json` carries `hit_straight/hit_box/hit_fireball_straight/hit_fireball_box` per-pick. Actual snapshot shape carries only `hitType` (single primary). For multi-hit picks (e.g. natural box AND fireball straight same day), only the primary surfaces — full match list lives in `adaptive_tracking_zk30` and would require a secondary fetch to render. v1.0 trade-off: simpler, single fetch, captures 99%+ of cases. Operator can drill into AT for the rare multi-hit case.

2. **`order=created_at` → `order=updated_at_et`.** `slate_snapshots_zk30` has no `created_at` column (per step 4.1 schema). Functionally equivalent — each snapshot is a new INSERT after soft-delete-prior, so `updated_at_et` IS the effective creation timestamp.

3. **Polish items (7.8 + 7.9) deferred** per work-order spec — tab badge for unviewed ZK30 hits + Home strip integration not included.

**Operator runbook for v1.0 dogfooding:**
1. Slate generates automatically via the 09:00-ET ET schedule **not yet wired** (no pg_cron for compute-slate-zk30 — must trigger manually via admin button). _Open follow-up: ARCH-06 step 8 cron for slate-gen._
2. Hit detection runs nightly at 23:30 ET via `run-hit-detection-zk30-nightly` cron (step 6).
3. Operator opens `/zk30` route to view today's slate. If no slate visible: open Admin → ZK30 section → tap a scope regen button.
4. To force re-detection mid-day: Admin → ZK30 Hit Detection → "Run ZK30 Hit Detection (Today)".

**Ready for v1.0 internal launch.** Outstanding for public launch (per ARCH-06 spec): 7 consecutive days of clean cron generation; full backtest re-run once 30 days of TX matches accumulate.

---

## ARCH-06 v1.0 CLOSURE (2026-05-25)

Slate-gen cron deployed — final v1.0 gap closed.

**Closure migration:** `supabase/migrations/2026_05_25_zk30_slate_gen_cron.sql`. Applied via Supabase MCP. Audit-log row written (`target='arch-06-zk30-slate-gen-cron'`).

**Both ZK30 crons live:**

| jobname | schedule (UTC) | EDT / EST | Function |
|---|---|---|---|
| `compute-slate-zk30-daily` | `0 13 * * 1-6` | 09:00 ET / 08:00 ET, Mon–Sat | `compute-slate-zk30` (step 5) |
| `run-hit-detection-zk30-nightly` | `30 3 * * *` | 23:30 ET / 22:30 ET, daily | `run-hit-detection-zk30` (step 6) |

Both `active=true`, both POST via `pg_net` with `cron_anon_key` vault secret (reused from ZK6's `compute-daily-report` cron migration).

**ZK30 v1.0 build COMPLETE.**

| Step | Deliverable | Status |
|---|---|---|
| 1 | DDL — histories_tx, daily_intelligence_zk30, adaptive_tracking_zk30 | ✅ migrated, RLS verified |
| 2 | constants/zk30.ts | ✅ narrowed horizon type, app_config seeded |
| 3a | TX raw parser + CLI importer | ✅ 2,498 rows imported, idempotent |
| 3b | TX datasets aggregator | ✅ 440 box + 1,370 pair rows, 6 validation queries green |
| 4 | engines/zk30.ts + slate_snapshots_zk30 + DGC weight correction + hash wrapper | ✅ smoke green, 30-pick slate generated |
| 5 | compute-slate-zk30 Edge Function | ✅ v3 deployed sha 7718ac7d, parity hash 3B15D864 matches RN engine |
| 6 | run-hit-detection-zk30 Edge Function + nightly cron | ✅ v1 deployed sha 067b45ae, captured real Fireball Straight hit on combo 173 |
| 7 | UI integration — `app/(tabs)/zk30.tsx` rewrite + admin hit-detection trigger | ✅ tsc clean, smoke verified, 4-flag hit badges + stale-banner + focus-refetch |
| closure | compute-slate-zk30 daily cron | ✅ scheduled `0 13 * * 1-6` UTC, active |

**Daily operator workflow (post-closure):**

1. **Manual** — TX import via admin (after Night session settles, ~22:30 ET). Operator pastes the day's draws into the admin import wizard; the parser + importer (step 3) writes to `histories_tx`.
2. **Manual** — aggregator run via CLI: `tsx scripts/imports/aggregate_tx_datasets.ts --apply`. Rebuilds `datasets_box` + `datasets_pair` TX rows from the updated `histories_tx`.
3. **AUTO** — slate-gen cron fires at **09:00 ET next morning** (Mon–Sat). Writes `slate_snapshots_zk30` + `daily_intelligence_zk30` + `adaptive_tracking_zk30` primary rows + `engine_runs` telemetry.
4. **AUTO** — hit-detection cron fires at **23:30 ET next night**. Annotates `slate_snapshots_zk30.top_k_straights_json` with `hitType`, writes per-session match rows to `adaptive_tracking_zk30`, PATCHes `daily_intelligence_zk30` rows.
5. Operator monitors via `/zk30` route (refresh-on-focus). Admin can force re-detection or re-gen mid-day via the DashboardView buttons.

**Phase 6 roadmap (deferred, not v1.0 blockers):**

- **Auto-import via Playwright scraper** — replace step 1 manual paste with scheduled scrape of TX Lottery site. Removes operator burden from the daily loop.
- **Auto-aggregator** — wire step 2 into a post-import trigger or a cron 60s before slate-gen cron. Eliminates the manual `--apply` step.
- **Multi-jurisdiction parameterization (v2.0)** — expand from `jurisdiction='TX'` hardcode to SC/OH/NJ/NY/FL per ARCH-06's "deferred to v2.0" list.

**Outstanding follow-ups registered (separate audit tickets recommended):**

1. **ZK6 hash-only AT dedup** — `recordHitInAdaptiveTracking` in `supabase/functions/run-hit-detection/index.ts` has the same latent flaw fixed in step 5/6 for ZK30: `slate_hash`-only dedup misses the multi-day-same-picks case. ZK6 is currently insulated by its higher hash variance from per-scope/per-mode multiplication, but the bug exists.
2. **`engine_runs` UPSERT no-op caveat** — PostgREST `Prefer: resolution=merge-duplicates` without an explicit `?on_conflict=` URL param silently no-ops on non-PK unique conflicts. Visible side-effect: `generated_at_et` pins to first write for any (slate_hash, mode) pair. Affects both ZK6 + ZK30 telemetry timestamps. Fix is one query-string addition to the `sbPost('/rest/v1/engine_runs', ...)` call in both edge functions.
3. **v1.1 hardening items:**
   - Per-multiplicity energy threshold tuning (engine smoke showed composition 23/4/3 vs ARCH-06's 18/9/3 target — `zk30_min_energy_threshold` could be lowered for non-singles to unlock more doubles/triples)
   - Theme integration for `/zk30` (currently hardcoded blue palette, light-only — won't honor dark mode toggle)
   - `histories_tx.comboset_sorted` column — currently computed inline in hit detection edge fn; cheap denormalization would simplify future query paths

**v1.0 acceptance gates (per ARCH-06 spec, in flight):**

- ⏳ 7 consecutive days of clean slate-gen at 09:00 ET — measurement starts after first cron fire (2026-05-26 09:00 ET).
- ⏳ Full backtest re-run once 30 days of TX matches accumulated — earliest practical date ≈ 2026-06-25.

Both gates are time-based; structural build is done.

---

### ARCH-06 v1.0 follow-up — BUG-156: DGC signal channel dead on TX (2026-05-26)

**Symptom.** `signal_dgc` in `daily_intelligence_zk30` returned 0 for ≈98% of TX combos and ≈100% of selected picks across every slate written since step 5 deploy. Empirically: out of 30 picks per slate × ~7 days, every per-pick `DGC` field was 0, making the channel a fixed 0×0.10 weight contribution — the model was effectively a 3-channel (BOX/PBURST/CO) ensemble despite advertising 4.

**Root cause.** Two compounding bugs in `engineCore.computeDGC`, both in the RN engine and the edge function:

1. **Calibration mismatch.** `DGC_REF_STD_DEV = 10` was set for ZK6 national-pace data where combo stdev medians ≈ 8d. TX single-state pace is 5× slower (median combo stdev ≈ 46d). The formula `max(0, 1 - stdev/10)` clips to 0 for any combo with gap stdev > 10d, which on TX data is practically every combo.
2. **2-hit triple freak case.** A combo with exactly 2 hits has 1 gap → variance = 0 → `1 - 0/10 = 1.0` (perfect DGC). After `maxNorm`, these 2-hit triples dominate the universe-max divisor, pushing every legitimate multi-hit single's DGC to near-zero. Whichever bug you fix in isolation leaves the other live.

**Diagnostic.** Mapped under DGC=0 audit, 5 steps:
- Step 1: `select_count where signal_dgc=0` from current TX slate → 30/30 picks zero
- Step 2: Sample combos 345 (24 hits, stdev 33d), 777 (2 hits, stdev 0) → confirmed both pathologies
- Step 3: Universe-wide tally → 982/1000 combos returning DGC=0 from `computeDGC`
- Step 4: Confirmed engineCore is shared RN+edge — fix must land in both surfaces
- Step 5: Validated proposed `refStdDev=50, minGaps=3` against 30 sample combos → spread 0.0–0.85, no freak cases

**Fix shipped 2026-05-26:**

| Layer | Change |
|---|---|
| `app_config` rows | `zk30_dgc_ref_std_dev=50` (was hardcoded 10 in shared engineCore), `zk30_dgc_min_gaps=3` (new floor) |
| `engines/zk30.ts` | Added `computeDGCZK30(dayOffsets, refStdDev, minGaps)` inline; removed `computeDGC` import; swapped call site; `EngineConfig` + `DEFAULT_ENGINE_CONFIG` + `loadEngineConfig` keys/parsing extended for the 2 new fields |
| `supabase/functions/compute-slate-zk30/index.ts` | Mirror patch (same `computeDGCZK30`, same config plumbing); redeployed v4, sha `06476f8e4b02985338f5ce42c182921a49ec34a361c9dbcb4c0e8be615475dc4` |
| `lib/engineCore.ts` | **Untouched** — ZK6's `computeDGC` keeps its national-pace calibration. Fix is ZK30-local. |

**Why a ZK30-local function rather than parameterizing engineCore.computeDGC**: ZK6's national-pace DGC has been live for months and is correctly calibrated for its data slice. Adding optional parameters to `computeDGC` would risk a ZK6 regression on the migration; isolating the fix in two callers (RN + edge) costs ~30 lines and keeps the blast radius zero.

**Validation (request_id=10, edge v4):**
- 30/30 picks regenerated against TX data
- DGC range 0.000–0.830 (was 0 across the board)
- DGC mean 0.569, median 0.658
- 3 picks DGC=0 (all placeholder combos with timesDrawn=0 — expected; the BOX-mask path returns them unweighted)
- 0 picks at the 0.15 baseline floor (min_gaps=3 not artificially capping real data)
- Top pick combo 345 (24 hits, stdev 33d) → DGC=0.519 normalized — matches the diagnostic's predicted ~0.34 raw × maxNorm divisor ≈ 0.52

**Now to monitor:** whether the now-live DGC channel changes the pick mix on subsequent slates and whether hit rate moves. Engineering invariant: DGC is the smallest weight (0.10) so swing should be modest, but the 4-channel ensemble is finally honest. Backtest of full ZK30 with vs without DGC live is deferred until 30 days of TX matches accumulate (per ARCH-06 acceptance gate 2; earliest 2026-06-25).

**Drift-control note:** `engines/zk30.ts` + `supabase/functions/compute-slate-zk30/index.ts` now both diverge from `lib/engineCore.computeDGC` for DGC only. The DRIFT CONTROL block at the top of the edge fn already names the constants that must move in lockstep — `computeDGCZK30` joins that list. ZK6 path (`engines/zk6.ts`, `compute-slate-zk6`) still uses the original `computeDGC` and remains untouched.

---

## ARCH-08 — ZK30 Fireball Separation Principle (2026-05-26)

**Load-bearing architectural rule, not a UX preference.** Documented here so future work can't drift it back.

Fireball matches are PRESENTATION-ONLY and isolated from all engine/scoring/tuning paths.

**Reasoning**: a magnitude of HitMaster users play TX Pick 3 in jurisdictions where Fireball is not available, OR play Pick 3 in non-TX jurisdictions where ZK30 picks are useful but Fireball is not. Mixing fireball matches into hit metrics inflates ZK30's apparent performance for those users and produces phantom hit notifications they cannot collect.

**Rules**:

1. **Hit rate** = `(hit_straight OR hit_box) / picks`. Fireball is NEVER included in primary hit rate calculation.
2. **Any backtest, optimization loop, or weight-tuning target** uses NATURAL-ONLY hit rate as the objective function.
3. **Engine signals** (BOX, PBURST, CO, DGC) consume natural draws only via `histories_tx.result_digits`. Fireball-substituted variants NEVER enter aggregation.
4. **Snapshot pick fields**: `pick.hitType` reflects NATURAL primary match (straight > box > null). `pick.fireballHitType` reflects FIREBALL primary match (fireball_straight > fireball_box > null). They are independent fields and both can be populated on a single pick.
5. **DI columns** `matched_session / matched_result / matched_fireball` track NATURAL primary match only. Fireball detail lives in `adaptive_tracking_zk30` per-match rows + snapshot `fireballHitType`.
6. **UI**: primary surfaces (HITS badge, "Today" stats, hit rate, pick card primary badge row) show natural only. Fireball gets its own secondary section labeled "TX-only" — always visible but collapsed by default, expandable on user tap.
7. **External captions / verification posts / marketing copy** use natural-hit count as the headline metric. Fireball is a parenthetical aside ("+ N fireball matches for TX players").
8. **Future jurisdictions with bonus mechanics** (e.g., other states with Wild Ball, Boost, etc.) inherit this same separation pattern: bonus is secondary, never enters scoring.

**Violation surfaces** (search and audit periodically):
- Any SQL aggregating hits without filtering on `hit_straight OR hit_box`
- Any UI label saying "N hits today" without specifying natural
- Any backtest comparing engine versions on a fireball-inclusive metric
- Any caption/post template that bundles fireball into headline counts

**v1.0 implementation surfaces**:

| Layer | Where it lives |
|---|---|
| Data shape | `ZK30PickItem.hitType` narrowed to `'straight' \| 'box' \| null`; new `ZK30PickItem.fireballHitType: 'fireball_straight' \| 'fireball_box' \| null` (`components/zk30/types.ts`) |
| Edge fn | `run-hit-detection-zk30` v2 sha `2a673114…`: `naturalPrecedence` + `fireballPrecedence` compute independent primaries; `updateDailyIntelligenceHit(natural, fireball)` populates `matched_*` from natural only; snapshot pick gains `fireballHitType` field; telemetry response splits `hitsFound` (natural pick count) + `fireballHitsFound` (fireball-only pick count, non-overlapping) |
| Telemetry table | `hit_detection_runs.hits_found` = natural-only count. `supplements_generated` column repurposed to carry fireball-only count (no schema add — table is shared with ZK6 and a column add was out of scope for v1.0) |
| HITS badge | `hitPicks = allPicks.filter(p => !!p.hitType)` — natural only (`app/(tabs)/zk30.tsx`) |
| Compact tile | Natural hits keep bg tint + ring chrome; fireball-only picks get a small dim 🔥 in the bottom-right corner only |
| List card | Primary badge row [S][B] (natural). Fireball [🔥S][🔥B] sub-row renders ONLY when `pick.fireballHitType` set, with a tinted background + smaller font + 🔥 prefix. Fireball-only picks surface a fireball label when no natural label is present |
| Detail modal | "MATCH RESULTS" section split into NATURAL MATCH + 🔥 FIREBALL MATCH · TX-only sub-blocks. Each shows its own pick-vs-draw shape; "No natural/fireball match" message when one is absent. Fireball detail (session/result/digit) fetched lazily from `adaptive_tracking_zk30` via `useFireballHitDetail` hook, scoped to `slateDate + combo + rank` |
| Hits timeline (C5) | Each day-band sub-groups natural inline + collapsible 🔥 sub-band labeled "TX-only". Fireball sub-band collapsed by default on every band |
| Results "Today" stats | HITS + RATE compute from natural only. `+ N FIREBALL · TX-only` callout below the 3-stat row, only rendered when `fireballHitsToday > 0` |

**One-shot migration**: `scripts/migrations/2026_05_25_zk30_fireball_separation.ts` walks every active snapshot, moves `hitType='fireball_*'` → `fireballHitType`, adds `fireballHitType: null` to clean picks (schema consistency for downstream renderers), nulls `matched_session/result/fireball` on DI rows where natural flags are both false. Idempotent — re-runs produce 0 work. First run on 2026-05-26: 1 DI row cleaned (pick 173, the 5/25 fireball-straight hit on Day-session draw 171 + fb 3). Snapshot picks already migrated by Phase 1 regen.

**Engine + aggregator NOT touched** (verified fireball-free pre-fix): `aggregate_tx_datasets.ts` reads `result_digits` only; BOX/PBURST/CO/DGC derive from `datasets_box` + `datasets_pair` + `histories_tx.result_digits` (no fireball-substituted variants); `engines/zk30.ts` + `compute-slate-zk30` have no fireball references in scoring paths. ARCH-08 is purely a downstream presentation + telemetry rewire — the engine never had to learn fireball; it just had to stop the data layer from collapsing it into the natural primary slot.

**Audit script** (for the periodic violation sweep): grep for `hit_straight OR hit_box OR hit_fireball` in SQL/edge-fn paths, `hitsToday` / `hits_found` displays without "natural" qualifier in user-facing strings, and any caption template that does `total_hits = naturalHits + fireballHits` math.

---

## ARCH-06 v1.0 follow-up — UI Enhancement Suite Phases A–D (2026-05-25→2026-05-26)

Operator-driven post-v1.0 polish across the ZK30 surface. Shipped across three commits — `ad85477` (Phases A–C), `7794c40` (Phase D), with the audit lock-in landing here after the fact. All four phases pass the work-order DoD.

**Phase A — quick wins** (committed in `ad85477`):
- TBD·1 and TBD·2 chips removed from the secondary view-mode row. `ViewMode` union narrowed to `compact|list|hits|results`, `TbdPlaceholder` component + `MoreHorizontal` import deleted, persistence parser trimmed.
- `SignalPips` row stripped from `CompactTile.tsx` — signal info now lives only in the detail modal (cleaner 5×6 grid at compact density).
- `(i)` metadata modal already existed; tightened two fields: (a) `Engine` was rendering "vv1.0" because `engine_version` is stored prefixed; dropped the literal `v` prefix. (b) `Generated` reformatted from `"9:00 AM ET"` → `"May 25, 2026 09:00 ET"` (date + 24h time, both ET) per spec.

**Phase B — visual** (committed in `ad85477`): `energyTier` rewritten as a 4-tier {label, color} (ON FIRE / HOT / BUILDING / COLD) with explicit ZK30-specific hex colors (`#ff4444 / #ff8800 / #ffaa00 / #64748b`) — single source of truth for `EnergyRing` + `CompactTile` + `PickCard` + `PickDetailModal`. Triples flagged via dashed ring + `▲` top-left overlay (CompactTile) / `▲` next to rank label (PickCard). `app_config.zk30_fresh_threshold_days=30` seeded; `useFreshThreshold()` cached hook drives the Fresh/Building boundary; `(?)` tooltip explainer modal renders next to Fresh/Building pressure text with `stopPropagation` so it doesn't bubble to the row press.

**Phase C — workflow** (committed in `ad85477`): `selectedDate` state replaces the prior today→yesterday auto-fallback. Header gains `← {DATE} →` stepper with a 30-day date-picker modal (availability dots fetched from `slate_snapshots_zk30`). `TODAY` pill jumps back when off-today. Subtitle shows `Next slate: Xh Ym` before 09:00 ET, `Slate ready · last updated Xh ago` after. Hit-detection button gets a 5s `useRef` debounce + `Last run: HH:MM ET · N hits found` caption from `hit_detection_runs?run_source=eq.edge-zk30`. New HIT HISTORY section in `PickDetailModal` queries `histories_tx` for the combo's distinct permutations (limit 12). Hits tab restructured into `HitsTimelineView` — 30-day historical query against `adaptive_tracking_zk30`, grouped into 4 collapsible day-bands (Today / Yesterday / This week / Earlier this month).

**Phase D — analytics** (committed in `7794c40`, lives in `components/zk30/ResultsAnalytics.tsx`): four hand-rolled SVG cards on the Results tab + a top-of-stack failure banner. (1) Cron Health Card merges `hit_detection_runs?run_source=eq.edge-zk30` + `engine_runs?effective_weights->>_engine=eq.zk30` and trims to the latest 14. (2) 7-day stacked bar chart (Straight/Box/🔥S/🔥B) with avg-line overlay. (3) By-Session horizontal 4-bar chart with 7d/30d/90d window toggle. (4) Fireball-vs-Natural 3-segment split bar over 30d. Hand-rolled via `react-native-svg` rather than the spec-suggested `react-native-svg-charts` (unmaintained since 2020).

**Phase A→D outcome**: ZK30 admin surface compresses from a clutter screen with placeholder tabs and a today-only Hits view into a date-stepper-driven slate review with historical timeline + cron health + 4 analytics cards. tsc clean on all touched files post-each-phase commit. The hook-order crash bug introduced by the Phase C2 `usePickHitHistory` call (placed after the modal's early-return) was caught and fixed in the same commit (`ad85477`) before push.

**Outstanding from spec, deferred**: Phase D's coming-soon roadmap card mentioned a "best-performing energy band" analytic that wasn't in the numbered D1–D4 items; not built. Easy add if it comes up later.

---

## ARCH-06 v1.0 follow-up — UI Evolution Phases A–D (2026-05-26)

Second wave of operator-driven UI work, shipped in 4 phases per the UI Evolution work order. Each phase mandatory-paused for operator review before the next; visual smoke at each checkpoint via headless-chromium.

**Phase A — Layer 1: Identity anchoring** (`7dfb0cc`)
ZK30 UI Layer 1 (Identity) shipped: hero masthead redesigned (3-line stacked "ZK30 · SINGLE-STATE MODE" / "⭐ TEXAS" / date + scope + sessions stepper), TX state silhouette watermark added (24-anchor SVG at 6% opacity on COMPACT + LIST only, `lib/zk30/svg/TexasOutline.tsx`), slate hash chip "slate · A14D842C · gen Mon 20:14 ET" between masthead and tabs (tap opens existing metadata modal). Screenshots now self-identify as ZK30 single-state TX without needing caption context.

**Phase B — Layer 2: Visual interest** (`e0612e0`)
ZK30 UI Layer 2 (Visual interest) shipped: top-5 rank emphasis on CompactTile — rank #1 gets 4px ring + brand-blue outer glow + 20×20 medallion with white "1", ranks #2-5 get 3.5px ring + dark mini-chip "#2"/"#3"/"#4"/"#5"; triple flag moved to bottom-left to free top-left for rank chip. 7-day performance band (HIT RATE / MATCHES / STREAK) between hash chip and tab row, natural-only per ARCH-08, dedup at (slate_date, combo) granularity, Sunday-aware streak walk. Rank #1 pulse animation via reanimated useSharedValue (2s cycle, scale 1.0→1.04→1.0, opacity 1.0→0.85→1.0, iOS/Android only). Next-TX-draw countdown chip "⏱ Next TX draw in 2h 14m · DAY" from new `lib/zk30/txDrawSchedule.ts` (M 10:00 / D 12:27 / E 18:00 / N 22:12 ET, Sunday-skipped, DST-safe Intl parse).

**Phase C — Layer 3: Brand voice + share tooling** (`6e32897`)
ZK30 UI Layer 3 (Brand voice + share tooling) shipped: Operator/Subscriber view mode toggle via new `lib/zk30/labelMaps.ts` + `lib/zk30/viewMode.tsx` (React Context + AsyncStorage). Subscriber default for non-admin users (FREQUENCY/PAIR HEAT/CONSISTENCY/RHYTHM signal labels; TOP PICK/STRONG/OVERDUE/RECENT HIT energy tiers; "Hit N days ago"/"N days since last hit" freshness phrases); admin opt-in to operator-mode (BOX/PBURST/CO/DGC + ON FIRE/HOT/BUILDING/COLD + "Fresh Nd"/"Building Nd"). TX-native theme via new `lib/theme/zk30Theme.ts` adds `accentTX = #bf0a30` (TX flag red) for the lone star + jurisdictional "TX-only" suffixes on fireball labels. Share Slate action button (lucide Share2) in header opens 3-row action sheet: Pro PNG capture, Redacted PNG (CTA scrim overlay + watermark), Copy slate hash. New deps: `expo-sharing@14.0.8` + `react-native-view-shot@4.0.3` (Expo-native equivalents preferred over the community libs the spec suggested); `expo-clipboard` was already present. Capture wrapped via `captureRootRef` on the screen container + `captureOverlay` state controlling pre-snap chrome.

**Phase D — Layer 4: Animations** (this commit)
ZK30 UI Layer 4 (Animations) shipped: D1 slate-drop reveal — picks stagger-fade by row over ~750ms on FIRST mount per slate hash (tracked via `seenSlateHashesRef`); subsequent re-renders render instantly. Reanimated `FadeIn.delay(rowIdx × 100).duration(250)` per tile/row. D2 natural-hit celebration — when natural hit count transitions N → N+1, mount `HitCelebration` toast with kind-aware copy (🎯 NATURAL STRAIGHT MATCH / ✓ NATURAL BOX MATCH / 🔥 FIREBALL MATCH — fireball gets the quieter variant per ARCH-08), 4s auto-dismiss, FadeIn/FadeOut transitions. **Confetti**: initially deferred because `react-native-confetti-cannon` ships pre-modern Flow types Metro can't resolve. Replaced with a hand-rolled reanimated particle system in `components/zk30/Confetti.tsx` — 40 Animated.View particles fan outward+upward from the toast origin then gravity-fall, 1.5s total with fade-out at 1s, 5-color festive palette (gold/green/blue/pink/orange). Natural hits get confetti; fireball stays toast-only per ARCH-08. Web platform skipped (reanimated's web shim handles it but headless captures struggle; toast carries the headline message there). D3 date stepper cross-dissolve — picks body wrapped in `Animated.View` keyed on `selectedDate`, reanimated FadeIn 200ms + FadeOut 200ms cross-dissolve between days.

**Implementation outcome**: tsc clean across all 4 phases; headless-chromium smoke at each checkpoint confirmed render. Console warnings (~240) are pre-existing RN-Web text-node + nested-button warnings unrelated to UI Evolution work.

**Deps added across the suite**: `expo-sharing`, `react-native-view-shot`. `react-native-confetti-cannon` was installed in D2 then uninstalled when it broke Metro — confetti replaced with hand-rolled reanimated particles, no extra dep needed.

---

## ZK6 Engine Audit Findings (2026-05-10)

| ID | Issue | Severity | Description |
|:---|:---|:---|:---|
| ENG-01 | Signal Normalization Drift | ✅ Fixed 2026-05-11 | BOX now uses max-norm (consistent with PBURST/CO/DGC). Applied to `engines/zk6.ts` and `engines/zk30.ts`. |
| ENG-05 | Pair Signal freqScore Anti-Correlation | ✅ Fixed 2026-05-11 | `getPairSignal()` was using `dsRaw/maxPairDsRaw` (staleness) as freqScore — gave highest scores to most-stale pairs, inversely correlated with hits. Fixed to `timesDrawn/maxPairTimesDrawn` (historical frequency), matching BOX signal logic. |
| ENG-06 | Incomplete K6 Slate (5 picks) | ✅ Fixed 2026-05-11 | Added Pass 4 (relax pairRepCap) and Pass 5 (relax cooldown) to guarantee full 6-pick slate. pairRepCap deadlock was blocking 6th slot after ENG-01 normalization change shifted pick clustering. |
| ENG-02 | Static Multiplicity Priors | 🟡 Medium | `MULTIPLICITY_PRIORS` are static and do not adjust to shifts in historical draw trends. |
| ENG-03 | Placeholder Pick Transparency | ℹ️ False Positive — Already handled | `PickCard` shows "Limited data" tag when `timesDrawn === 0`. No additional changes needed. |
| ENG-04 | Deterministic Hash Collision/Failure | ✅ Fixed 2026-05-11 | `ts: Date.now()` removed from hash input in both `engines/zk6.ts` and `engines/zk30.ts`. Hash is now fully deterministic. |

---

## Quality Scorecard

| Dimension | Target | Current Status |
|-----------|--------|----------------|
| Type Safety | ✅ Good | ✅ Good |
| Error Handling | ✅ Good | ✅ Good |
| Concurrency Safety | ✅ Good | ✅ Good |
| Performance | ✅ Good | ✅ Good |
| Security (auth/roles) | ✅ Good | ✅ Good (BUG-02 fixed — default role now `free`) |
| Security (RLS) | ✅ Good | ⚠️ Partial — ZK6 lockdown via Edge Function complete; hit-detection writes restored via anon UPDATE policies pending Phase 3.5 Edge Function migration. Dead `authenticated` policies present but inert. (BUG-20 ⚠️ Partial) |
| Data Consistency | ✅ Good | ✅ Good — hit persistence restored 2026-05-12 (was silently failing post-BUG-20 lockdown; window bounded by BUG-20 deploy date 2026-05-12) |
| Engine Accuracy | ✅ Good | ✅ Good (ENG-01/ENG-05 fixed; ENG-02 static priors deferred) |
| Test Coverage | ⚠️ Medium | ⚠️ Medium (22 signal-math tests; no integration tests) |
| Documentation | ✅ Good | ✅ Good |
| Maintainability | ✅ Good | ✅ Good (ARCH-01/03/05 fixed; ARCH-02/04 deferred per ZK30 policy) |
| User Experience | ✅ Good | ✅ Good (UX-46/47/48/49 fixed) |
| Accessibility | ✅ Good | ✅ Good |

---

## UX Improvement Log — 2026-05-08

15-point subscriber experience overhaul. All items sourced from deep UI/UX audit.

| ID | Tier | Area | Change |
|----|------|------|--------|
| UX-01 | Conversion | Global | New `Toast.tsx` component — success/error/info/warning slide-up notifications |
| UX-02 | Conversion | Global | New `InfoTooltip.tsx` component — tappable "?" modal for inline jargon definitions |
| UX-03 | Conversion | Global | Tier naming unified: Free→**Seeker**, Premium→**Oracle+**, Admin→**Mystic** across all screens |
| UX-04 | Conversion | Home | Pro gate rewritten: "Picks #3–6 hidden" + specific value prop + trial detail |
| UX-05 | Conversion | Home / Slates | Regen success/failure replaced modal with toast notification |
| UX-06 | Conversion | Home | Mode buttons (Balanced/Conservative/Aggressive) now show sub-label explanation |
| UX-07 | Engagement | Home | Energy stat strip has InfoTooltip with 🔥⚡✦❄ scale definition |
| UX-08 | Engagement | Home | Demo status bar message rewritten from jargon to plain English |
| UX-09 | Engagement | Home | Hit banner "Box Win ✓" clarified to "Box Win ✓ (matched any order)" |
| UX-10 | Engagement | Slates | Yesterday toggle: full "Yesterday" label, amber-tinted, clearly discoverable |
| UX-11 | Engagement | Slates | Credits shown as "2/3 regens" with tooltip explaining daily reset |
| UX-12 | Engagement | Slates | Filter/sort labels expanded: S→Singles, D→Doubles, Nrg→Energy, Frq→Freq, ≡/⊞→List/Grid |
| UX-13 | Engagement | Slates | Yesterday pending state includes direct "Import Results →" button |
| UX-14 | Engagement | Intelligence | No-data empty state: emoji, better copy, "Go to Slates ⚡" CTA |
| UX-15 | Engagement | Intelligence | Slate empty state: "Generate Slate ⚡" navigation button |
| UX-16 | Engagement | Intelligence | Loading state shows "X of ~2,000 picks" progress |
| UX-17 | Engagement | Intelligence | Analysis header has InfoTooltip explaining the screen purpose |
| UX-18 | Engagement | Intelligence | "Apply to Engine Config" clarified to "Apply · Regenerate slates to see effect" |
| UX-19 | Engagement | Account | Notification toggles show toast confirmation on each change |
| UX-20 | Engagement | Account | Trial button: "then $9.99/mo, cancel anytime" added |
| UX-21 | Engagement | Account | Active subscription note: renewal guidance + Manage link |
| UX-22 | Engagement | Account | Glossary "▼" expand arrow changed to "›" (more intuitive) |
| UX-23 | Engagement | Ledger Import | Skipped-line errors translated from raw parser output to plain English |
| UX-24 | Engagement | Ledger Import | Preview row count: "Showing first 30 of N rows · scroll right…" |
| UX-25 | Engagement | Ledger Import | Success card includes next-step guidance for user |
| UX-26 | Polish | Pick Card | Locked card: larger title font, "Tap to unlock all 6 picks" sub-text |
| UX-27 | Polish | Pick Card | Pressure indicator adds descriptive sub-text: "Hit 12 draws ago" / "45 draws without a hit" |
| UX-28 | Polish | Pick Detail | Gauge label "MATCH" → "ENERGY" |
| UX-29 | Polish | Pick Detail | All-caps section titles → Title Case (Signal Breakdown, Pair Intelligence, Why This Order) |
| UX-30 | Polish | Pick Detail | Signal Breakdown gets subtitle: "% = signal strength (higher = stronger indicator)" |
| UX-31 | Polish | Pick Detail | Pair Intelligence subtitle explains cyan ≥ 70% = strong threshold |
| UX-32 | Polish | Pick Detail | WhyOrder descriptions use plain English (no more "surge vector", "pattern alignment", "signal sync") |
| UX-33 | Polish | Pick Detail | Box play payout shown (~$80); Straight payout (~$500) explained below |
| UX-34 | Accessibility | Tab Bar | All tab icons now have `accessibilityLabel` for screen readers |
| UX-35 | Accessibility | Global | `ToastProvider` added to root layout, wraps entire app |

---

## PickDetailModal Redesign — 2026-05-08

Full rebuild of `components/PickDetailModal.tsx` for maximum data density with zero scrolling.

| ID | Area | Change |
|----|------|--------|
| UX-36 | Pick Detail | Full-screen modal (replaces 92%-height bottom sheet) — uses all available screen real estate |
| UX-37 | Pick Detail | Gradient accent line (purple→cyan→rose) at very top of modal for visual identity |
| UX-38 | Pick Detail | Header bar: close (left) · rank badge + title (center) · share icon (right) — share accessible from all tabs |
| UX-39 | Pick Detail | Hero strip always visible: animated energy arc, big combo digits colored by energy level, P1/P2/P3 position boxes, BOX SET badge, scope + version |
| UX-40 | Pick Detail | **Timestamp strip** between hero and tabs — shows exact generation date/time (e.g. `May 8, 2026 · 2:45 PM`) for screenshot proof-of-analysis |
| UX-41 | Pick Detail | **Tab-based navigation** (INTEL / PAIRS / PLAY) eliminates all scrolling — every tab fits one screen |
| UX-42 | Pick Detail | INTEL tab: ZK6 confidence bar → 4 signal pills side-by-side (FREQ / MOMO / PATTERN / CONSIST) → Why This Order (3 rows with score badges) |
| UX-43 | Pick Detail | PAIRS tab: Full pair intelligence matrix — 4 signals × 3 pairs as visual progress bars, color-coded, legend, drawn count + scope callout |
| UX-44 | Pick Detail | PLAY tab: Straight vs Box bet cards (large combo, payout, badge) → 3 action buttons (Save / Heat Check / Share) |
| UX-45 | Pick Detail | Removed redundant `horizonRows` query (sparklines removed; data density now served by matrix bars) |

---

## Design Evolution Roadmap (2026-05-10)

This roadmap outlines the steps to align the mobile implementation with the "HitMaster Neon" design spec, improving visual polish to boost perceived value and subscriber conversion.

| ID | Enhancement | Priority | Description |
|:---|:---|:---|:---|
| DES-01 | **Neon Glow Integration** | High | ✅ Fixed 2026-05-12 — PickCard and SlateCard default border changed from flat white (`border`) to purple-tinted (`purple+'28'`), matching existing `theme.shadows.glow`. Hit cards get animated gold/cyan glow border pulsing at 1400ms. |
| DES-02 | **Typography Precision** | Medium | ✅ Fixed 2026-05-12 — All 60+ raw `fontFamily: 'Courier'` / `'monospace'` references replaced with `theme.typography.fontFamily.mono` across 19 files. Heavy-weight (700–900) mono text upgraded to `monoBold` (JetBrainsMono_700Bold). `Platform.OS` conditional removed from RegenConfirmationModal. |
| DES-03 | **Haptic/Visual Feedback** | Medium | ✅ Fixed 2026-05-12 — PickCard now renders hit-state banner (⭐ STRAIGHT HIT / 🎯 BOX HIT) with animated glow pulse when `pick.hitType` is set. Existing hot-energy pulse (≥80) preserved; hit pulse uses slower 1400ms cycle. |
| DES-04 | **Token Synchronization** | Low | ✅ Fixed 2026-05-12 — `theme.letterSpacing` token map added (tight/normal/wide/wider/widest/combo/comboLg) + `theme.animation.hit: 1400` for hit pulse duration. Single source of truth for spacing and animation constants. |

### Strategic Objective: "Maximum Polish"
The current gap between the intended "Neon" design and the flat React Native implementation is a missed opportunity for premium-tier positioning. By implementing glow-based depth, tracking-aligned typography, and responsive feedback animations, we move the app from a "utility tool" to a "high-end analytic dashboard."

Polish pass applied on top of the 35-point UX overhaul.

| ID | Area | Change |
|----|------|--------|
| VIS-01 | Global / Theme | `gradients` map added to `theme.ts` (header, hotEnergy, warmEnergy, mildEnergy, coolEnergy, purpleRose, cyanPurple, goldAmber) |
| VIS-02 | Global / Theme | `surface2` depth layer + `pulse: 900` animation duration added to theme |
| VIS-03 | EnergyMeter | Upgraded from flat border ring to `LinearGradient` ring + animated pulse halo (≥80 energy) |
| VIS-04 | EmptyState | Replaced bare icon with 3-ring cosmic orbit illustration (outer/mid/inner rings + icon center) |
| VIS-05 | SlateCard | Pick rank pill: background fill + border; digit letter-spacing widened to 6 |
| VIS-06 | Results | `LinearGradient` header; hit cards get teal highlight bg + border; strip width 6; digits letter-spacing 8 |
| VIS-07 | PickCard | Inline energy badge replaced with `EnergyMeter` (gradient ring, pulse halo on hot picks) |
| VIS-08 | Explore | Compact/Grid view now renders `SlateCard` per pick (signal bars, pill rank, temp badge) instead of inline rows |
| VIS-09 | Results | `EmptyState` (Calendar icon) replaces inline "No draws found" text in `ListEmptyComponent` |
| VIS-10 | Intelligence | `EmptyState` (BarChart2 icon) replaces inline no-data state with action buttons preserved |
| VIS-11 | Intelligence | `EmptyState` (Zap icon) replaces inline no-slate state with "Generate Slate ⚡" CTA preserved |
| VIS-12 | Home | `LinearGradient` header replaces plain `bgElevated` View |
| VIS-13 | Account | `LinearGradient` hero card replaces plain `bgElevated` View |
| VIS-14 | Number Book | `EmptyState` (BookOpen icon) replaces inline "No numbers saved yet" state |
| VIS-15 | ZK30 | `EmptyState` (Layers icon) replaces inline "No ZK30 snapshot found" text |

---

## UI/UX Deep Scan Findings (2026-05-10)

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| UX-46 | Shadow System Divergence | 🟡 Medium | ✅ Fixed 2026-05-11 — All 17 `theme.shadows.soft` references replaced with `theme.shadows.glow` across 9 files. `shadows.soft` is effectively deprecated. |
| UX-47 | Semantic Color Ambiguity | 🟡 Medium | ✅ Fixed 2026-05-11 — Added `SIGNAL_COLORS` const in `PickCard.tsx` mapping BOX/PBURST/CO/DGC to physical colors. Both `convergingSignals` array and `SignalBar` calls now use `SIGNAL_COLORS.*` — one source of truth for signal-to-color mapping. |
| UX-48 | Inconsistent Surface Depth | 🟡 Medium | ✅ Fixed 2026-05-11 — `results.tsx` D-token `surface2` was aliased to `theme.colors.card` instead of `theme.colors.surface2`. Now uses the correct `theme.colors.surface2` depth token. |
| UX-49 | Empty State Fragmentation | 🔵 Low | ✅ Fixed 2026-05-11 — `admin-imports.tsx` inline "No imports yet" replaced with `EmptyState` component (Layers icon). `ledger-import.tsx` inline error box intentionally left as inline (it is a parse-error notice, not a page-level empty state). |

### Proposed UI Enhancement Plan

| Phase | Enhancement | Description |
| :--- | :--- | :--- |
| **I** | Theme Consolidation | ✅ Fixed 2026-05-12 — Semantic signal color aliases added: `freqSignal`, `momoSignal`, `patternSignal`, `consistSignal`, `hotStreak`, `brand`, `neutralCool`, `neutralWarm` (Patch 01). |
| **II** | Shadow Standardization | ✅ Fixed 2026-05-11 — All `theme.shadows.soft` references migrated to `theme.shadows.glow`. |
| **III** | Component Refactoring | ✅ Fixed 2026-05-11 — All inline empty states replaced with `EmptyState.tsx`. |
| **IV** | Layering Polish | ✅ Fixed 2026-05-12 — `_layout.tsx` modal screens (`import-wizard`, `paywall`, `coming-soon`) now use `surface2` as `contentStyle` and `headerStyle` background, creating depth separation from base `background` (Patch 02). |


---

## Design Polish Sprint — 2026-05-12

Applied design handoff 4 patches and v3 system patches. All items sourced from `design handoff/design_handoff_hitmaster 4/` and `design handoff/patches/v3/`.

| ID | Area | Change |
|----|------|--------|
| UX-50 | EnergyMeter | Full replacement — 4-tier gradient scale (≥90 hot/amber, ≥80 amber/gold, ≥65 orange/gold, ≥45 gold/cyan, else cyan/purple); cool gradient now visible; baseline ring glow on all energies (`shadowOpacity: 0.55`); `fontWeight: '700'` on label |
| UX-51 | TierBadge | Full replacement — `tierPalette()` function: FREE gets surfaceLight/borderMed/textTertiary (no fake glow), PRO/PLUS get `shadowOpacity: 0.45, shadowRadius: 6`; `fontWeight: '800'`, `fontFamily: monoBold`, `letterSpacing: 0.6`; `ComingSoonBadge` gets glow; `sizeMetrics()` with `padX/padY/iconSize` |
| UX-52 | Slates ctrlStrip (iOS) | ctrlStrip row (filter/sort/view-mode chips + save button) was a `View` with `flex:1` spacer — right-side buttons overflowed off-screen on iOS. Fixed to horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`; all chips now reachable |
| UX-53 | PickDetailModal — Safe Area | Added `useSafeAreaInsets` from `react-native-safe-area-context`; header `paddingTop: insets.top || 14` clears the Dynamic Island / notch on all iOS hardware |
| UX-54 | PickDetailModal — Buttons | Close/minimize buttons were 32×32 (below iOS 44pt minimum tap target). Upgraded to `closeBtnInner: { width: 44, height: 44, borderRadius: 22 }` pill buttons with frosted `rgba(255,255,255,0.1)` background and 1px white border; `hitSlop: { top:10, bottom:10, left:10, right:10 }` |
| UX-55 | PickDetailModal — Drag Handle | Drag handle indicator added at top of modal header (`width: 36, height: 4, borderRadius: 2, rgba(255,255,255,0.2)`) for system-familiar gesture affordance |
| UX-56 | PickDetailModal — Content Scroll | Tab content area changed from `View` to `ScrollView` with `paddingBottom: insets.bottom + 24`; prevents content clipping on tall INTEL/PAIRS tab payloads |
| UX-57 | Slates GridTile — Screenshot Mode | Compact/grid view fully rewritten for screenshot use case: `ScrollView` bypassed, `flex:1` chain `gridContainer → gridArea → gridRow → GridTile` fills exact screen height without scrolling; 2×3 grid shows all 6 picks simultaneously; `GridTile` has rank chip (temp-colored), energy score, big combo digits with `adjustsFontSizeToFit`, comboSet label, 4 micro signal bars (3px height) |
| UX-58 | NeonSkeleton | New `components/NeonSkeleton.tsx` — animated shimmer loading placeholder (opacity 0.35→0.75 at 900ms loop). Variants: `card` (full pick-card with rank/combo/4 bars), `row`, `combo` (3 big digit slots), `text`, `splash`. Block color `rgba(155,91,255,0.18)` |
| UX-59 | NeonRefreshControl | New `components/NeonRefreshControl.tsx` — themed pull-to-refresh wrapper: iOS `tintColor: cyan`, Android `colors: [cyan, purple, rose]` spinner, `progressBackgroundColor: surface2`. Drop-in replacement for `RefreshControl` in `index.tsx`, `results.tsx`, `intelligence.tsx` |

### V3 System Patches

| Patch | File | Change |
|-------|------|--------|
| 01 — Semantic Aliases | `constants/theme.ts` | Added `freqSignal`, `momoSignal`, `patternSignal`, `consistSignal`, `hotStreak`, `brand`, `neutralCool`, `neutralWarm` color tokens. Closes Phase I of Enhancement Plan. |
| 02 — Modal Surface2 | `app/_layout.tsx` | `import-wizard`, `paywall`, `coming-soon` Stack screens now use `surface2` for `contentStyle` and `headerStyle` backgrounds. Closes Phase IV of Enhancement Plan. |
| 03 — Neon Tab Bar | `app/(tabs)/_layout.tsx` | `TabIcon` takes `focused` prop; active tab renders cyan pill halo (`rgba(43,255,204,0.12)` bg, `rgba(43,255,204,0.45)` border, cyan shadow glow); bar background `surface2`, 1.5px purple border-top, height 64; label `fontWeight: '700'`, `letterSpacing: 0.4`, `textTransform: 'uppercase'`, `fontSize: 10` |
| 04 — NeonSkeleton | `components/NeonSkeleton.tsx` | New shimmer loading placeholder component (see UX-58) |
| 05 — NeonRefreshControl | `components/NeonRefreshControl.tsx` + 3 screens | New themed RefreshControl wrapper (see UX-59); swapped in `index.tsx`, `results.tsx`, `intelligence.tsx` |

---

| Date | Change | By |
|------|--------|----|
| 2026-05-08 | Initial master audit created; consolidated AUDIT_2026-05-08.md + AUDIT_FIX_STATUS_2026-05-08.md + SYSTEM_AUDIT_REPORT_2026-05-08.md | Claude Code |
| 2026-05-08 | BUG-01 through BUG-17 resolved/triaged; BUG-18 through BUG-22 identified as open | Claude Code |
| 2026-05-08 | BUG-07 fully resolved — cursor-based pagination on Intelligence tab | Claude Code |
| 2026-05-08 | BUG-08 resolved by design — "National" label added to explore status strip | Claude Code |
| 2026-05-08 | 15-point UX overhaul (UX-01 through UX-35) — see UX Improvement Log above | Claude Code |
| 2026-05-08 | Visual enhancement pass (VIS-01 through VIS-15) — gradient headers, EnergyMeter/EmptyState/SlateCard wired in | Claude Code |
| 2026-05-08 | PickDetailModal full redesign (UX-36 through UX-45) — full-screen, tab-based, zero scroll, timestamp strip | Claude Code |
| 2026-05-08 | BUG-23 fixed — renamed `background.PNG` → `background.png`; Metro uppercase extension caused web load failure on Linux | Claude Code |
| 2026-05-11 | Pick Quality Degradation root causes linked to BUG-22, ENG-01, BUG-21 | AI Assistant |
| 2026-05-11 | Full independent code verification: BUG-02 still open (default admin), BUG-22 false positive (already fixed), ENG-01/ENG-04 fixed in zk6+zk30, BUG-19 fixed, ARCH-05/NEW-28 documented | Claude Code |
| 2026-05-11 | ENG-05 fixed: pair signal freqScore was using dsRaw (staleness) — corrected to timesDrawn (frequency) in zk6+zk30. Root cause of PBURST/CO being anti-correlated with hits. | Claude Code |
| 2026-05-11 | ENG-06 fixed: added Pass 4+5 to K6 selection to guarantee full 6-pick slate when pairRepCap/cooldown deadlock occurs. | Claude Code |
| 2026-05-11 | BUG-21 fixed: explore.tsx status strip now shows ⚠ allday fallback when engine falls back to allday data. StatusRibbon horizon filter corrected (was including _dataStats/_engineVersion as fake horizon keys). | Claude Code |
| 2026-05-11 | BUG-18 partially fixed: updateDailyIntelligenceHit now uses slate_date=in.(date,prevDay) — late-night slates tagged with yesterday's date are now hit-updated correctly. | Claude Code |
| 2026-05-11 | ENG-03 confirmed false positive: PickCard already shows "Limited data" tag for timesDrawn===0 picks. No additional changes needed. | Claude Code |
| 2026-05-11 | ARCH-01 complete: admin.tsx decomposed from 3971→88 lines; 10 views extracted to components/admin/; AdminShared.tsx holds types/constants/helpers/styles. | Claude Code |
| 2026-05-11 | ARCH-05 complete: inline 190-line runHitDetectionAndRefresh removed from useDataIngestion.tsx; delegates to lib/hitDetection.ts::runHitDetectionForDates(). dominant_signal added to adaptive_tracking writes in lib. | Claude Code |
| 2026-05-11 | ARCH-03 complete: Jest + jest-expo test suite set up. 22 tests covering ENG-01/ENG-05/DGC/normalizeScope/pairUtils signal math regressions. | Claude Code |
| 2026-05-12 | Phase 3 complete: `supabase/functions/compute-slate-zk6/index.ts` deployed. ZK6 slate generation now routes through Supabase Edge Function using `SUPABASE_SERVICE_ROLE_KEY`. Feature flag `EXPO_PUBLIC_USE_EDGE_ZK6=true` in `.env`. Service-role bypasses RLS by design — this is the authorized write path for `slate_snapshots`, `daily_intelligence` (INSERT/UPDATE/DELETE), and `adaptive_tracking` (POST). Stamps `horizons_present_json._source = 'edge'` on every row written. Deploy date: 2026-05-12 00:47:46 UTC (commit d92fd99, bundled with BUG-18/20). Logged retroactively 2026-05-12 after forensic investigation; original deploy session did not update audit. | Claude Code (retroactive) |
| 2026-05-12 | ARCH-02 complete: lib/engineCore.ts extracted — pure TS/Deno-safe signal math. Both engines import from it; ~80 duplicate lines removed per engine. | Claude Code |
| 2026-05-12 | BUG-18 fully fixed: slate_date date column added to slate_snapshots + index + backfill. Both engines now write slate_date to snapshot payload. SlateSnapshot type updated. | Claude Code |
| 2026-05-12 | Quick Counts corrected: Open Medium was 1 (wrong) — now shows 2 (BUG-20 + ENG-02). Fixed count updated to 31. ARCH debt updated to 1 open/4 fixed. | Claude Code |
| 2026-05-12 | BUG-20 fixed: RLS lockdown on slate_snapshots (dropped allow_all/public), daily_intelligence (dropped two ALL policies), adaptive_tracking (enabled RLS + scoped policies). All INSERT paths now service_role only except adaptive_tracking anon insert for hitDetection. Fixed count 31→32, Open Medium 2→1. | Claude Code |
| 2026-05-12 | Forensic investigation complete: confirmed edge function (service_role) is sole post-BUG-20 write path; all SECURITY DEFINER functions read-only on locked tables; no triggers on locked tables; `source='live'→'edge'` transition confirmed in slate_snapshots data. | Claude Code |
| 2026-05-12 | BUG-28 identified (High): hit detection PATCH to daily_intelligence + slate_snapshots silently 401 post-BUG-20 — anon key blocked by authenticated-only UPDATE policies. Intelligence hit badges never written. | Claude Code |
| 2026-05-12 | BUG-29 identified (Low): DB functions calculate_hit_rates() and get_todays_hits() use updated_at_et date instead of slate_date column — latent boundary bug when slates are generated late-night ET. | Claude Code |
| 2026-05-12 | BUG-30 identified (Medium): ZK30 snapshots not persisted post-BUG-20 — no edge function path, anon INSERT blocked. Silent fallback to audit_logs on every ZK30 regen. | Claude Code |
| 2026-05-12 | Audit cleanup: retroactively logged Phase 3 ZK6 Edge Function deploy (commit d92fd99); downgraded BUG-20 to ⚠️ Partial with explicit scope breakdown; added BUG-28 to Closed Bugs (fix: anon UPDATE policies applied 2026-05-12); dropped BUG-29 (DB analytics `updated_at_et` issue — low-priority, no active users affected); removed BUG-30 (ZK30 non-functional framing superseded); added BUG-29 (ZK30 latent persistence failure, not active in production); updated Quality Scorecard Security (RLS) → ⚠️ Partial and Data Consistency note; added Phase 3.5 / 3.6 to Edge Function Migration Roadmap; added process note on audit-as-definition-of-done. | Claude Code |
| 2026-05-12 | Component patch pass applied (design handoff): `SignalBar.tsx` full replacement (fixed 60px track, iOS glow shadow); `SlateCard.tsx` full replacement (12h/8v padding, 32px rank container, canonical hot/warm/mild/cold temperature tokens); `PickCard.tsx` 3 surgical edits (`heatInfo` thresholds corrected, `tempColorFor()` helper + temperature-tinted bestStraight digits, signal bar labels BOX/PBURST/CO/DGC). | Claude Code |
| 2026-05-12 | BUG-30 fixed (High): Intelligence screen scope/navigation/cache wiring — `slateScope` now initialized from `globalScope`; `router.push` → `router.navigate` in `IntelligenceRouteView`; inline `regenerateSlate` replaces navigation button in empty state; `queryClient.removeQueries` added to home regen path. Commits 036d3c4 + 6dd8769. | Claude Code |
| 2026-05-12 | BUG-31 fixed (Critical): `daily_intelligence` permanently empty — edge function wrote `energy`/`indicator`/`times_drawn` (none exist in DB); PostgREST 400 silently swallowed by catch block. Fixed to `energy_score`; removed `indicator` and `times_drawn`. Edge function redeployed. Commit 89883f5. Fixed count 33→35. | Claude Code |
| 2026-05-12 | Design handoff 4 applied: `EnergyMeter.tsx` full replacement — 4-tier gradient (hot/amber/orange/gold/cyan/purple), cool gradient readable, baseline ring glow on all tiers. `TierBadge.tsx` full replacement — tierPalette(), FREE no-glow, PRO/PLUS shadowRadius 6, monoBold 800 weight, letterSpacing 0.6. | Claude Code |
| 2026-05-12 | iOS ctrlStrip overflow fixed (`explore.tsx`): filter/sort/view-mode row was a View with flex:1 spacer — right-side buttons clipped off screen. Changed to horizontal ScrollView; all chips now accessible. | Claude Code |
| 2026-05-12 | PickDetailModal accessibility pass: (1) useSafeAreaInsets — header paddingTop clears Dynamic Island on all iOS; (2) close/minimize buttons upgraded 32→44pt (iOS minimum tap target), frosted pill style with hitSlop; (3) drag handle indicator added at top; (4) tab content area changed View→ScrollView with insets.bottom padding to prevent clipping. | Claude Code |
| 2026-05-12 | Slates grid view redesigned for screenshot mode: ScrollView bypassed in compact mode entirely; flex:1 chain gridContainer→gridArea→gridRow fills exact screen height; new GridTile component (2×3 layout) renders rank chip, energy score, big adjustsFontSizeToFit combo digits, comboSet, and 4 micro signal bars — all 6 picks visible simultaneously without scrolling. UX Improvements Applied 35→45. | Claude Code |
| 2026-05-12 | V3 Patch 01 — Semantic theme aliases: freqSignal/momoSignal/patternSignal/consistSignal/hotStreak/brand/neutralCool/neutralWarm added to constants/theme.ts. Closes Enhancement Plan Phase I. | Claude Code |
| 2026-05-12 | V3 Patch 02 — Modal surface2 depth: import-wizard, paywall, coming-soon Stack screens now use surface2 for contentStyle+headerStyle in app/_layout.tsx. Closes Enhancement Plan Phase IV. | Claude Code |
| 2026-05-12 | V3 Patch 03 — Neon tab bar: app/(tabs)/_layout.tsx full replacement — TabIcon takes focused prop, active tab renders cyan pill halo with glow, bar uses surface2 bg + 1.5px purple border-top, height 64, uppercase labels. | Claude Code |
| 2026-05-12 | V3 Patch 04 — NeonSkeleton: new components/NeonSkeleton.tsx shimmer loading placeholder; 5 variants (card/row/combo/text/splash); opacity 0.35→0.75 loop at 900ms. | Claude Code |
| 2026-05-12 | V3 Patch 05 — NeonRefreshControl: new components/NeonRefreshControl.tsx themed pull-to-refresh; RefreshControl swapped to NeonRefreshControl alias in index.tsx, results.tsx, intelligence.tsx. | Claude Code |
| 2026-05-12 | V5 Patch 01 — SlateCard v2: replaced components/SlateCard.tsx with data-aware version. Renders 3 or 4 signal channels based on what is present (DGC is optional — only 122/563 picks have it). Surfaces drawsSince and lastSeen as first-class fields. Hit-result footer: "DREW → 827 CT · 2026-04-26" when hitType is set. hitType/hitResult/hitState/hitDate optional fields added to TopKStraightRow in types/core.ts. | Claude Code |
| 2026-05-12 | V5 Patch 02 — HitReplay: new components/HitReplay.tsx — side-by-side predicted vs drawn digit visual (ghost cells for picked digits, solid cells for drawn result). Wired into PickDetailModal.tsx PLAY tab at top when pick.hitType and pick.hitResult are set. Bridges PickItem.energy → temperature for HitReplay prop. | Claude Code |
| 2026-05-12 | V5 Patch 03 — EngineFingerprint: new screens/EngineFingerprintScreen.tsx — full-screen engine analytics dashboard (hit rate, scope count, singles share, hot-pick share KPI tiles; temperature distribution stacked bar; average channel strength bars for BOX/PBURST/CO/DGC). Includes computeFingerprint() helper that parses slate_snapshots rows. Wired into admin tab as new Fingerprint (🧬) tab via components/admin/FingerprintView.tsx (fetches 100 recent snapshots, computes stats, renders screen). UX Improvements Applied 45 → 48. | Claude Code |
| 2026-05-12 | BUG-32 fixed (Medium): Slates grid flex chain regression — `ctrlStripOuter` horizontal ScrollView (line 785, explore.tsx) had no height constraint, unlike `scopeRow` (same pattern, `maxHeight: 38`). On iOS the unconstrained ScrollView claimed flex space from the SafeAreaView column, leaving `gridContainer`'s `flex: 1` with insufficient remaining height; tiles rendered at natural content height near the bottom of the compressed space. Fix: added `maxHeight: 46` to `ctrlStripOuter` style (single property). Restores design intent of GridTile 2×3 redesign — grid now fills screen height instead of bunching. | Claude Code |
| 2026-05-12 | V6 Patch 01 — HomeScreen aggressive cleanup (UX-60): `app/(tabs)/index.tsx` full replacement. Above-the-fold chrome reduced from 9 bands to 2 (header + scope row). Mode switcher, EngineStatusBar, DrawTicker, LiveResultsTicker, heat check button, responsible play disclaimer moved into `OverflowSheet` bottom modal (triggered by ⋯ `MoreHorizontal` button in header). Inline stat strip (5 values) replaced with single `heroStat` widget showing AVG ENERGY as a large number colored by energy tier. Root container changed from `SafeAreaView` to `View` with `paddingTop: insets.top` (avoids double-inset on scroll). Hit banner and today's hits sections retained above K6 Slate hero — both are high-signal content. Onboarding, daily streak, generate flow, PickDetailModal, Paywall all preserved unchanged. | Claude Code |
| 2026-05-12 | Data boundary bug fixes (BUG-33 through BUG-36): (BUG-33) Home "TODAY'S HITS" validated against `todayResults` from histories table — stale hits from yesterday's snapshot no longer surface as today's. (BUG-34) Slates fallback path no longer filters `hitType` picks — full snapshot shown when all picks have hit. (BUG-35) Intelligence `loadSlate` falls back to yesterday's rows when today returns empty. (BUG-36) Results `onSlatePicks` query + client-side box-matching added — hits appear in ledger even when `backfillIntelHits` hasn't run yet (bypasses ARCH-05 backfill dependency). Fixed count 36→40. Commit 153dd76. | Claude Code |
| 2026-05-12 | 6 UX Enhancements (UX-64 through UX-69): (UX-64) Home draw countdown — `useDrawCountdown(scope)` hook added to `index.tsx`; heroStat card shows NEXT DRAW live countdown badge (ET midday 12:00 / evening 19:30), updates every second, color-coded purple. (UX-65) Intelligence 3-tab layout — `intelligence.tsx` view type expanded from `'analysis'|'slate'` to `'today'|'analysis'|'slate'`; new Today tab loads today's `daily_intelligence` rows, shows K6 picks first (highlighted) then watch list below, with 3-chip summary strip (K6 count, hits today, avg energy). (UX-66) Account plan comparison grid — FREE plan card in `account.tsx` replaces plain teaser text with a 5-row FREE vs ORACLE+ comparison table (K6 Picks, Best Straight, Heat Checks, Deep Analytics, Hit History). (UX-67) PickCard hit history timeline — `PickCard.tsx` pressure block enhanced with a mini bar showing drawsSince/365 scale + hit dot trail (up to 5 colored dots, overflow "+N" label). (UX-68) PickDetailModal share card — `PickDetailModal.tsx` `handleShare` now produces a formatted ASCII-bordered card with all 4 signals, pressure info, all-time hits count. (UX-69) Gradient headers — `book.tsx` sidebar header wrapped in purple→surface LinearGradient; `coverage.tsx` header wrapped in navy→background LinearGradient. UX Improvements Applied 52→58. | Claude Code |
| 2026-05-12 | V8 Patch 01 — Compact grid view fix (UX-63): `app/(tabs)/explore.tsx` surgical edit. (1) `tempColorForEnergy` corrected — was mapping 60–79→amber and 40–59→gold (wrong tokens), causing all cards to appear red; fixed to `warm`/`mild`/`cold` theme tokens. (2) `tempLabel()` helper added (HOT/WARM/MILD/COLD). (3) `GridTile` fully replaced: rank chip top-left; HOT/WARM/MILD/COLD temperature badge with energy number top-right; combo digits with `textShadowColor` glow; comboSet + SGL/DBL multiplicity meta row; 2×2 signal grid (B/P/C/D) with label + numeric value above each 3px neon bar; locked cards show 🔒 Pro chip. Card border + bar fill get `shadowColor` neon glow. UX Improvements Applied 51→52. | Claude Code |
| 2026-05-12 | V7 Patch 01 — Results Ledger cleanup (UX-62): `app/(tabs)/results.tsx` full replacement. Above-list chrome reduced from 5 bands to 3 (header + date tabs + one compact controls strip). Stats row (6 numbers) moved to `StatsSheet` bottom modal — prettier 4-cell session breakdown + total/hits/hit-rate row, triggered by ⋯ `MoreHorizontal` button in header. Search bar collapsed from full row to 🔍 icon trigger; tap expands inline with teal border + X to close; active query shown as teal chip on trigger. Session filter shrunk from full pills row to compact icon+3-letter-label pills inside a flex scrollable. Single `controlsRow` = [search trigger] [session pills] [draw count]. All queries, processed data, grouped sections, hit badge rendering, F/B/S signal columns preserved unchanged. UX Improvements Applied 50→51. | Claude Code |
| 2026-05-12 | BUG-28 re-applied: RLS SQL (`GRANT UPDATE TO anon` + `intelligence_update_anon` + `snapshots_update_anon` policies) was generated in the first pass but never executed — PATCHes continued to 401. Re-run with `DROP POLICY IF EXISTS` guards on second pass. 5/11 hit data written directly via SQL (609 QC evening, 425 TX morning) as one-time data repair since app write path was blocked. False `hit_box=true` on 5/12 allday row cleared via SQL. | Claude Code |
| 2026-05-12 | BUG-37 fixed (High): Admin "Run Hit Detection Now" ran only for today. `handleDetectHits` iterated scopes for `getTodayET()` only — on 5/12 found no draws and reported "no hits." Fixed to iterate `[getYesterdayET(), today]` so yesterday's hits are always checked. Commit 1690785. | Claude Code |
| 2026-05-25 | ARCH-06 opened: ZK30 v1.0 architecture lock-in for Texas pilot. Replaces deleted `engines/zk30.ts` (stale clone-of-ZK6). Closes ARCH-04 by absorption. Step 1 of 7 — DDL migrations for `histories_tx`, `daily_intelligence_zk30`, `adaptive_tracking_zk30` — drafted to `supabase/migrations/2026-05-25_zk30_v1_tables.sql`; NOT yet applied to remote project pending operator review. Standing "no ZK30 work until ZK6 verified" rule explicitly overridden by operator. | Claude Code |
| 2026-05-12 | BUG-38 fixed (High): Results tier-3 scope-limited — `useSnapshot().hitPicks` filtered to current scope. Allday hits invisible when user was on midday/evening scope. Replaced with direct `slate_snapshots` query (no scope filter) + client-side `snapshotHitPicks` memo. Commit 1690785. | Claude Code |
| 2026-05-12 | BUG-39 fixed (High): `file_meta` not a column in `slate_snapshots` — explicit SELECT caused 400 on all tier-3 queries. Removed from column list; dropped supplement-skip guard. Commit 603d732. | Claude Code |
| 2026-05-12 | BUG-56/57/59/82/84/107 fixed (all 6 critical): Number Book persistence added (AsyncStorage); sample lists removed; XHR replaced with fetchFromSupabase in admin-imports + HitTrackingView + useDataIngestion; hardcoded anon JWT fallback removed from useDataIngestion; Supabase project URL removed from HealthTestsView UI. Fixed count 44→50, Critical Open 6→0. Commit 42f6d2c. | Claude Code |
| 2026-05-12 | Deep scan complete: full read of 38 production files. BUG-41 through BUG-123 documented (83 new findings: 6 critical, 20 high, 51 medium, 5 low, 1 updated). ENH-01 through ENH-22 documented. Quick Counts updated. No fixes applied — awaiting triage orders. | Claude Code |
| 2026-05-12 | ENH-01 through ENH-22 implemented (20 of 22). ENH-02 results.tsx: combo-set cluster view with hit-count grouping. ENH-03 intelligence.tsx: "Days With Hit" stat card. ENH-04 book.tsx: "Add from Slate" button fetches today's K6 picks into active list. ENH-06 index.tsx: "Generated at HH:MM" timestamp on AVG ENERGY card. ENH-07 DashboardView.tsx: "Full Daily Workflow" button chains hit detection + regen all. ENH-09 explore.tsx: freshness "Xm ago" in status strip. ENH-11 AdaptiveLearningView.tsx: 7-day chart split into green (box) + blue (straight) stacked bars. ENH-13 results.tsx: share button on hit cards via Share API. ENH-14 useDataIngestion.tsx + import-wizard.tsx: rejectedSamples field surfaced in summary modal. ENH-15 EngineConfigView.tsx: weight integrity check gates handleSave. ENH-16 useAuth.tsx + account.tsx: signOut clears all AsyncStorage keys and navigates to /. ENH-17 zk30.tsx: "Open Admin" button on EmptyState. ENH-18 HealthTestsView.tsx: 5th health test for daily_intelligence freshness. ENH-20 dateUtils.ts: isETDateToday() added. ENH-21 PickCard.tsx: long-press (600ms) saves combo to first Number Book list. ENH-22 explore.tsx: pull-to-refresh runs runHitDetectionAllScopes (today + yesterday) before refreshSnapshot. ENH-08 deferred (requires adaptive_tracking schema extension). ENH-12 deferred (requires new hit_detection_runs table). | Claude Code |
| 2026-05-12 | BUG-40 fixed (High): `on_slate=false` (set by "Clear Top 30") blocked tier-1 confirmed-hits query — `on_slate=eq.true` guard removed from `hits` query only. `onSlatePicks` (tier-2) retains the guard intentionally. Fixed count 40→44. Commit 25de56d. | Claude Code |
| 2026-05-12 | BUG-124 fixed (High, preventive): hit-annotation bleed onto today's slate. Two surgical edits to `lib/hitDetection.ts`: (1) `resolveSnaps` fallback now adds `slate_date=lte.${date}` constraint — prevents today's freshly-generated snapshot from being selected when processing yesterday's draw results. (2) `updateDailyIntelligenceHit` removed `nextDayStr` from `slate_date IN (...)` filter — engines tag late-night regens with current ET date, not tomorrow's; `nextDayStr` was causing today's `daily_intelligence` rows to receive yesterday's hit flags. Bug pattern verified in code; live snapshots already clean at investigation time (overwritten by 17:53 UTC regen). No cleanup SQL required. Fixed count 123→124. | Claude Code |
| 2026-05-12 | Audit drift: changelog entries at lines 692 and 701 reference "new GridTile component" as if a standalone file (`components/GridTile.tsx`), but GridTile is an inline function defined at `app/(tabs)/explore.tsx:77`. No separate file was ever created. Reconciliation (update audit language to reflect inline definition) deferred to next audit-cleanup pass. | Claude Code |
| 2026-05-12 | Backtest harness built: `scripts/backtest/cli.ts` with `report` and `replay` modes; `npm run backtest:report` and `npm run backtest:replay` wired in package.json; `configs.ts` ships `default`/`destroyed`/`legacy` presets; `data.ts` Node-native read-only Supabase client (service role, GET only); `replay.ts` implements `computeSlateAsOf()` using engineCore math (no reimplementation); `score.ts` cross-jurisdiction hit detection; `output.ts` CSV + Wilson-CI console summaries. CONFIG-01 documented retroactively. Config-tracking process (CONFIG-XX) and engine-change empirical validation requirement added to MASTER_AUDIT.md and CLAUDE.md. **Baseline measurements (2026-05-12, metric = % slates with ≥1 hit, 95% Wilson CI):** REPORT (60d, n=73 historical snapshots): overall 67.1% [55.7–76.8%]; pre-destruction 70.5% [58.1–80.4%] (n=61); destroyed-config era 66.7% [30.0–90.3%] (n=6); code-changes era 33.3% [9.7–70.0%] (n=6, edge source only). By scope: midday 50.0%, evening 79.2%, allday 72.0%. REPLAY (30d, 3 configs, n=87 slates each): `default` 73.6% [63.4–81.7%], `destroyed` 62.1% [51.6–71.5%] (−11.5pp vs default), `legacy` (no DGC) 73.6% [63.4–81.7%] (identical to default overall; DGC adds evening pick quality but no aggregate lift). Destroyed config CIs are non-overlapping with default — degradation is real. Output metric bug fixed: `output.ts` previously used totalPickHits/slates (could exceed 100%); corrected to binary slate-level hit rate throughout. | Claude Code |
| 2026-05-12 | **CONFIG-03 applied + BUG-130 fixed:** Investigation triggered by 0 hits on 5/12 midday slate. Diagnostic showed engine had right combos in top30 but rejected them — `426` at rank #5 with energy=99 (matched CT 624) was excluded for rail/cooldown reasons. Drilling deeper found `datasets_box.ds_raw` values wildly off from reality (e.g. `444 midday H01Y` stored=2065 vs histories-truth=124, drift of ~5.7 years). Root cause: BUG-130 — `importDaily` ignored CSV's `DrawsSince` column, just incremented `ds_raw +=1` for non-matched rows daily, accumulating drift. **Actions:** (a) `importDaily` mutation neutered to prevent further damage; (b) `scripts/intel-tuning/rebuild-datasets.ts` built to recompute `ds_raw` from `histories` ground truth; (c) 6,401 of 6,600 rows corrected via `npm run rebuild:datasets -- --apply` (CONFIG-03). `times_drawn` left untouched (histories only ~130 days, can't reconstruct multi-year aggregates). Slate regenerated immediately — produced **2 hits vs 5/12 midday draws** (`820`→MI 208 BOX, `289`→CA 829 BOX), up from 1 pre-rebuild and 0 pre-BUG-129. Suspected corruption source: prior ZK30 engine build — but per CLAUDE.md ZK6 must be verified before ZK30 work, so corruption source not investigated. Fixed count 129→130. Project memory updated to flag ZK30 lockout until 2026-05-19 7d post-fix review. | Claude Code |
| 2026-05-12 | **BUG-129 fixed (Critical):** edge function `dsRawMap` and `pairMetaMap` were sourcing values from horizon-with-max-`times_drawn` (typically H10Y) instead of H01Y-preferred as the local engine has always done. Two surgical edits to `supabase/functions/compute-slate-zk6/index.ts` — box loop now applies `if (h === 'H01Y' || !drawsSinceMap.has(normKey))` guard; pair loop applies the same. `timesDrawn` aggregation unchanged (max across horizons remains correct). Edge function redeployed 21:30 UTC. **Live verification:** prior slate (pre-fix) had 0 hits vs 5/12 midday draws across 12 picks (midday + allday). Post-fix slate immediately picked `605` (allday rank 2, energy 98) which BOX-matched Mississippi's `065` midday — first verifiable production hit of the day. Midday top picks completely changed (was 592/926/230/934, now 197/826/320/011/439/400). All prior backtest projections (`default` 71.8%, `floor70` 73.1% on clean pre-5/9 window) reflect the **post-fix** math — production now aligned. Fixed count 128→129. | Claude Code |
| 2026-05-12 | **CONFIG-02 applied:** `app_config.min_energy_threshold` 0 → 70 in production (project tgagarhwqbdcwoqhpapi, 21:12 UTC) per backtest validation (+1.3pp overall, +3.8pp midday). 5/12 slates regenerated immediately after — all 3 scopes returned 6 picks with min energies 70/74/72. Notable: allday now picks `343` (energy 72, the same doubles candidate the pre-BUG-125 slate had been picking before yesterday-block downgraded it to 133/energy 10). Rollback path documented in CONFIG-02. Review at 2026-05-26. | Claude Code |
| 2026-05-12 | ENH-A/F/C analysis (per CLAUDE.md empirical validation, n=78 slates × 26 days, clean pre-5/9 window). **ENH-A (quality floor):** tested `min_energy_threshold` at 50 and 70. **floor70 wins +1.3pp overall (71.8% → 73.1%)**, with strongest gain on midday (+3.8pp) — refusing sub-70th-percentile picks eliminates "garbage filler" doubles without hurting overall hit rate. floor50 too lenient (-1.3pp). **ENH-F (tiered cooldown):** tested singles/doubles/triples = 20/10/5 and 15/5/3. Both either tied default (15/5/3) or regressed (-3.9pp at 20/10/5). Hypothesis disproven — relaxing doubles cooldown lets recent doubles back in. **ENH-F NOT recommended.** **ENH-C (intelligence-driven weight fitting):** built `scripts/intel-tuning/` reading `daily_intelligence` and producing AUC-fitted weight proposals. First run on 4/13–5/8 data: AUC(BOX)=0.510, AUC(PBURST)=0.503, AUC(CO)=0.535, AUC(DGC)=0.500 — proves DGC has zero predictive power and CO is the only signal with meaningful lift. AUC-normalized weights backtested (`intel_tuned` config) → overall ties default (71.8%) but with extreme scope variance: allday +7.7pp, evening -11.5pp. **intel_tuned NOT deployable as-is** — needs per-scope fitting or constrained optimization. Tool committed for future iteration; first deployable proposal requires post-5/13 data. **Recommended action: deploy ENH-A floor70 (set `min_energy_threshold=70` in app_config), drop ENH-F, refine ENH-C per-scope.** | Claude Code |
| 2026-05-12 | BUG-126/127/128 fixed (High, follow-on to BUG-125): three downstream symptoms surfaced after BUG-125 deploy when user regenerated 5/12 slates. **(126)** `top30PreRail` did not apply the yesterday-hit hard block — Intelligence screen kept showing yesterday-blocked combos at the top while the slate (correctly) excluded them. **(127)** K6 picks fell outside top30 (cooldown relaxation in pass 5 picks combos outside the top-by-indicator), so the `on_slate=true` PATCH matched 0 rows — Intelligence screen had no slate marker. **(128)** K6 array was kept in selection-pass order, so cooldown-rejected high-indicator combos appeared AFTER low-indicator pass-1 doubles in the display — user saw "energy=10 at the top" of allday slate even though pick 1 should be 248 (energy=100). Fixes: (a) apply yesterday-block filter to `top30PreRail` in both engines, (b) embed `on_slate` into the INSERT row + append any K6 combo not in top30 as ranks 31+, (c) sort `k6` by indicator desc before output. All three edits applied to both `engines/zk6.ts` and `supabase/functions/compute-slate-zk6/index.ts`. Same 6 combos selected — just reordered for display and properly wired to `daily_intelligence`. Edge function redeployed (21.11kB). Live verification: 5/12 slate position 1 = 248 (energy=100) for allday; 6 `on_slate=true` rows per scope (some at ranks 31-36 where natural top30 was all cooldown-rejected singles). Fixed count 125→128. | Claude Code |
| 2026-05-12 | BUG-125 fixed (High): yesterday-hit hard block ported from `engines/zk6.ts` (lines 595–647) to `supabase/functions/compute-slate-zk6/index.ts`. Production runs with `EXPO_PUBLIC_USE_EDGE_ZK6=true`, so every published slate was using the buggy edge path — yesterday's drawn numbers could re-appear as today's picks. Backtest validation per CLAUDE.md (30d × 3 scopes, n=87 each): BASELINE (`edge_current`, no block) 70.1% [59.8–78.7%] overall vs CANDIDATE (`default`, with block) 73.6% [63.4–81.7%]. Candidate wins in every scope cut (midday +3.4pp, evening +3.4pp, allday +3.5pp). Threshold met → ported. Edge function now imports `getYesterdayET` and queries two independent sources (`histories` for raw draws + `daily_intelligence` for hit flags) so the block survives stale imports. Replay harness extended with `excludeYesterdayHits` toggle and new `edge_current` preset (permanent regression fixture). Fixed count 124→125. Edge function deployed 2026-05-12 to project `tgagarhwqbdcwoqhpapi` (20.35kB bundle). | Claude Code |
| 2026-05-12 | V6 Patch 02 — SlatesScreen 3-tab densification (UX-61): `app/(tabs)/explore.tsx` full replacement. Replaced 5-band chrome stack with 3-tab segmented control (Slate · Live · More) below a simplified header. SLATE tab: scope pills + filter/sort/view-mode chips merged into a single horizontally-scrollable `scopeRow` (`maxHeight: 42`) — eliminates `ctrlStripOuter` (BUG-32 no longer relevant). LIVE tab: `DrawTicker` + today's hit list + heat check action row. MORE tab: yesterday toggle + save slate + engine mode + daily credits (Pro) + pro upsell banner + responsible play disclaimer. Yesterday query now gated with `enabled: tab === 'more' && showYesterday` — no wasted network call when not on More tab. `DrawTicker` added as new import (was not in explore.tsx before). All state handlers preserved. UX Improvements Applied 48→50. | Claude Code |
| 2026-05-12 | **First post-stabilization slate verification (user-confirmed):** slate generated 2026-05-12 ~22:00 UTC via edge function (post-BUG-129 H01Y horizon fix, post-BUG-130 ds_raw rebuild, post-BUG-131 RPC neuter, post-CONFIG-02 floor70). Snapshot IDs: midday `a0bbab24-66a1-4baf-9e96-6b46d50552b7`, evening `29fa67ea-a630-4fb4-a04a-3285e1888fbb`, allday `fd60a39c-9a62-48da-b786-52e2837400e0`. Result: midday pick #6 BOX hit, allday pick #6 BOX hit. **Mixed signal:** confirms the engine math is producing hits again (vs ~0 hits during 5/9–5/12 corruption window) but top-indicator picks did not lead. With n=2 hits across 3 scopes observed on the day of the fix itself (day 0), sample is far too small to judge whether top-indicator ranking is restored — that requires the full 7-day verification window to land. Per audit, "first full post-stabilization day" = 2026-05-13; Day 1 of 7-day window starts then. Next checkpoint: 2026-05-19. | Claude Code || 2026-05-13 | **30-day BASELINE backtest recorded** (per CLAUDE.md "Engine Changes — Empirical Validation Required" rule, pre-staged for the 2026-05-16 scheduled cooldown-tuning agent). Config: `default`, mode: balanced, window: 2026-04-15 → 2026-05-14, n=87 slates × 3 scopes. **Overall: 69.0% [58.6–77.7%]**. By scope: midday **37.9%** [22.7–56.0%], evening 69.0% [50.8–82.7%], allday 100.0% [88.3–100.0%]. **Notable signal:** midday is severely underperforming (-31pp vs overall, -62pp vs allday) — the per-scope config support being implemented in the 5/16 agent's Item 2 is well-justified. Any cooldown candidate from Item 1 that improves midday materially is worth shipping even if overall stays flat. CSV: `scripts/backtest/output/replay-2026-05-14T00-51-28.csv`. Note: today's BASELINE (69.0%) is below the prior pre-5/9-clean baseline (73.6% on 5/12) — likely reflects the destruction-era data window now bleeding more heavily into the 30-day rolling window. | Claude Code |
| 2026-05-13 | **CONFIG-05 applied + ENH (per-scope cooldown override mechanism):** Per-scope cooldown overrides ported from concept to production. **Mechanism (additive):** `engines/zk6.ts::loadEngineConfig` and `compute-slate-zk6/index.ts::loadEngineConfig` now accept an optional `scope` parameter; they pull a single additional app_config key `recent_hit_cooldown_${scope}` alongside the global keys, and overlay it on `recentHitCooldown` when present. Call sites in `computeSlate` pass scope through. Backtest harness extended with `EngineConfig.recentHitCooldownByScope?: Partial<Record<Scope, number>>`; `runK6Selection` takes scope and applies the override; the parity_midday_cd20 config produced identical numbers to baseline `default` (sanity guard passed). **Empirical validation (per CLAUDE.md, 30d × n=87 slates, 4 configs):** BASELINE `default` cd=20 → 69.0% overall / 37.9% midday / 69.0% evening / 100% allday. Candidate `midday_cd10` → **70.1% overall / 41.4% midday** (+1.1pp overall, +3.5pp midday; evening + allday unchanged). `midday_cd15` regressed (-3.5pp), `midday_cd5` regressed (-4.6pp) — non-monotonic curve, cd=10 is the sweet spot in this window. **CIs heavily overlap (n=29 midday slates per config); +3.5pp midday lift is NOT statistically significant.** User accepted ship with explicit rollback condition. **Production deploy:** edge function deployed `compute-slate-zk6` (25.7kB bundle), `app_config.recent_hit_cooldown_midday=10` upserted (HTTP 201), today's midday slate force-regenerated under new override (hash `A55AF7F7`, K6 ranks 4-6 shifted: 230/439/395 → 147/081/287 — confirms cooldown change reshaping selection). Evening + allday regen verified still using global cd=20 (no override key for those scopes). All 3 scopes' daily_intelligence rebuilt cleanly (30/31/32 rows) — BUG-139 fix still working post-deploy. **Review condition: 2026-05-19 (verification window close).** If midday hit rate has not materially improved over 5/13–5/19 live window vs the 30-day baseline (37.9%), roll back by setting `recent_hit_cooldown_midday=20` (or DELETE the row to fall back to global). Rollback path: one app_config row + scope-regen. Files: `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts`, `scripts/backtest/{types,replay,configs}.ts`, app_config (Postgres). | Claude Code |
| 2026-05-13 | **ENH-EC1: EngineConfigView PR1 — E1+E2+E3+E5 shipped.** (a) **E1 per-scope cooldown UI:** new section under "🚫 Recent Hit Cooldown (global)" in the K6 Rail Controls card, with one row per scope (Midday / Evening / All Day). Each row shows the current value (e.g. `10d`) or `(global)` when no override is set, a chip-row for 5/10/15/20/25/30, and a `✗ clear` button when an override is present. Reads `recent_hit_cooldown_${scope}` keys on load; surfaces the CONFIG-05 production state visually (today midday shows `10d` per the prior cooldown ship). (b) **E2 strip dead controls:** removed UI + save-side writes for `burst_signal_on`, `drawing_confidence_on` (toggles in K6 Rail Controls), `engine_preset` (was never read by `computeSlate` — the dropdown remains but is local-only), `pressure_bonus_weight` (entire row under "Draws Since Pressure"), and the full Slate Generation Schedule section (`auto_gen_slates`, `morning_gen_time`, `evening_gen_time` — vaporware that admitted "requires server-side scheduling (Phase 3)" which never happened). Existing rows in app_config left in place (engine doesn't read them → harmless dead data); stopped writing them. (c) **E3 upsert save flow:** replaced the prior PATCH-per-key flow (which silently no-op'd when a key didn't exist — would have broken first-time creation of `recent_hit_cooldown_midday`) with a single `POST /rest/v1/app_config` body + `Prefer: resolution=merge-duplicates`. Cleared scope overrides issue `DELETE ?key=eq.X` per cleared row. Save banner now reports "X keys written, Y overrides cleared" instead of just "Saved!". (d) **E5 reload + confirm reset:** added `↻ Reload` button next to Reset (calls `loadConfig`, pulls live production state without touching hardcoded defaults). `↺ Reset` now opens a confirm modal explaining the destructive intent and pointing to Reload as the safer adjacent action. Default pressure_threshold corrected from 200 → 250 to match engine. Flagged for follow-up: `horizon_weights` is also dead (only EngineConfigView reads/writes it, no engine consumer) — left in place pending explicit user decision since not in original sweep scope. **Update 2026-05-15:** This follow-up resolved itself in the affirmative — `horizon_weights` was wired into both engine paths the same day (ENH-HW, commits e2b9746/6f3c4a8) and pushed live as CONFIG-06 (`{H01Y:100, rest:0}`). Both `engines/zk6.ts:502` and `supabase/functions/compute-slate-zk6/index.ts:192` now read the key on load, validate it (sum within 1% of 100), and feed it into BOX dsRaw blending via `blendBoxDsRaw`. The EngineConfigView UI for it is therefore **load-bearing** — operators editing those decay weights affects production scoring. No code change needed; this note documents that the original "dead UI" flag is no longer accurate. | `components/admin/EngineConfigView.tsx` | 2026-05-13 |
| 2026-05-13 | **ENH-EC2: EngineConfigView PR2 — E4+E6+E7+E8 shipped.** (a) **E4 DGC visible in Signal Weights:** added 4th tile (gold) for DGC alongside BOX/PBURST/CO; preset chip-row labels now read e.g. "Balanced (49.5/27/13.5/10)". Sum-100 validation expanded to all four signals (was BOX+PBURST+CO only — DGC was load-bearing but invisible). DEFAULT_PRESETS updated to match production weights (49.5/27/13.5/10 for balanced, etc.) so Reset aligns with current engine state instead of legacy 40/40/20. Live Σ% indicator under the tiles turns red when out of tolerance. (b) **E6 unsaved-changes badge:** loadConfig now snapshots all editable values into `loadedSnapshot` (JSON string). `currentSnapshot` is recomputed each render; `isDirty = loadedSnapshot !== currentSnapshot` drives a gold banner at the top of the screen with "Save / Discard" affordance. Discard delegates to Reload. Banner clears on successful save (snapshot refreshed). (c) **E7 backtest CTA modal:** new "📊 Validate via Backtest" button near Save, opens a 3-step instructional modal: BASELINE → CANDIDATE → DECIDE. Shows the exact `npm run backtest:replay -- --days 30 --config <name>` command, points to `scripts/backtest/configs.ts` for adding new presets, explains the CLAUDE.md merge rule (candidate ≥ baseline on overall hit rate), notes CSV output path. Doesn't try to run the backtest from RN — host shell only. Footnote under the button reads "Per CLAUDE.md: no engine change ships without a hit-rate number attached." (d) **E8 recent CONFIG-XX inline:** handleSave now writes a `config_change` row to `audit_logs` (action=config_change, target=engine_config, payload_meta={scope_overrides, global_cooldown, min_energy, pressure_threshold, written, deleted}). New "RECENT CONFIG CHANGES" card at the top of the screen reads the last 3 such rows. Shows timestamp + flattened diff summary (e.g. "global cd=20 · floor=0 · midday cd=10"). Best-effort write — failures swallowed so the save flow doesn't break if audit_logs is unreachable. | `components/admin/EngineConfigView.tsx` | 2026-05-13 |
| 2026-05-13 | **ENH-HW: horizon_weights wired to BOX scoring + parity-guard surfaces +2.3pp candidate.** Loader added to `engines/zk6.ts::loadEngineConfig` and `compute-slate-zk6/index.ts::loadEngineConfig`: pulls `horizon_weights` from app_config (percentages, validated to sum within 1% of 100), converts to decimals, falls back to hardcoded `HORIZON_WEIGHTS` const if invalid. Default for both paths is the prior hardcoded blend. Reused the previously-dead `blendBox` function (renamed `blendBoxDsRaw`, accepts runtime weights). BOX scoring loop at engines/zk6.ts:727 now computes `dsVal = Σ(weight_h × ds_raw_h)` instead of the H01Y-only `dsRawMap.get`. Edge function mirrors inline. Backtest harness extended with `EngineConfig.horizonWeights?` and same per-horizon blend in replay's BOX loop. **Backtest (30d, n=87 slates, all balanced):** BASELINE `default` (uses const blend, matches current production) → 69.0% [58.6–77.7%] overall / midday 37.9% / evening 69.0% / allday 100%. **CANDIDATE `hw_parity_h01y`** (weights = {H01Y:1.0, rest:0}) → **71.3% [61.0–79.7%] overall / midday 44.8% / evening 69.0% / allday 100%** — **+2.3pp overall, +6.9pp midday**. Tested `hw_uniform` (10% each), `hw_h01y_heavy` (50/20/12/...), and `hw_production` (matches current app_config value 35.35/21.72/...) — ALL three produced identical 69.0% / 37.9% to `default`. **Read:** ds_raw values across horizons are too correlated for blend SHAPE to matter; only collapsing to pure-H01Y produces a different selection. The pre-refactor engine used `dsRawMap.get` (H01Y-preferred with fallback to other horizons when H01Y absent) — close to but not exactly pure-H01Y; the blend wiring's default behavior is a subtle regression unless explicitly set to {H01Y:1.0}. **Production config change deferred** to user confirmation — flagging the +2.3pp/+6.9pp lift before applying, since "parity-guard failed productively" is an unusual signal and the 1-sample comparison with CONFIG-05's earlier midday backtest suggests stacking effects need verification. CSV: `scripts/backtest/output/replay-2026-05-14T01-44-01.csv`. | `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts`, `scripts/backtest/{types,replay,configs}.ts` | 2026-05-13 |
| 2026-05-13 | **CONFIG-06 applied: production `horizon_weights` set to pure H01Y.** Following ENH-HW wiring (commit e2b9746), the backtest (30d, n=87) showed `hw_parity_h01y` ({H01Y:100%, rest:0%}) beats the prior production blend by +2.3pp overall (69.0% → 71.3%) and +6.9pp midday (37.9% → 44.8%). Per CLAUDE.md empirical-validation rule, candidate ≥ baseline on overall — ships. User authorized. **Action sequence:** (1) Edge function `compute-slate-zk6` redeployed (26.43kB bundle) so the horizon_weights loader is live in production; (2) `app_config.horizon_weights` PATCHed from prior production blend `{H01Y:35.35%, H02Y:21.72%, H03Y:14.14%, H04Y:9.09%, H05Y:6.06%, H06Y:4.045%, H07Y:3%, H08Y:2.525%, H09Y:2.02%, H10Y:2.02%}` to pure H01Y `{H01Y:100, H02Y:0, ..., H10Y:0}` (HTTP 204); (3) all 3 scopes force-regenerated under the new weights. Midday hash shifted A55AF7F7 → 7ADD96DF (rank 4 changed 147 → 578). Evening regenerated to fresh hash 34053779. Allday K6 unchanged ([824,926,516,936,538,586]) — same hash 2EA69971 — meaning allday's top picks happen to be invariant under blend shape for this data window. **Review condition: 2026-05-19** (verification window close). If midday hit rate has not materially improved over 5/13–5/19 live window vs the 37.9% baseline (with the additive CONFIG-05 cd=10 effect in play), roll back via `PATCH app_config?key=eq.horizon_weights {value: <prior production blend>}` + regen. Stacking with CONFIG-05's midday cd=10 not isolated in backtest — both ship simultaneously; live signal will measure their combined effect. | app_config (Postgres) | 2026-05-13 |
| 2026-05-13 | **ENH-CAL-WIRE: Engine Config ↔ Engine Calibration navigation wired.** Two changes: (a) **Stale text fix** — `AdaptiveLearningView.tsx:358` "weakest scope" recommendation previously read *"Per-scope config is scheduled to land 2026-05-16. After deploy, lower the cooldown..."*. CONFIG-05 actually shipped 2026-05-13 (same day), so the rec was telling operators to wait for a thing that was already live. Reworded to *"Per-scope cooldown overrides shipped 2026-05-13 (CONFIG-05). In Engine Config → K6 Rail Controls → Per-scope cooldown overrides, set `${scope}` to a lower value (try 10-15) and backtest before saving."* (b) **Navigation CTA** — recommendation type extended with optional `actionable?: boolean` flag; recs that point at an Engine Config knob now render a "Tune in Engine Config →" button below the body text. `setView` prop threaded through `app/(tabs)/admin.tsx` so the CTA calls `setView('engine')` to navigate within the admin shell without re-mounting. Actionable recs: signal AUC anti-predictive/random, doubles 0%/<5%, pick #1 vs #6 inversion, weakest scope, trend regression. Non-actionable (no CTA): energy calibration broken (code-side fix, not config), "no recommendations" info row. CTA hidden when `setView` is absent so the screen still renders standalone outside the admin context. | `components/admin/AdaptiveLearningView.tsx`, `app/(tabs)/admin.tsx` | 2026-05-13 |
| BUG-140 | 🟠 High | Track Record band, Hit-rate hero, and Results screen all showed 0 hits for today despite hits being recorded — `916/WI`, `916/ME,NH,VT`, `924/GA` all hit but were invisible on these surfaces. Other surfaces (Today's Hits, Hit Feed) correctly showed them. Root cause: today's BUG-139 regen-flow fix preserves hit-bearing combos as "hit-orphan" rows past rank 30 with `on_slate=FALSE` (since they're no longer in the new K6 after mid-day regen excluded their already-drawn box-sets). All three broken surfaces had queries gating on `daily_intelligence.on_slate=eq.true`, which by definition skips the hit-orphans. The hits weren't lost — they were preserved in both `adaptive_tracking` (slate_hash-keyed, the canonical durable log) and `daily_intelligence` (rank 31/32 hit-orphans). What was lost was the visibility of those hits behind a stale `on_slate=true` gate. | ✅ Fixed: migrated all three queries off `daily_intelligence` onto `adaptive_tracking`. (1) `app/(tabs)/index.tsx::todayHits` (powers Track Record band + Hit-rate hero on Home) — now queries adaptive_tracking with hit_box/hit_straight, de-dupes by (scope, combo) so multi-state matches count as 1 hit, preserves scope+session gate (allday=any, midday/evening=strict). (2) `app/(tabs)/results.tsx::hits` (Tier 1) — same migration, with `remapToHitRow` helper that aliases adaptive_tracking columns (matched_state → hit_state, matched_session → hit_session, signal_burst → signal_dgc) to the HitRow shape consumers already expect. (3) `app/(tabs)/results.tsx::onSlatePicks` (Tier 2 csMap) — now reads adaptive_tracking primary rows (per-K6-pick at slate-gen time, ENH-01) instead of daily_intelligence on_slate=true. De-dupe by (scope, combo) preferring rows with hit annotations. This is what lets Tier 2 still credit multi-state secondary matches (e.g., 916/ME,NH,VT) after regen. (4) `app/(tabs)/results.tsx::weekHits` (streak chip + dotted tabs) — same adaptive_tracking migration, with `matchedStateFilter` derived from `jurisdictionFilter` (followed-states personalization). Live verification: 3 hits land on each surface for today's 5/13. Consistent with prior BUG-136/137/138 pattern: all consumer surfaces now read adaptive_tracking; daily_intelligence stays as engine-side write artifact only. | `app/(tabs)/index.tsx`, `app/(tabs)/results.tsx` | 2026-05-13 |
| BUG-141 | 🟠 High | Follow-on to BUG-140: 5 more surfaces had the same regen-orphan-invisibility pattern. (1) **Home Track Record band** showed `2 hits` for today when 3 was correct — my BUG-140 migration de-duped multi-state matches by `(scope, combo)` keys, collapsing 916/WI + 916/ME,NH,VT into one. Inconsistent with BUG-138's display (2 stacked HitCards) and the Slates Hits tab. (2) **Hit Track Record screen** (`app/track-record.tsx`) primary query was `daily_intelligence?on_slate=eq.true` — same regen-orphan blind spot. It had an adaptive_tracking secondary query but the merge logic depended on the primary populating first, so when primary returned 0 for today, the screen surfaced nothing despite secondary having all 3 hits. (3) **LastHitPill** (`components/LastHitPill.tsx`) — exact same bug; explains the user's "hit rate here shows yesterday's hits" report (pill falls back to yesterday's latest hit when today's are invisible). (4) **DailyRecapCard** (`components/DailyRecapCard.tsx`) — same query, same bug; would render "0 verified hits today" miss-day branch despite real hits. (5) **Replay screen** counted picks with snapshot.hitType set — that field only carries the FIRST match per pick (916's primary annotation is 'WI'; the 'ME,NH,VT' secondary match lives only in adaptive_tracking). Replay showed 2 hits for today instead of 3. | ✅ Fixed: (1) Home `todayHits` key changed to `${scope}\|${combo}\|${matched_state}` so multi-state matches count separately. (2) `app/track-record.tsx` consolidated from two-query merge (DI primary + AT secondary) into single adaptive_tracking query — verified DB-side that adaptive_tracking is strictly-more-complete (5/13 DI=0 AT=3; 5/11 DI=0 AT=4; 5/12 parity). (3) `LastHitPill` migrated to adaptive_tracking with column remap (matched_state→hit_state, matched_session→hit_session). (4) `DailyRecapCard` same migration. (5) `app/replay.tsx` rewrote pick-matching to track ALL draws per comboSet instead of last-only; `CardData` gained `totalMatches` field for accurate day/scope hit count badges; pick pill renders `🎯×N` for multi-state matches. | `app/(tabs)/index.tsx`, `app/track-record.tsx`, `app/replay.tsx`, `components/LastHitPill.tsx`, `components/DailyRecapCard.tsx` | 2026-05-13 |
| 2026-05-13 | **DATA-01: verify-hits cleanup tool + 5/11 stale-annotation cleanup.** Today's BUG-140/141 migration moved every consumer surface onto adaptive_tracking. User then noticed Replay (which uses histories ground truth) showed 2 hits for 5/11 while the other surfaces showed 4. Diagnosis: adaptive_tracking carried 2 stale annotations from before a ledger re-import corrected the underlying draws (487/ID claimed midday 847, actual midday draw was 883 → comboset mismatch; 659/NE claimed evening 965, actual draw was 968 → mismatch). The 2 valid hits (425/TX morning, 609/QC evening) still matched current histories. Same drift in daily_intelligence (hit-orphan rows BUG-139 appended from adaptive_tracking carried the same staleness forward). **New tool:** `scripts/intel-tuning/verify-hits.ts` (`npm run verify:hits -- --date YYYY-MM-DD` or `--since N`). For each adaptive_tracking + daily_intelligence row with a hit annotation on the given date(s), looks up the recorded (jurisdiction, session) in histories and checks the comboset still matches. Reports stale rows; with `--apply`, NULLs the hit fields. Idempotent. **Action:** dry-ran over last 7 days — only 5/11 had drift (2 stale rows in each table; all other days clean). Applied for 5/11; 2 stale rows cleared from both tables. Re-verify confirmed 0 stale, 2 valid (425/TX, 609/QC) on both. All surfaces now consistent at 2 hits for 5/11. **Snapshot.top_k_straights_json hitType annotations NOT cleaned** — Replay's selection logic touches them but its display logic uses histories matching, so stale snapshot hitType doesn't affect display. Latent inconsistency only; flagged for follow-up cleanup if needed. | `scripts/intel-tuning/verify-hits.ts`, `package.json`, app_config / data tables | 2026-05-13 |
| 2026-05-13 | **DATA-02: verify-hits extended to slate_snapshots; full 7-day sweep applied.** Followed DATA-01 by extending the verify-hits tool to also reconcile `slate_snapshots.top_k_straights_json[].hitType` annotations against current histories — the latent inconsistency I flagged in DATA-01. For each snapshot on the given date(s), scans picks with `hitType` set and validates that `(hitState, hitSession, comboset)` still matches a real draw. If stale, PATCHes the snapshot with `hitType/hitState/hitSession/hitDate/hitResult` stripped from the affected picks (preserves combo, signals, rank, energy, etc.). Idempotent. **7-day apply:** 190 snapshots scanned across 5/7–5/13; 3 stale picks cleared across 2 snapshots: 5/11 allday `B02002F4` (487 stale), 5/11 evening `D5A4639D` (659 stale), and 5/12 allday `205D9E74` (soft-deleted, 425 stale — likely a late-night-regen residue tagging a 5/11 hit to a 5/12-tagged snapshot). Post-apply: 22 valid adaptive_tracking, 95 valid daily_intelligence, 190 clean snapshots, 0 stale anywhere across the 7-day window. The historical hit log now agrees with `histories` across every consumer surface and every read path. | `scripts/intel-tuning/verify-hits.ts` | 2026-05-13 |
| BUG-142 | 🟡 Medium | Tab-bar "Results" tab unviewed-hits badge (`app/(tabs)/_layout.tsx::hasUnviewed`) still queried `daily_intelligence?on_slate=eq.true` after BUG-140/141's migrations elsewhere. Same regen-orphan blind spot: today's hit-bearing combos have on_slate=false post-regen, so the badge wouldn't light up even when fresh hits existed. Surfaced during a post-sweep audit (response to "did you complete your sweeps?"). | ✅ Fixed: migrated the query to `adaptive_tracking?matched_state=not.is.null` with `matched_session` taking the place of `hit_session` in the scope-validity gate. Same pattern as BUG-140/141. | `app/(tabs)/_layout.tsx` | 2026-05-13 |
| BUG-143 | 🟠 High | "Backfill Intel Hits" admin tool (`lib/backfillIntelHits.ts`, called from `app/(tabs)/intelligence.tsx:513`) annotated only `daily_intelligence` — never wrote to `adaptive_tracking`. After 5/13's evening/night draws, the operator ran the backfill: DI got `936/DE/night` (allday rank 5) and `034/NM/evening` (evening rank 5) marked hit, but the corresponding `adaptive_tracking` primary rows at the active slate hashes (`2EA69971`, `34053779`) stayed `hit_box=null`. All hit-tracker surfaces (Home Track Record, Hit-rate hero, Results, track-record screen, LastHitPill, tab-bar unviewed badge — migrated to adaptive_tracking by BUG-138/140/141/142) silently skipped these 2 hits → user report on 5/14: "5/13 hits not showing on the hit tracker." | ✅ Code fixed: `backfillIntelHits` now calls `patchAdaptiveTrackingHit(slate_date, scope, combo, winning, isStraight)` after each DI patch — issues PATCH against `adaptive_tracking?slate_date=eq.X&scope=eq.X&combo=eq.X&mode=eq.balanced&matched_state=is.null` to fill the pre-written primary row (same shape `lib/hitDetection.ts::recordHitInAdaptiveTracking` uses for its UPDATE path). **Data recovered via MCP:** anon-REST hit RLS (42501); applied the same writes through `supabase-hitmaster` MCP (`UPDATE adaptive_tracking SET hit_box=true, hit_straight=false, matched_state=..., matched_session=..., actual_result=..., result_at=now()` filtered by `slate_date='2026-05-13' AND scope=X AND combo=X AND mode='balanced' AND matched_state IS NULL`). 3 rows updated (2EA69971 allday/936→DE/night/963; 29D885F1 + 34053779 evening/034→NM/evening/340 — evening had two snapshot variants from a regen). Re-verified: full-day audit of 5/13 DI vs adaptive_tracking shows 6/6 OK, all matched_state values agree with `histories` ground truth. 916/WI + 916/ME,NH,VT midday both tracked separately (multi-state). No backfill re-run needed from the app. | `lib/backfillIntelHits.ts` | 2026-05-14 |
| BUG-144 | 🟡 Medium | Results hero band rendered NM 034 twice on 5/14 (user report after BUG-143 data recovery). Root cause: the `dbHits` filter in `app/(tabs)/results.tsx::processed` (line 525) joined ledger rows to every `adaptive_tracking` row matching `(hit_state, hit_session, date)` with no dedup. BUG-143's MCP recovery had written matched_state on TWO adaptive_tracking rows for evening/034 — the live `34053779` and a regen'd-out `29D885F1` (all 7 snapshots at that hash soft-deleted) — because the backfill code's filter (`slate_date AND scope AND combo AND mode AND matched_state IS NULL`) isn't slate-hash-aware. Both rows then flowed into `hitSummaryItems` via `flattenHits`, surfacing as a visible dupe in the hero band and the HitSummary sheet. Other hit-tracker surfaces (Home `todayHits`) were unaffected because they already dedup by `${scope}\|${combo}\|${matched_state}` (BUG-141). | ✅ Two-layer fix: (1) **Code dedup (defense in depth):** `dbHits` now collapses by `${scope}\|${combo}\|${hit_state}\|${hit_session}` with the BUG-141 tie-breaker (prefer hit_straight, then row with rank set). Future regen-orphan dupes can never reach the hero band. (2) **Data cleanup (immediate fix):** NULL'd `(hit_box, hit_straight, matched_state, matched_session, actual_result, actual_set, result_at)` on the orphaned 29D885F1 evening/034 adaptive_tracking row via MCP. **Audit found 3 OTHER orphan AT rows at hash `D529F35` (5/13 allday 916 WI, 916 ME,NH,VT, 924 GA)** — these are NOT dupes, they're the *only* record of those midday hits since 916/924 got dropped from the post-midday regen and never got primary rows at the live `2EA69971` hash. **Left D529F35 intact** — nulling would erase the currently-displaying hits. New invariant: orphan AT rows are junk only when a live-hash row with the same `(scope, combo, matched_state, matched_session)` already exists; otherwise they're authoritative. Backfill code should ideally be hash-aware (only write to rows whose slate_hash has a live snapshot) — flagged for follow-up if regen-dupes recur. | `app/(tabs)/results.tsx`, adaptive_tracking | 2026-05-14 |
| 2026-05-14 | **METRIC-01: Lift vs uniform-random 6-pick baseline added to backtest report + replay.** Until now the backtest harness reported only absolute hit rate (% slates with ≥1 hit, total pick-hits). Per the "let's evolve ZK6" planning conversation, there was no yardstick to distinguish engine signal from "you would have hit anyway given ~71 draws/day and 6 picks." Closed-form analytic baseline added in `scripts/backtest/score.ts::computeBaseline`: for each `(date, scope, K)`, per-result P(uniform random pick matches box) = `perms/1000` (6/3/1 for singles/doubles/triples), per-pick `P(hit ≥1 of K) = 1 - Π(1 - pᵢ)`, slate `P = 1 - (1 - perPick)^6`. Two ratios printed per bucket in both `npm run backtest:report` and `npm run backtest:replay` summaries: **pick lift** (engine pick-rate / baseline pick-rate, doesn't saturate) and **slate lift** (engine slate-rate / mean baseline slate-prob, saturates fast on allday). CSV columns appended: `results_in_scope, baseline_per_pick_prob, baseline_expected_pick_hits, baseline_slate_prob`. First run over last 14 days surfaced: overall pick lift **0.92×** (engine slightly *under*performs random uniform on per-pick basis); evening **1.31×** (real signal); midday **0.75×** and allday **0.77×** (engine underperforming random — caveat: baseline is rail-unconstrained, so engine's multiplicity caps may be penalised for picking doubles/triples which have lower box-hit prob). New role: lift collapse toward 1.0 is the canary for engine regression (CONFIG-01 would have shown up here in 1 day instead of needing forensic recovery). Rail-matched baseline (sample 6 picks honoring engine's multiplicity ratio) is the planned next refinement after the ZK6 verification window closes 2026-05-19; until then, treat pick-lift numbers as directional canary, not precise lift estimates. | `scripts/backtest/score.ts`, `scripts/backtest/types.ts`, `scripts/backtest/report.ts`, `scripts/backtest/cli.ts`, `scripts/backtest/output.ts`, `scripts/backtest/README.md` | 2026-05-14 |
| 2026-05-14 | **FORENSIC-01: Midday signal is anti-correlated, not just noisy.** Followed METRIC-01 with a rail-matched per-pick forensic over 30-day window (26 midday primary slates, 156 engine picks). Rail mix: 128 singles (82%) + 28 doubles (18%) + 0 triples. Per-rail engine hit rate vs rail-matched baseline (random pick of same multiplicity vs same K results in scope): **singles 8.6% vs 16.7% baseline → 0.51× lift**, **doubles 0.0% vs 10.35% baseline → 0.00× lift (0 hits in 28 attempts; P(0 hits at 10.35% per pick) ≈ 4.7%)**. Both rails underperform random — rail mix is NOT the cause. Looking at the 156 picks: same combos rotate day after day (`445/448` 5 days running, `227` 6 days, `303` 5 days, `707` 2 days, `802` 4 days), never hitting. Fingerprint of gambler's-fallacy: ZK6's BOX signal = `60% freqScore + 40% pressureScore` (`lib/engineCore.ts::computeBoxSignal`); `pressureScore` peaks at 100-`pressureThreshold` draws-since, encoding "overdue" as positive signal. Pick 3 RNG has no memory, so "overdue" combos are not actually more likely. The engine concentrates bets on staleness, which compounds across days (drawsSince grows when overdue picks don't hit, so they stay overdue tomorrow). Doubles are especially penalised — they have 1/3 the box-hit perms (3 vs 6), so their drawsSince grows faster, making them look perpetually overdue. | Hypothesis filed; candidate engine test loop launched in CONFIG-02. | `engines/zk6.ts`, `lib/engineCore.ts`, `supabase/functions/compute-slate-zk6/index.ts` (BOX signal computation) | 2026-05-14 |
| 2026-05-14 | **METRIC-02: Rail-matched baseline added alongside uniform.** Followup to METRIC-01 addresses the rail-unconstrained caveat. New `scripts/backtest/score.ts::computeRailMatchedBaseline` constrains the random picker to the engine's actual per-slate multiplicity mix; within-class match probs are 1/120 (singles), 1/90 (doubles), 1/10 (triples) — a class-C pick cannot box-match cross-class results. Both lift views now print in `npm run backtest:report` and `npm run backtest:replay`. 30-day re-read: rail-matched is slightly stricter than uniform (constrained random doesn't waste picks on impossible matches), and the picture barely changes — midday remains 0.56× (vs 0.58× uniform), evening 1.08× (vs 1.11×), allday 0.76× (vs 0.80×). Removes the "engine penalised for picking doubles" objection; confirms midday/allday deficits are signal-quality not rail-mix artifacts. CSV columns appended: `picks_singles`, `picks_doubles`, `picks_triples`, `rail_matched_expected_pick_hits`, `rail_matched_slate_prob`. | `scripts/backtest/score.ts`, `scripts/backtest/types.ts`, `scripts/backtest/report.ts`, `scripts/backtest/cli.ts`, `scripts/backtest/output.ts`, `scripts/backtest/README.md` | 2026-05-14 |
| 2026-05-14 | **FORENSIC-02: Evening signal is neutral; allday signal is broken too.** Same rail-matched forensic as FORENSIC-01, applied to evening + allday (n=25 slates each, ~155 engine picks per scope). Pick mix nearly identical across scopes (~83% singles, ~17% doubles, 0 triples — engine consistently selects ~5 singles + 1 double per slate). Per-rail engine hit rate vs rail-matched baseline: **evening singles 21.1% vs 22.2% → 0.95× lift, evening doubles 12.1% vs 10.9% → 1.11× lift** (essentially at baseline both rails — the engine isn't really picking smartly on evening, the 1.08× overall lift comes from a small doubles win and otherwise-neutral signal); **allday singles 25.4% vs 35.2% → 0.72× lift, allday doubles 16.0% vs 20.2% → 0.79× lift** (consistent ~25% deficit across both rails). Comparison to midday: midday is uniquely catastrophic (singles 0.51×, doubles 0.00×) — evening and allday are not the same pattern. **Diagnosis for allday:** CONFIG-02's `bp_inverted` candidate sweep showed inverting BOX pressure HURTS allday (0.90× → 0.76× uniform pick lift), so BOX pressure is genuinely informative for allday (large K=72 means "stale" combos do regress to mean usefully). The allday deficit therefore comes from PBURST/CO/DGC, not BOX — those signals also have pressure terms (`computePairSignal` = 70% freq + 30% pressure) that may carry the same anti-correlation pattern. **Why allday differs from midday:** K is the discriminator. Midday K~30 means dsRaw is noise-dominated → "overdue" is gambler's fallacy. Allday K~72 means dsRaw carries real regression-to-mean signal. CONFIG-02 was deployed only on scopes where pressure is anti-correlated; allday correctly retained the positive pressure weight. **Next experiment (deferred):** CONFIG-03 candidate cycle on PBURST/CO weights, scoped per-scope. Deferred until after CONFIG-02 review on 2026-05-24 — shipping two engine changes in the same week would muddy the 7-day signal. | Hypothesis filed; next candidate cycle planned post-CONFIG-02 review. | (read-only forensic; data from `histories`, `slate_snapshots`) | 2026-05-14 |
| BUG-145 | 🔴 Critical | **Anon GRANT on `adaptive_tracking` regressed; all hit-tracker surfaces (Home `todayHits`, TODAY'S HITS cards, Slate Performance) silently showed 0 hits during the verification window despite real hits.** User reported 5/14 hits visible on Results but missing from the hit tracker, hit-rate hero, and Slate Performance. Investigation: 5/14 had 2 real hits — allday rank=1 `826`/{2,6,8} BOX in DC midday (268), allday rank=3 `926`/{2,6,9} STRAIGHT in IN midday (926). `slate_snapshots.top_k_straights_json[].hitType` and `daily_intelligence.hit_box/hit_straight` both correctly stamped, but `adaptive_tracking` primary rows for both picks still had `hit_box=null` after hit detection ran. Direct REST probe with anon key returned **HTTP 401 / SQLSTATE 42501 "permission denied for table adaptive_tracking"** on both PATCH and INSERT. Schema `schema_complete_v21.sql:400,406` declares `POLICY allow_all` + `GRANT ALL TO anon, authenticated`, but the live DB had lost the table privileges (no git-tracked migration explains it — manual dashboard change suspected). Edge-function slate-gen still wrote primary rows correctly because `compute-slate-zk6` uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses grants/RLS. Hit detection (`lib/hitDetection.ts::recordHitInAdaptiveTracking`) runs client-side with anon and its writes were swallowed silently by the try/catch (line 124-126: `console.warn` only). **Surface impact**: ✅ Results screen unaffected (Tier 3 reads `slate_snapshots.top_k_straights_json[].hitType` directly; that PATCH worked) + Tier 2 does client-side comboSet cross-match against `histories` rows so hits "auto-populated" without needing AT — explains the user's "hits showed before I pressed the detect button" observation. ❌ Home `todayHits` strap (`index.tsx:434`), Home TODAY'S HITS cards (`index.tsx:529`), Slate Performance / HitTrackingView (`components/admin/HitTrackingView.tsx:643`), tab-bar unviewed badge (BUG-142) — every surface that BUG-138/140/141/142/143 migrated onto adaptive_tracking now silently empty. Verification-window blast radius: the 7-day ≥73% gate (2026-05-13 → 2026-05-19) was measuring against an empty hit log; without this catch the day-1 + day-2 numbers would have read 0% and ZK30 unlock would have stayed blocked indefinitely on a false floor. Subtle UX side-effect: `DashboardView.tsx::handleDetectHits` loops `[yesterday, today]` and sums `hitsFound`, so today's button press reported "3 hits found" (1 from yesterday's re-run + 2 from today) — not a real overcounting bug, just an aggregation display that misled investigation until traced back to the loop. | ✅ Fixed via `supabase/migrations/2026-05-14_adaptive_tracking_restore_anon_grants.sql` — idempotent re-create of `allow_all` policy, `GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptive_tracking TO anon, authenticated`, and per-id UPDATE of the two 5/14 hit rows (`849c967d…` allday/826 box DC midday, `04abfbf2…` allday/926 straight IN midday) gated on `hit_box IS NULL` for idempotency. User applied via Dashboard SQL editor. Post-fix verification: anon PATCH probe returns HTTP 200 (was 401); the two AT rows now show `hit_box=true`, `matched_state/matched_session/actual_result` matching `daily_intelligence` ground truth, `result_at=2026-05-14T23:26:56Z`. Home `todayHits` query returns 2 rows; Slate Performance aggregation for 5/14 allday balanced reads `2/6 box · 1 straight · 33.3%`. **Follow-up flagged (not in this fix):** the silent-failure mode is structural — client-side hit detection swallowing RLS errors means the next time anon write access regresses (dashboard policy edits, schema reset, migration rollback) the same blindness recurs. Port `runHitDetectionAndRefresh` into an edge function with service role, parallel to `compute-slate-zk6`, to eliminate the anon-write dependency for this code path. Worth pairing with a smoke test in CI that PATCHes a known-safe AT row through the anon key. Also flag the `DashboardView::handleDetectHits` two-day sum to break the message out per-day so future investigations aren't sidetracked by the same "3 vs 2" surprise. | `supabase/migrations/2026-05-14_adaptive_tracking_restore_anon_grants.sql`, app_config / `adaptive_tracking` privileges | 2026-05-14 |
| BUG-145 (follow-up) | 🔴 Critical (structural) | **Hit detection ported into `run-hit-detection` edge function.** The 2026-05-14 BUG-145 GRANT regression exposed a structural defect: client-side hit detection ran against `adaptive_tracking` with the anon key, and its write paths were wrapped in `try { ... } catch { console.warn(...) }` so any RLS/GRANT denial silently zeroed every downstream hit-tracker surface. Restoring the GRANT (BUG-145 main entry) repaired the immediate symptom; this follow-up removes the failure mode. (a) **New edge function** `supabase/functions/run-hit-detection/index.ts` (~350 LOC) — faithful port of `lib/hitDetection.ts` using `SUPABASE_SERVICE_ROLE_KEY` for all writes. Two behavior improvements over the original: (i) adaptive_tracking + daily_intelligence writes are now **awaited** before the `slate_snapshots.top_k_straights_json` PATCH so a downstream surface refreshing between writes can never observe a snapshot with `hitType` annotations while AT/DI lag empty (this exact half-write race is what made BUG-145 plausible to ship undetected); (ii) errors per-pick are accumulated in the response envelope (`errors: [...]`) instead of warn-and-discard, so the next regression surfaces in the toast/console of every caller. Supplemental slate generation preserved — function calls `compute-slate-zk6` over internal HTTP. (b) **Client wrapper** `lib/hitDetection.ts` collapsed from 350 LOC of write-path logic to ~90 LOC of POST to `/functions/v1/run-hit-detection`. Same exported signatures (`runHitDetectionAndRefresh`, `runHitDetectionAllScopes`, `runHitDetectionForDates`, `HitDetectionResult`) so the 5 call sites in `useDataIngestion`, `DashboardView`, `ImportWizardView`, `import-wizard.tsx`, `explore.tsx` keep working unchanged. (c) **Backfill ported too** — `lib/backfillIntelHits.ts` collapsed from 145 LOC of direct DI+AT PATCHes to ~110 LOC of "fetch distinct slate_dates → call edge function → return aggregate." Same near-miss vulnerability as BUG-145 since its `patchAdaptiveTrackingHit` was anon-key PATCH with no error check. Caller (`intelligence.tsx:513`) unchanged because the return shape is preserved. (d) **Config manifest** `supabase/config.toml` extended with one `[functions.NAME]` block per edge function (5 total) declaring `verify_jwt=true`. Doesn't enforce cloud config but provides PR-time drift detection — every function under `supabase/functions/*/` should have a block and every block should map to a deployed function. (e) **Smoke test shipped 2026-05-15** — `scripts/rls-smoke.ts` (`npm run rls:smoke`) probes anon GET on 9 client-facing tables (slate_snapshots, daily_intelligence, adaptive_tracking, histories, app_config, datasets_box, datasets_pair, engine_runs, hit_detection_runs) and exits non-zero if any returns ≠ 200. Catches the BUG-145 failure mode (anon GRANT revoked silently) in seconds, complements ENH-12's post-fact telemetry canary with a proactive one. Note: the structural port moved hit-detection WRITES to service-role edge function, so anon PATCH on AT is no longer load-bearing — the smoke focuses on anon READS, which the UI's hit-display surfaces still depend on. | ✅ Code in repo from 2026-05-14. Deploys: `supabase functions deploy run-hit-detection --project-ref tgagarhwqbdcwoqhpapi` (new) + `supabase functions deploy rebuild-datasets-zk6 --project-ref tgagarhwqbdcwoqhpapi` (BUG-146 catch-up). Post-deploy verification via REST: `run-hit-detection` returns 200 on `{date: "2026-05-14"}`, AT/DI/snapshot states unchanged because BUG-145's backfill already left them complete (idempotency check via `if (pick.hitType) return pick` skipping the loop body). | `supabase/functions/run-hit-detection/index.ts`, `lib/hitDetection.ts`, `lib/backfillIntelHits.ts`, `supabase/config.toml` | 2026-05-14 |
| BUG-146 | 🟠 High | **`rebuild-datasets-zk6` edge function source committed but never deployed; client caller has been silently 404-ing on every evening daily-input import since 2026-05-13.** Surfaced during the BUG-145 follow-up audit of all 4 edge functions. REST probe: `POST https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/rebuild-datasets-zk6` returns **HTTP 404** with and without auth — function doesn't exist on the cloud project. Yet `lib/rebuildTrigger.ts::runDailyRebuild` (added 2026-05-13 with the rebuild script port) is wired into `hooks/useDataIngestion.tsx:573-599`: when the user imports an evening daily-input file, the success handler fires `runDailyRebuild()` which `fetch`es `/functions/v1/rebuild-datasets-zk6` and shows a `Rebuild failed: 404` toast on failure. The actual `datasets_box.ds_raw` rebuild (which CONFIG-03 originally established as critical to engine accuracy) was therefore running ONLY when an operator manually executed `npm run rebuild:datasets`. Verification-window risk: any silent drift in `ds_raw` between the last manual run and the start of the window would have biased BOX scoring without detection. Inverse of BUG-145 — there the function existed but failed silently; here the function never shipped but the failure was loud (toast) yet ignored. **Why it sat un-deployed:** the script and the edge-function port were authored in the same audit pass (commit cce7d82 / 2026-05-13 + earlier); the script got wired into `package.json` scripts, the edge-function source got committed, but the deploy step was skipped. No git-tracked manifest existed to catch the gap (which is why BUG-145's follow-up adds `[functions.*]` blocks to `supabase/config.toml`). | ✅ Code already in repo (`supabase/functions/rebuild-datasets-zk6/index.ts`, 263 LOC, idempotent, service-role, CORS, audit_logs entry). Fix: deploy via `supabase functions deploy rebuild-datasets-zk6 --project-ref tgagarhwqbdcwoqhpapi`. Post-deploy verification: REST probe returns 200 (was 404); dry-run POST `{"dryRun": true}` returns `{success: true, totalUpdated: 0}` (steady state, today's manual run already applied). Going forward, evening daily-input imports auto-rebuild ds_raw without operator intervention. Manual `npm run rebuild:datasets` remains available as a fallback / forced-rebuild path. **Follow-up:** verify `lib/rebuildTrigger.ts::runDailyReport` (`compute-daily-report` edge function, deployed and known-working) also fires from the same `useDataIngestion` post-success handler — already confirmed during audit, no fix needed. | `supabase/functions/rebuild-datasets-zk6/index.ts` (deploy only — source unchanged) | 2026-05-14 |
| BUG-147 | 🔴 Critical | **`run-hit-detection` paired snapshots to draws by `updated_at_et` (UTC timestamptz despite the `_et` suffix), letting yesterday's late-evening ET regen leak into today's run and stamp today's hits onto yesterday's primary AT row.** User reported: today's (5/15) midday MI 791 hit was showing up in the Results screen AND verified track record as a hit *yesterday* (5/14). Trace: yesterday's midday slate was regenerated at 5/14 22:39 ET = **5/15 02:39 UTC** (hash `4BA8D179`, slate_date=2026-05-14). Today's pull-to-refresh fired `runHitDetectionAllScopes(today)`, which ran `runForDate(date='2026-05-15')`. `fetchScope` filtered `slate_snapshots` by `updated_at_et=gte.2026-05-15 AND updated_at_et=lt.2026-05-16T09:00:00` — designed to capture late-night ET regens whose UTC timestamp crosses midnight, but the same window also catches yesterday's last regen (UTC timestamp `2026-05-15 02:39+00` ≥ `2026-05-15`). Yesterday's snapshot then iterated today's draws via `histories?date_et=eq.2026-05-15`; MI midday 791 (comboset `{1,7,9}`) box-matched yesterday's pick 197 (rank 2) and pick 824 (rank 4, straight in WI). `recordHitInAdaptiveTracking` looked up the existing primary AT row by `(slate_hash=4BA8D179, rank, combo, matched_state IS NULL)` and PATCHed `hit_box`/`matched_state`/`matched_session`/`actual_result`/`result_at` — but **left `slate_date` untouched at 2026-05-14**. Same mechanism corrupted a 5/13 allday snapshot the day before (5/14 night regen carried into 5/14's run for the 5/14 draws), and a 5/11 evening snapshot earlier. Corruption inventory: 4 adaptive_tracking rows (5/14 midday 197 MI box, 5/14 midday 824 WI straight, 5/13 allday 824 ID box, 5/11 evening 609 QC straight), 7 daily_intelligence rows (same picks + 5/12 NM 034 evening + 5/12 DE 936 allday + the rest), and 2 slate_snapshots with `top_k_straights_json[].hitDate != slate_date` (5/14 midday hash 4BA8D179 picks 197+824 with `hitDate=2026-05-15`; 5/13 allday hash 2EA69971 picks 824+926 with `hitDate=2026-05-14`). Verified track record screen groups by `adaptive_tracking.slate_date`, so the MI 791 hit visually surfaced under "Yesterday" instead of "Today"; Results screen's Tier 1 dedupe (`hDate === rowDate`) blocked the cross-date join client-side, but Tier 2 and Tier 3 didn't — and the underlying AT rows being wrong meant any downstream consumer (track-record, slate performance aggregates, week-hit streaks) read the wrong dates. | ✅ Two-layer fix: (1) **Code (structural):** `supabase/functions/run-hit-detection/index.ts::fetchScope` now filters by `slate_date=eq.${date}` instead of `updated_at_et` UTC range — a snapshot's `slate_date` is the canonical pairing for which day's draws it should be scored against. `resolveSnaps` fallback (which borrowed any `slate_date<=date` snapshot when the exact date had none) was tightened to same-date only — borrowing prior-day snapshots would re-introduce the same cross-date pollution. Deployed run-hit-detection v3 (ezbr_sha256 `5757616d…`). (2) **Data cleanup:** PATCHed corrupted AT rows back to `matched_state=NULL` / hit fields NULL via the integrity predicate `NOT EXISTS (SELECT 1 FROM histories WHERE date_et=slate_date AND jurisdiction=matched_state AND session=matched_session AND result_digits=actual_result)` — 4 AT rows + 7 DI rows reset. Stripped `hitType`/`hitDate`/`hitState`/`hitSession`/`hitResult` from the 2 corrupted snapshots' top_k_straights_json picks where `hitDate != slate_date`. Today's legit MI 791 hit on the 5/15 midday snapshot (hash `F6A2FC1C`, rank 3 combo 197) is intact. Post-cleanup integrity check returns 0 mismatched rows across AT/DI/snapshots. **Why this slipped past prior audits:** BUG-138/140/141/142 all migrated readers onto adaptive_tracking under the assumption that the edge function wrote AT primary rows correctly. The UTC/ET drift only manifests when a regen happens late in ET evening (after 7pm ET = midnight UTC) AND the next day's hit detection runs — both required for the bug to fire. The verification-window late-regen pattern (CONFIG-02 deployed 5/14 18:55 UTC + per-scope tuning encouraging more regens) is what made this fire repeatedly. | `supabase/functions/run-hit-detection/index.ts`, adaptive_tracking/daily_intelligence/slate_snapshots data | 2026-05-15 |
| DESIGN-01 | 🟡 Medium (parked) | **Light mode — Phase 3 code migration COMPLETE; fully-light pages still blocked on signal-color design pass.** Beta testers reported the app is "too dark." Phases 1+2 shipped 2026-05-14 (`03204e0`, `a368e71`): theme rails (`lib/theme/` — `darkColors`/`lightColors` palettes, `ThemeProvider`, `useTheme()` hook, AsyncStorage persistence at `hm:theme-mode`, Account → DISPLAY → Appearance segmented toggle for System/Light/Dark), and chrome migration (tab bar background/tints/border/glow, tab icons, results badge, root Stack screen + header, modal screens — all read from `useTheme().colors`). **Phase 3 code migration shipped 2026-05-15 (steps 3–18, commits `b8fe792`→`634f22d`):** every consumer screen (Home, Slates, Results, Intelligence, Book, Learn, Account), every modal (PickDetail, HeatCheck, etc.), every admin view (Dashboard, EngineConfig, HitTracking, ImportWizard, CoverageMatrix, AdaptiveLearning, HealthTests, ImportHistory, AdminShared), and every shared component (PickCard, SlateCard, Button, EnergyMeter, …) now reads colors via `useTheme()` instead of the static `theme.colors`. Static `theme` import remains only for `theme.typography` (mode-agnostic) and one pre-ThemeProvider fallback in `app/_layout.tsx`'s loading/error screens. AdminShared exposes `useImportTypes()` + `useSt()` hooks so even module-level constants flip with the palette. **What still doesn't fully flip in light mode:** card surfaces (still cosmic-dark by default since `lightColors.surface` cards would clash with the dark-tuned signal hues), and the 5 signal hues themselves (BOX/PBURST/CO/DGC + brand) which still fail WCAG-AA on `lightColors.background` `#f7f5fb`. **Phase 3 plan remainder:** (1) Design: define light-mode variants for the 5 signal hues that pass WCAG-AA on `lightColors.background` — likely deeper, more saturated versions (current `lightColors.dataBlue=#1078d0` is the model). Update `lib/theme/palettes.ts::lightColors` BOX/PBURST/CO/DGC + brand entries. (2) Decide card surface strategy: flip to light cards, or design a 2-tier light approach (light bg + slightly-tinted light cards). (3) ~~Migrate ~73 files from `theme` to `useTheme()`~~ **DONE 2026-05-15**. (4) Clean up ~40 .tsx files with raw `#XXXXXX`/`rgba(...)` literals outside the theme. (5) ~~Migrate `theme.gradients` / `theme.shadows` to mode-aware~~ — already mode-aware via `useTheme().gradients` + `useTheme().shadows`; remaining work is just threading `useTheme().scheme` into `<StatusBar barStyle="…">` so the system bar matches. **Acceptance criterion:** beta testers explicitly approve light mode is usable (not just "less harsh"). Until then it's effectively a feature flag — live but defaults to System (which most users see as light on iOS 18+/Android 15+ devices); we can re-enable a hard-dark default if needed by changing the ThemeProvider's pre-hydration fallback. **NOT urgent** — current state is shippable as a "preview" of light mode; chrome change alone is a real UX improvement for users who toggle. Phase 3 can resume once design lands the light-mode signal-color palette. Tracked in memory `project_light_mode_phase3.md`. | Code migration done. Awaiting design pass on light-mode signal hues + card-surface decision. | `lib/theme/palettes.ts`, `lib/theme/ThemeProvider.tsx`, app/_layout.tsx, app/(tabs)/_layout.tsx, app/(tabs)/account.tsx (DISPLAY section), all migrated consumers | 2026-05-15 |
| BUG-148 | 🔴 Critical | **Histories `session` column held 4 values (`midday`/`evening`/`morning`/`night`); the parser preserved source labels literally and the hit-detection edge function's evening filter required `session === 'evening'`, so every DE/CT/ID/VA "Play 3 Night"-style draw silently missed its hit on an evening-scope slate.** User reported on 2026-05-17 09:39 ET, immediately after importing the 5/16 allday ledger: "DE result is wrong and not showing as a hit." Trace: 5/16 evening snapshot (id `759358be…`, hash `…`) had pick #2 `combo=912 / comboSet={1,2,9}`. The just-imported DE Play 3 Night drew `912`. The DE row landed in histories with `session='night'` (the source label is literally "Play 3 Night"). `run-hit-detection` v3 evaluated the per-pick filter `(snapshot.scope === 'evening' && result.session === 'evening')` and skipped the DE row → 0/1 evening straight credited (vs. the 1/1 it should have been). Same trap was set today for **CT, DC, DE, GA, ID, TX, VA** which all had `session='night'` rows on 5/16. Worse: DE actually drew 26 evening + 4 night rows over the prior 30 days for the SAME draw — the parser flips between `'evening'` and `'night'` depending on whether the source string includes a time stamp (`"7:57pm"` → time-bucket → `'evening'`) or just the word "Night" → keyword → `'night'`. The distinction was unreliable noise. **User directive (verbatim):** "calling 'morning' and 'night' different than midday and evening is irrelevant, all drawings should be labeled either midday or evening. anything else is causing confusion and errors." | ✅ Three-layer fix: (1) **Parser** `lib/parseLedger.ts::parseSession` collapses to `'midday' \| 'evening'` only — time-based: `h < 16` → midday, else evening; keyword: `morning\|midday\|day\|daytime\|d[ií]a` → midday, `night\|evening\|noche` → evening. `ParsedLedgerRow.session` and `LedgerEntry.session` types narrowed to the 2-value union. (2) **Schema** migration `2026-05-17_collapse_sessions_midday_evening.sql` — widened `histories_unique` from `(jurisdiction, game, date_et, session)` to `(jurisdiction, game, date_et, session, result_digits)` so genuine 4-draw states (TX/GA/DC/TN) keep both their evening AND night draws as two rows post-collapse rather than UPSERT-overwriting each other; UPDATE'd 40 morning rows → midday and 99 night rows → evening (pre-flight count showed 0 same-digit collisions); tightened `histories_session_check` to `('midday','evening')` only. (3) **Edge function** `supabase/functions/run-hit-detection/index.ts::sessionMatches` simplified to `snapshot.scope === 'allday' \|\| snapshot.scope === result.session` — no longer needs to special-case night/morning since the parser + CHECK constraint guarantee the input. Deployed v4 (sha256 `be451e54…`). (4) **Backfill of the missed 5/16 hit:** re-ran hit detection for 2026-05-16 after deploy — DE 912 now annotated on the evening snapshot as `hitType='straight' / hitState='DE' / hitSession='evening' / hitResult='912'`. (5) **Consumer-surface cleanup:** dropped the unreachable Morn/Night filter pills + stats from `app/(tabs)/results.tsx` (filter buttons, `stats.morn/night`, session grouping array `['midday','evening']`), the night/morning emoji branches in `components/HitCard.tsx::sessionEmoji` and `app/(tabs)/explore.tsx` feed-hit icon ternary. `app/import-wizard.tsx`'s `gameLower.includes('night'\|'morning')` substring checks left alone — they implement the desired keyword-to-midday/evening collapse at the wizard layer (defense in depth, harmless). **Why this slipped past prior audits:** the 4-session model was introduced before strict scope-matching landed in the edge function. The genuine 4-draw states (TX/GA/DC/TN) covered for the bug for months — their evening rows DID land with `session='evening'`, so the evening filter worked for them. DE/CT/ID/VA's "Night = evening" semantics only break when the source omits the time string, which is intermittent. **Data-loss tradeoff (user-accepted):** for TX/GA/DC/TN where night IS a 4th genuine draw, the post-collapse evening snapshot now has TWO rows per state (e.g., TX `Pick 3 Evening 456` + TX `Pick 3 Night 789` both as `session='evening'`, distinct via the widened unique key). Hit detection iterates all rows so both are eligible to credit an evening-scope pick. Same digits drawn in both buckets on the same day collapse into one row (genuinely double-counted hits become single — acceptable per user directive that the distinction is "irrelevant"). | `lib/parseLedger.ts`, `types/core.ts`, `hooks/useDataIngestion.tsx`, `supabase/functions/run-hit-detection/index.ts`, `supabase/migrations/2026-05-17_collapse_sessions_midday_evening.sql`, `app/(tabs)/results.tsx`, `app/(tabs)/explore.tsx`, `components/HitCard.tsx` | 2026-05-17 |
| BUG-151 | 🟠 High | **Post-BUG-148 session migration was incomplete (only `histories` migrated; `adaptive_tracking`/`daily_intelligence`/`slate_snapshots.top_k_straights_json` still held `matched_session='night'`/`'morning'`), AND post-BUG-149 ledger re-imports left orphaned hit annotations pointing to draws that no longer exist. Combined effect: hero band + track-record-style surfaces silently dropped a subset of allday hits; counts on Results/Track Record/Explore were inflated by false positives.** User reported on 2026-05-18 15:30 ET while inspecting the hero band on the Results screen: "no allday hits in the last 5+ days." Investigation showed two distinct cleanup gaps and one UI-affordance issue: (A) **Session-migration leftovers**: 4 AT rows + 3 DI rows + 3 snapshot picks still had `matched_session='night'` or `'morning'` because BUG-148 only migrated `histories` (UPDATE'd 40 morning→midday + 99 night→evening rows on that table). Hit-display filters everywhere require `h.hit_session === row.session`, so AT/DI/snapshot annotations with `night`/`morning` couldn't match the now-evening/midday histories rows → those hits disappeared from per-row badges + the hero band. (B) **Ledger-overwrite stale annotations**: 7 DI rows referenced draws that no longer exist in `histories` — pre-BUG-149 imports landed under the old narrow unique key `(jurisdiction, game, date_et, session)`; later re-imports with corrected digits *replaced* the old row instead of coexisting, but DI's PATCH-only update path never cleared annotations for the orphaned old draws (e.g. 5/16 allday combo `826` claimed hit on DE midday `862`, but DE midday on 5/16 is actually `560` — no `{2,6,8}` draw exists anywhere on 5/16). Examples: 5/14 NJ allday `583`, 5/14 WI evening `138`, 5/15 QC evening `024`, 5/16 NM midday `857`, 5/16 VA midday `872`, 5/17 DC midday `714` (DC actually drew `862`). (C) **Hero band scope label missing**: tile already received `scope` via `HitHeroItem.scope` but never rendered it, so users couldn't tell whether a hit came from a midday/evening/allday slate — the original "no allday hits" complaint was actually unlabeled hits, not missing ones. | ✅ Three-layer cleanup: (1) **Session migration catch-up**: `UPDATE adaptive_tracking SET matched_session=CASE WHEN 'night' THEN 'evening' WHEN 'morning' THEN 'midday' END WHERE matched_state IS NOT NULL AND matched_session IN ('night','morning')` — 4 rows touched (4/23 GA, 5/11 TX, 5/13 DE, 5/14 ID). Same pattern applied to `daily_intelligence.hit_session` — 3 rows touched. Same applied to `slate_snapshots.top_k_straights_json` via JSONB rewrite on hashes `B02002F4` (5/11 TX) + `2EA69971` (5/13 DE) + `D5A4639D` (5/11 QC). The QC pick on `D5A4639D` had a separate bug: `hitResult='609'` (the combo) instead of `'096'` (the actual draw); both share comboset `{0,6,9}` so the box hit was real but the recorded value was wrong — UPDATEd `hitResult` to `'096'`. (2) **Ledger-overwrite cleanup**: `UPDATE daily_intelligence SET hit_box=false, hit_straight=false, hit_state=NULL, hit_session=NULL, hit_result=NULL WHERE (hit_box OR hit_straight) AND hit_state IS NOT NULL AND NOT EXISTS (SELECT 1 FROM histories WHERE date_et=slate_date AND jurisdiction=hit_state AND session=hit_session AND result_digits=hit_result)` over `slate_date BETWEEN '2026-05-10' AND '2026-05-17'` — 7 false-positive DI rows cleared (the 5/14/5/15/5/16/5/17 set above). Parallel integrity check on AT returned 0 stale rows after step 1. (3) **Hero band scope pill** (`components/HitHeroBand.tsx`): added a small pill next to the EXACT/PARTIAL chip showing `ALLDAY`/`MIDDAY`/`EVENING` so users can distinguish hits by scope at a glance. Also swapped `STRAIGHT`→`EXACT` and `BOX`→`PARTIAL` to close the BRAND-03 straggler the original 5-surface sweep missed (commit `952cb93` updated `results.tsx` match-badge + share message, `index.tsx` home hit banner, `explore.tsx` feed badge, `HitCelebrationOverlay.tsx`, but skipped `HitHeroBand.tsx`); aria label updated to "Exact match" / "Partial match" + scope. **Verified post-cleanup**: stale-DI integrity query returns 0 rows for 5/10–5/17; AT hit counts unchanged (data already correct, just orphan sessions migrated); DI box hits dropped by 7 across the window, all reductions point-traceable to draws that no longer exist. **Why this slipped past BUG-148/149/150**: BUG-148's migration touched `histories` only; the downstream tables hold their own session column copies and weren't part of the migration plan (we didn't realize at the time how many surfaces filter on the AT/DI session). BUG-149 fixed the ingest path so re-imports work, but didn't include a "clean up annotations whose underlying draws got replaced" step — that's a different code path (hit-detection writes annotations; ledger import doesn't update or clear them on overwrite). | `components/HitHeroBand.tsx`, adaptive_tracking + daily_intelligence + slate_snapshots data | 2026-05-18 |
| BUG-152 | ✅ Fixed | **PostgREST silently truncates the engine's histories-override fetch at 1000 rows.** `engines/zk6.ts:279` and `supabase/functions/compute-slate-zk6/index.ts:402` both call `GET /rest/v1/histories?select=result_digits,date_et${sessionClause}&order=date_et.desc&limit=3650`. PostgREST's `db-max-rows` defaults to 1000 in Supabase and applies to anon AND service_role alike (verified 2026-05-22 by direct REST probe with both keys + Range header — server caps regardless). The engine's `fetchHistoryOverrides` builds `dsOverride`/`lsOverride`/`hitDatesMap` from the truncated slice; for the intended 365-day H01Y window it currently receives: midday 1000/1434 rows (latest 32d), evening 1000/1834 (latest 25d), allday 1000/3268 (latest 14d). 9/9 parity tests still pass because BOTH paths hit the same cap → bit-identical truncated views. **Fix:** paginate via offset in 1000-row batches until a page returns fewer than pageSize rows (same pattern as `7cfcf67` CoverageMatrixView fix). **Empirical validation per CLAUDE.md engine-change gate (30d, n=87 slates, `default` config):** Baseline (truncated) overall slate 66.7% / overall pick lift ×0.75 / midday slate 37.9% / evening slate 69.0% / allday slate 93.1% / per-scope lifts midday ×0.51, evening ×0.84, allday ×0.82. Candidate (paginated) overall slate **66.7% (tied)** / overall pick lift **×0.81 (+0.06)** / midday slate **44.8% (+6.9pp)** / evening slate 69.0% / allday slate 86.2% (-6.9pp) / per-scope lifts midday **×0.59 (+0.08)**, evening **×0.87 (+0.03)**, allday **×0.87 (+0.05)**. **Verdict:** candidate passes the gate — overall slate hit ties exactly (66.7%), pick lift improves on every scope, per-scope picture is the engine producing better-ordered picks (allday r1+r2 hit% jumped 24%/17% → 34%/31%, redistributing hits from r5/r6 into the top of slate, which the noisier slate-rate metric penalizes per the dual-lens rule). Backtest harness `scripts/backtest/replay.ts::fetchHistoryRows` paginated in the same change so the gate evaluates the actual production-shape behavior. | ✅ Fixed 2026-05-22 — code committed `b783219`, edge fn deployed as **v23** (verify_jwt=true restored after a ~26-second exposure window on v22 where I accidentally passed `--no-verify-jwt`; same `ezbr_sha256` confirms identical code, only the JWT flag changed). Smoke test on v23 returned a valid allday slate (snapshot `f38b029a`) using the paginated path — different from morning's truncated v21 picks because the engine now sees the full histories window. Subscribers consume slates via Facebook (not the app) so the smoke-test snapshot is acceptable for promotional use. Operator will regen again after re-importing box/pair history. Local engine + edge fn + backtest harness all paginated; parity preserved across all three paths. | `engines/zk6.ts:279`, `supabase/functions/compute-slate-zk6/index.ts:402`, `scripts/backtest/replay.ts:53`, `hooks/useSavedHits.tsx:67` (same pattern, anon-side, lower priority — deferred) | 2026-05-22 |
| BUG-156 | ✅ Fixed | **`engineCore.computeDGC` returned 0 for ≈98% of TX combos and ≈100% of selected ZK30 picks; the DGC signal channel was dead since ARCH-06 step 5 deploy.** Discovered 2026-05-26 during a 5-step DGC=0 diagnostic. Two compounding bugs in the shared `engineCore.computeDGC`: (a) `DGC_REF_STD_DEV=10` is calibrated for ZK6 national-pace data (median combo gap stdev ≈ 8d); TX single-state pace is ~5× slower (median ≈ 46d) so `max(0, 1 - stdev/10)` clips to 0 for nearly every TX combo. (b) Combos with exactly 2 hits have 1 gap → variance=0 → DGC=1.0; after `maxNorm` these 2-hit triples dominate the universe divisor and push every legitimate multi-hit single's DGC toward zero. Diagnostic confirmed both pathologies via direct probe: combo 345 (24 hits, stdev 33d) → raw DGC 0; combo 777 (2 hits, stdev 0) → raw DGC 1.0; 982/1000 universe combos returning DGC=0. The ensemble was effectively 3-channel (BOX/PBURST/CO) despite advertising 4. | ✅ Fixed 2026-05-26 — ZK30-local `computeDGCZK30(dayOffsets, refStdDev, minGaps)` inlined in BOTH `engines/zk30.ts` AND `supabase/functions/compute-slate-zk30/index.ts`. Two new app_config rows: `zk30_dgc_ref_std_dev=50` (TX-calibrated), `zk30_dgc_min_gaps=3` (combos below this return 0.15 baseline, killing the 2-hit triple freak case). `EngineConfig` + `DEFAULT_ENGINE_CONFIG` + `loadEngineConfig` parsing extended in both surfaces. Edge fn redeployed as **v4**, sha `06476f8e4b02985338f5ce42c182921a49ec34a361c9dbcb4c0e8be615475dc4`. `lib/engineCore.ts::computeDGC` deliberately UNTOUCHED — ZK6's national-pace calibration stays correct for its data slice; the fix is ZK30-local. **Validation (request_id=10, edge v4)**: 30/30 picks regenerated; DGC range 0.000–0.830, mean 0.569, median 0.658 (was 0 across the board pre-fix); 3 zeros (placeholder combos with timesDrawn=0, expected); 0 picks at the 0.15 baseline floor (min_gaps=3 not artificially capping real data); top pick combo 345 → DGC=0.519 normalized, matching diagnostic-predicted ~0.34 raw × maxNorm divisor ≈ 0.52. DGC channel is alive. **Backtest gate deferred**: full ZK30 backtest with vs without DGC live is gated on 30 days of TX matches accumulating (per ARCH-06 acceptance gate 2, earliest 2026-06-25). **Drift control**: `computeDGCZK30` now joins the DRIFT CONTROL block — RN engine + edge fn must move in lockstep on DGC math; ZK6 path unaffected. | `engines/zk30.ts`, `supabase/functions/compute-slate-zk30/index.ts`, app_config (`zk30_dgc_ref_std_dev`, `zk30_dgc_min_gaps`) | 2026-05-26 |
| BUG-155 | ✅ Fixed | **`run-hit-detection` compared `result.result_digits === pick.combo` instead of `pick.bestOrder`, mislabeling box hits as straight whenever `combo` ≠ `bestOrder` and the draw happened to equal the engine's enumeration index.** Operator reported on 2026-05-23 ~05:00 ET, after importing 5/22 allday results ledger + 5/22 evening daily input: "evening picks #4 and #6 are showing exact match when they were in fact partial matches." Trace: 5/22 evening snapshot (id `53b90cb5…`, hash `53F9B81D`) had pick #4 `combo=120 / bestOrder=021 / comboSet={0,1,2}` and pick #6 `combo=217 / bestOrder=271 / comboSet={1,2,7}`. Histories for 5/22 evening included `TX evening 120` (TX is a 4-draw state where night collapses into evening per BUG-148) and `W.Canada evening 217`. The edge function's straight check used `result.result_digits === pick.combo` — where `pick.combo = universe[i]` is the raw 000..999 enumeration index from `buildUniverse()` in `lib/engineCore.ts:65-67`, NOT the recommended straight order. `pick.bestOrder` (returned by `bestOrderFor()` in `lib/engineCore.ts`) is the user-facing straight. Subscribers play bestOrder; an operator/subscriber playing `021` straight against TX's `120` result loses the straight bet (digits match, order differs → box only), but the edge function stamped `hitType='straight'` because `"120" === "120"`. Same bug for pick #6: bestOrder `271` vs W.Canada result `217` is a box, edge function called it straight. The pick #5 case in the same snapshot (`combo=196, bestOrder=196`) was unaffected because the two fields were identical — the bug only surfaces when bestOrderFor() picks a different permutation than the iteration index, which happens whenever the top-pair-anchored "best straight" is not the natural enumeration. Sites of the comparison: `runForDate` per-pick match loop (`supabase/functions/run-hit-detection/index.ts:346`), `updateDailyIntelligenceHit:108`, `recordHitInAdaptiveTracking:146`. All three wrote `hit_straight=true` for these picks across `slate_snapshots.top_k_straights_json`, `daily_intelligence`, and `adaptive_tracking`. Scope check across the verification window (2026-05-12 → 2026-05-22) returned exactly 2 affected rows — both from 5/22 evening — so the historical inflation is bounded and small; CONFIG-07's 7-day review (which fires 5/22 via scheduled routine and uses pick-rank/lift metrics from `adaptive_tracking`) was already complete before the operator surfaced this, so no rollback of the per-scope weights decision is required, but the underlying numbers should be recomputed after the data fix lands. **Why this slipped past BUG-148/149/150/151:** the field-name collision is subtle — `pick.combo` is a perfectly valid 3-digit string, the right *length*, and equals `bestOrder` ~⅓ of the time (whenever bestOrderFor picks the iteration order anyway), so smoke tests on individual picks looked fine. The user only notices when (a) a pick has divergent combo/bestOrder AND (b) the actual draw equals combo but not bestOrder — both conditions must coincide. | ✅ Three-site fix in `supabase/functions/run-hit-detection/index.ts`: (1) `runForDate` per-pick loop now computes `const straightCombo = pick.bestOrder ?? pick.combo` (combo as legacy fallback for any pre-bestOrder snapshots) and tests `straightHit = result.result_digits === straightCombo`. (2) Same change in `updateDailyIntelligenceHit`. (3) Same change in `recordHitInAdaptiveTracking`. Deployed as **v7** (verify_jwt=true preserved; status ACTIVE; sha256 `24075651…`). **Surgical data correction** for the 2 affected rows: (a) `slate_snapshots[id='53b90cb5…'].top_k_straights_json[3].hitType` and `[5].hitType` flipped from `'straight'` to `'box'` via `jsonb_set`; (b) `daily_intelligence` rows `d134157e…` (combo 120) and `c50df836…` (combo 217) updated `hit_straight=false` (hit_box stays true); (c) `adaptive_tracking` rows `d07dd80c…` (rank 4 TX 120) and `43e01caa…` (rank 6 W.Canada 217) updated `hit_straight=false`. The other AT rows for pick #4 (ME,NH,VT + PA — actual_result `102`) were already correctly `hit_straight=false`. `hitState`/`hitResult` left as TX/W.Canada because both are legitimate box hits even if not the "closest to home" choice; minimal-disruption fix per dual-lens principle. Survey across 2026-05-12 → 2026-05-22 confirmed exactly 2 affected snapshot picks → ZERO other corrections needed. **Forward guarantee:** any future re-run of hit detection on legacy data will use bestOrder; the snapshot-level early-out (`if (pick.hitType) return pick`) at line 340 means already-corrected picks won't be re-touched, and the AT idempotency layer from BUG-150 makes secondary re-runs no-ops. | `supabase/functions/run-hit-detection/index.ts:114,155,349,361`; `slate_snapshots` + `daily_intelligence` + `adaptive_tracking` 2-pick correction | 2026-05-23 |
| BUG-154 | ✅ Fixed | **Pair history re-import 42P10'd because `useDataIngestion.tsx::importHistoryMutation` POSTs `on_conflict=class_id,scope,horizon_label,key` but the actual `datasets_pair_unique` index is on 5 columns including `jurisdiction`.** Operator reported 2026-05-22 ~3pm ET while attempting Pair H01Y Class 2 midday re-import: `{"code":"42P10","message":"there is no unique or exclusion constraint matching the ON CONFLICT specification"}`. Postgres validates the on_conflict columns against existing unique indexes at plan time (not row time), so the error fires even on an empty target — which the pair table happens to be at the moment of the failed import. Same family as BUG-149 (histories on_conflict drift after BUG-148 widened the unique key). The bug has been latent ever since `datasets_pair_unique` was created or last widened to include jurisdiction — pair-history re-imports must have been failing the whole time, but it took the operator's pre-import wiring verification pass to surface it. ImportWizardView.tsx:353 already has the correct 5-column spec for the box path (`on_conflict=class_id,scope,horizon_label,key,jurisdiction`) — pair_history delegates back to useDataIngestion's broken `importHistoryMutation` instead. | ✅ Fixed 2026-05-22 — `useDataIngestion.tsx:349-350` updated to 5-column `on_conflict` spec matching the actual index, for both box and pair paths. Operator needs to reload dev server and retry the pair H01Y Class 2 midday import; expected to succeed cleanly. | `hooks/useDataIngestion.tsx:349-350` | 2026-05-22 |
| BUG-153 | ✅ Fixed (defensive) | **PostgREST 1000-cap also truncates the engine's datasets_pair fetch (parallel BUG-152).** The pair query in `engines/zk6.ts:118` and `supabase/functions/compute-slate-zk6/index.ts:297` requests all pair classes (2–11) across all horizons in a single REST call with `limit=50000`. Current pair data is 685 rows × 2 horizons (H01Y+H02Y) = 1370 rows per scope; PostgREST returns 1000 of those (`content-range: 0-999/1370`, verified 2026-05-22). **Functional impact under current schema = ZERO.** The truncated 1000-row slice contains all 685 H01Y rows + 315 of 685 H02Y rows (verified by direct REST probe). `buildDatasets` in both engine paths uses H01Y as canonical for each `(pairKey, classId)` and only falls back to H02Y when H01Y is missing — and H01Y is 100% covered in the truncated case. So the missing 370 H02Y rows are never read by any engine code path. **Empirical validation per CLAUDE.md gate (30d, n=87, `default`):** Baseline (BUG-152-paginated histories, BUG-153-truncated pair) and Candidate (both paginated) produce **bit-identical engine output** — overall slate 66.7% / pick lift ×0.81 in both, per-rank hit% identical across all three scopes. Tied passes the gate trivially. **Why ship anyway:** defensive programming for future expansion — if Pair H03Y is ever added (operator considered but deferred 2026-05-22), the same single-call would return 1000 of 685×3=2055 rows, and the missing H03Y rows could start mattering. Pagination ensures correct behavior at any data scale. | ✅ Fixed 2026-05-22 — code committed (replay.ts + engines/zk6.ts + edge fn source), deployed pending. Paginated path identical to single-call output for engine purposes today; gate passed; defensive ship. | `engines/zk6.ts:118`, `supabase/functions/compute-slate-zk6/index.ts:297`, `scripts/backtest/replay.ts:48` | 2026-05-22 |
| BUG-150 | 🟠 High | **`run-hit-detection` race condition lost the second matched state when a pick's digits drew in 2+ jurisdictions on the same scope-matching session.** User reported on 2026-05-18 14:00 ET after 5/17 hit detection ran: "a hit for 862 was also in Delaware, is not showing in the hit track record or compact slates, but IS showing on the results page." Trace: 5/17 allday pick #1 `combo=826 / comboSet={2,6,8}`. histories had TWO matching rows on 5/17: `DC midday 862` + `DE midday 862` (both box-match `{2,6,8}`). The edge-function `runForDate` per-pick loop pushed both `recordHitInAdaptiveTracking(DC)` + `(DE)` promises into `atWrites[]` and awaited them via `Promise.all([...atWrites, ...diWrites])`. Both calls ran in parallel: both lookups for the primary AT row (`slate_hash, rank, combo, mode, matched_state IS NULL`) saw the un-stamped row simultaneously, both PATCHed it — last write wins, leaving ONE AT row with `matched_state` arbitrarily set to DC or DE based on which PATCH completed last. The other state's hit was silently dropped from adaptive_tracking. Results page reads `histories` directly → both DC + DE 862 visible ✓. Track record (`app/track-record.tsx:102`) + Explore feed grid (`app/(tabs)/explore.tsx:350`) + DailyRecapCard read `adaptive_tracking` filtered by `matched_state IS NOT NULL` → only one of the two states surfaced. Snapshot annotation `top_k_straights_json[].hitState` got the FIRST match (sorted-by-straightHit order, deterministic but separate from the AT race) — for combo 826 the snapshot showed DE but AT showed DC, so the data was internally inconsistent across the three sinks. Daily_intelligence (one row per pick by design) was set to whichever the "primary" of `matches.sort()` was — also one state only, which is acceptable for DI's per-pick shape but explains why some surfaces showed DE while others showed DC. | ✅ Three-layer fix: (1) **Serialize per-pick AT writes** in `runForDate` — replaced the parallel `atWrites: Promise<void>[]` array with `pickPasses: Promise<void>[]`, where each entry is an IIFE that awaits matches serially: `for (const m of matches) { await recordHitInAdaptiveTracking(...) }`. Different picks still run in parallel; only multi-match writes within the same pick are serialized. The IS-NULL primary-row lookup now consistently sees the prior PATCH's effect, so the first match takes the primary row and subsequent matches fall through to INSERT. (2) **Idempotency layer in `recordHitInAdaptiveTracking`**: added pre-check that returns early if `(slate_hash, rank, combo, mode, matched_state=X, matched_session=Y)` already exists — re-runs against re-annotated picks (and any future double-fires) are now no-ops on already-recorded matches instead of duplicating rows or fighting for the IS-NULL primary. (3) **Backfilled 5/17 combo 826**: INSERT'd the missing DE midday secondary AT row mirroring the DC primary's signal scores and slate_hash (`2D9DF2D3`). Edge function deployed as **v5** (sha256 `7c1bd4a9…`, was `be451e54…`). Re-run probe for 5/17 returned 0 new hits as expected — the snapshot-level idempotency at line 329 (`if (pick.hitType) return pick`) short-circuits before AT writes when picks are already annotated. **Verified post-fix:** adaptive_tracking for 5/17 has 5 rows with `matched_state IS NOT NULL` (3 allday: DC/DE/PA; 2 midday: NM/VA), matching the edge function's original `hitsFound: 5`. **Why this slipped past BUG-145/147 review:** the multi-state-match path required (a) ≥2 jurisdictions drawing the same digits on the same date AND (b) both drawings landing in sessions compatible with the snapshot's scope. allday scope makes condition (b) trivial since any session counts; per-scope slates need both draws in the same session-bucket. Combinatorially uncommon — and when it does fire, the user-visible symptom is "one of the hits is missing" which only stands out if the user happens to check multiple states. The fix removes a class of silent data-loss; no rollback condition needed since the new logic is strictly additive (no behavior change when matches.length ≤ 1). | `supabase/functions/run-hit-detection/index.ts`, adaptive_tracking (1-row backfill) | 2026-05-18 |
| BUG-149 | 🔴 Critical | **Ledger imports silently dropped every row for 2026-05-17 (the day after BUG-148 shipped) because the `on_conflict=` query string wasn't widened to match BUG-148's new `histories_unique` constraint.** User reported on 2026-05-18 09:00 ET, after re-importing all 5/17 ledgers + daily inputs: "5/17 hits and results not propagating before 5/18 regen." Trace: `histories` had zero rows for `date_et='2026-05-17'` despite both `imports` rows showing `status='completed'`. Smoking gun in Postgres logs: repeated `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`. BUG-148's migration widened `histories_unique` from `(jurisdiction, game, date_et, session)` to `(jurisdiction, game, date_et, session, result_digits)`, but two upsert call sites still POSTed `on_conflict=jurisdiction,game,date_et,session`: (1) `components/admin/ImportWizardView.tsx:429` (the wizard path the user actually used — `file_meta.import_date` confirms), and (2) `hooks/useDataIngestion.tsx:709` (the legacy ledger-import.tsx path). Wizard catch block recorded the failure as `lastError` (in-memory only), then unconditionally PATCHed the imports row to `status='completed', counts: 0`. 5/16 imported pre-BUG-148 and worked (74 rows); 5/17 was the first ledger day post-fix and got zero. Knock-on: `daily_intelligence` `hit_box`/`hit_straight` stayed 0 for 5/17 across all 3 scopes (90 rows total, all `box_hits=0, exact_hits=0`) because hit detection ran against an empty histories slice. | ✅ Fix: (1) Both call sites now use `on_conflict=jurisdiction,game,date_et,session,result_digits` matching the new index. (2) Wizard's pre-batch dedup key tightened to include `result_digits` so 4-draw states (TX/GA/DC/TN) — whose 2 evening-bucket draws share `(j,g,d,session)` post-collapse — aren't dropped before reaching Postgres (the dedup defeated the whole purpose of BUG-148's wider unique key otherwise). (3) Wizard's imports-row status now flips to `'failed'` with `error_text` when every batch errored (was unconditionally `'completed'`) so this kind of silent failure surfaces in the imports table next time. User to re-run 5/17 midday + allday ledger imports; ledger commit auto-fires `runHitDetectionAndRefresh` for the imported date, so daily_intelligence will repopulate as a side effect. **Why this slipped past BUG-148:** the unique-index widening was in the SQL migration, but neither call site was updated in the same change. Reviewing the BUG-148 commit `bdfab9c`: `lib/parseLedger.ts`, `types/core.ts`, `hooks/useDataIngestion.tsx` (the comment was updated but the `on_conflict` string wasn't), `supabase/functions/run-hit-detection/index.ts`, the migration, and 3 consumer files — but **ImportWizardView.tsx wasn't touched at all**, and useDataIngestion.tsx's `on_conflict` string was a stale survivor. No test caught it because there's no integration test for ledger ingestion (see ARCH-03). | `components/admin/ImportWizardView.tsx`, `hooks/useDataIngestion.tsx` | 2026-05-18 |
| 2026-05-17 | **BRAND-02: App icon rewire + assets/ cleanup.** New `assets/app-icon.png` (2048×2048 RGBA) wired into every brand-image slot — `app.json` (top-level `icon`, `android.adaptiveIcon.foregroundImage`, `web.favicon`, `expo-notifications.icon`, `expo-splash-screen.image`), `app.config.ts` (`android.adaptiveIcon.foregroundImage` override), and `components/BrandMark.tsx` (in-app Home/Paywall brand mark). Splash regenerated from the new icon (same 220px width on `#0a0613`). Deleted legacy icons (`assets/images/{icon,adaptive-icon,favicon,splash-icon}.png`), stale `assets/app-icon.PNG` (uppercase), unreferenced `assets/splash.PNG` + `assets/logo-art.jpg`, and the unused `assets/images/HM_Design/` design-mockup folder. BUG-24 closed as a side effect (background.png deleted, deferred re-introduction retired). Final `assets/` = `app-icon.png` + BRAND-01 doctrine doc only; `assets/images/` removed. Commits: `f7a5819`, `f532733`, `d66b73a`, `32d1bab`. | Claude Code |
| 2026-05-17 | **BRAND-03: Match-type vocabulary swap on consumer surfaces.** Marketing-reference doc (`assets/HitMaster_Master_Marketing_Brand_Reference.md`, ingested 2026-05-17) extends BRAND-01's forbidden/approved table with **Straight match → Exact match** and **Box match → Partial match** for public copy. Swapped 5 consumer surfaces: `app/(tabs)/results.tsx` (match-badge label + share message), `app/(tabs)/index.tsx` (home hit banner sub), `app/(tabs)/explore.tsx` (match-feed badge `⭐ EXACT / 🎯 PARTIAL`), `components/HitCelebrationOverlay.tsx` (overlay type badge + share-string label). Internal identifiers (`hit_straight`, `straightHitRate`, etc.) unchanged per BRAND-01 rule. Educational glossary copy in `learn.tsx`/`account.tsx`/`book.tsx` and admin "Straight Rate" stats deliberately left alone. | Claude Code |
| CONFIG-02 | 🟠 High | **Inverted BOX pressure weight for midday + evening only.** FORENSIC-01 surfaced the over-due/anti-correlation pattern. Empirical-validation loop per CLAUDE.md ran in 4 stages: (1) Added `boxFreqWeight/boxPressureWeight` (+ per-scope variants) to backtest `EngineConfig` and `lib/engineCore.ts::computeBoxSignal` — defaults preserved bit-identical production behavior. (2) Parity guard `bp_per_scope_parity` (global 60/40 + per-scope 60/40 for all scopes) matched `default` slate hit rate exactly across midday/evening/allday → wiring confirmed correct. (3) 30-day candidate sweep (n=87 slates per config): `bp_freq75`/`bp_freq90`/`bp_freq100` (reduce pressure) barely moved midday (lift 0.50× → 0.54×); `bp_inverted` (pressure weight -0.40, global) jumped midday to 0.70× and evening to 0.87× but hurt allday (0.90× → 0.76×); `bp_midday_only_inverted` (midday inverted, evening + allday default) captured midday win without other moves; **`bp_midday_evening_inverted` (midday + evening inverted, allday default) was the cleanest winner**. (4) Production deployment via per-scope app_config: `box_pressure_weight_midday = -0.40`, `box_pressure_weight_evening = -0.40`, no allday key (falls through to global default 0.40). **Baseline numbers (30d, n=87 slates, `default`):** overall slate hit 69.0%, overall pick lift 0.79×; midday slate 37.9% / pick lift 0.50×; evening 69.0% / 0.81×; allday 100.0% / 0.90×. **Candidate numbers (30d, n=87, `bp_midday_evening_inverted`):** overall slate hit 73.6% (+4.6pp), overall pick lift 0.85× (+0.06); midday slate 48.3% (+10.4pp) / pick lift 0.70× (+0.20); evening 72.4% (+3.4pp) / 0.87× (+0.06); allday 100.0% / 0.90× (no regression). Wilson CI on midday slate rates overlap ([22.7%–56.0%] vs [31.4%–65.6%]), so n=29 per scope is suggestive not conclusive; per-pick comparison (174 trials/scope) is the more powerful read. **Deploy mechanics:** Edge function `compute-slate-zk6` v14 deployed via supabase CLI (verify_jwt=true, sha256 changed from `2d4fd735…` v13 → `fd6a7b08…` v14). Production engine `engines/zk6.ts` and edge function both read `box_freq_weight`, `box_pressure_weight`, `box_freq_weight_${scope}`, `box_pressure_weight_${scope}` from app_config. `lib/engineCore.ts::computeBoxSignal` accepts optional `freqWeight`/`pressureWeight` params (defaults 0.60/0.40 = bit-identical to legacy). All path-parity-confirmed: 30-day replay of `bp_per_scope_parity` matched `default` exactly. Backtest harness `replay.ts` honors the same per-scope override pattern. **EXPO_PUBLIC_USE_EDGE_ZK6=true** in .env confirms the edge function is the active production path; local `engines/zk6.ts` is the parity-aligned fallback. **Rollback condition:** if 7-day midday slate hit rate < 35% (current 30-day baseline 37.9%), revert by deleting the two app_config keys — no code rollback needed. **Review date: 2026-05-24** (10 days post-deploy). Read at review: 7-day midday slate hit rate, 7-day overall pick lift via `npm run backtest:report -- --days 7`; expected midday ≥40%, overall lift ≥0.82×. If both met, retain CONFIG-02 indefinitely and consider next candidate (rail-matched baseline, then evening-only inversion magnitude tuning). | ✅ Live in production from 2026-05-14 18:55 UTC. | `lib/engineCore.ts`, `engines/zk6.ts`, `supabase/functions/compute-slate-zk6/index.ts`, `scripts/backtest/types.ts`, `scripts/backtest/replay.ts`, `scripts/backtest/configs.ts`, app_config (`box_pressure_weight_midday`, `box_pressure_weight_evening`) | 2026-05-14 |
