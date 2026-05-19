# Status Report — End of Day 2026-05-18

**Generated:** 2026-05-18 EOD ET
**Branch:** `main` clean (no uncommitted changes)
**Last commit:** `c2ab906` feat(autotune): surface g3_status=skipped_edge in ProposalReviewView
**Scope:** Snapshot of all engine + autotune subsystems as of end of day

---

## TL;DR

- Day shipped substantially more than the morning's work order anticipated. **15 commits**, **3 new edge functions + 2 cron schedules + 1 admin UI tab + 4 docs**.
- The Weight Proposal System (autotune) work order was added mid-session and shipped end-to-end (Phases A/B/C). The earlier "rename + guard" work for `applyDataDrivenWeights()` was effectively superseded by a full rewrite into `applyApprovedProposal()` + supporting functions.
- `compute-daily-report` is now on a nightly schedule via pg_cron. `generate-weight-proposal` is on a weekly schedule via pg_cron.
- All gate thresholds are intentionally conservative. At current data volume (n=100 AT outcomes vs threshold 500), the weekly autotune will write `weight_proposal_blocked` rows until data grows ~5×.

---

## §A — Cleanup verification

| Task | Status | Notes |
|---|---|---|
| A.1 — Park `min_energy_midday_50` config | ✅ Already done in commit `2c1af51` (earlier today) |
| A.2 — Memory note for next per-scope intervention | ✅ Already done in `project_per_scope_tuning_roadmap.md` (earlier today) |
| A.3 — Git clean state | ✅ Working tree clean; 15 commits today all on `main` and pushed |
| A.4 — Function rename verification | ⚠️ Work order assumption STALE — function was not just renamed/guarded; it was **fully rewritten** into `applyApprovedProposal` + `revertAppliedProposal` + `dismissProposal` as part of WPS Phase A (commit `28f62e8`). The CONFIG-01 risk is **eliminated**, not just gated. |
| A.5 — Orphan artifacts | ✅ `scripts/backtest/output/` (CSVs from today's backtest runs) is gitignored; `/tmp/*.log` not tracked; `.gitignore` already lists `.env.backtest`, build artifacts, supabase/.temp |

**Surprise found:** None. Work order's stale assumption about A.4 is the only deviation, and it's resolved (better than expected — full rewrite vs partial guard).

---

## §B.1 — Engine subsystem status

| Subsystem | File | Lines | Status | Last meaningful change | Confidence |
|---|---|---:|---|---|---|
| ZK6 engine (client) | `engines/zk6.ts` | 1485 | ✅ Working | ENH-MET per-scope min_energy_threshold reader (`2c1af51`) | High |
| ZK6 engine (edge) | `supabase/functions/compute-slate-zk6/index.ts` | 910 | ✅ **Live production (v16)** | ENH-MET parity reader (uncommitted to fn deploy — local only) | High; **see watch list** |
| Shared engine math | `lib/engineCore.ts` | 223 | ✅ Working | None today | High |
| Hit detection | `supabase/functions/run-hit-detection/index.ts` | 496 | ✅ Live (v5) | BUG-150 race-condition fix (yesterday's work, `9bb961b`) | High |
| Per-scope override surface | (across all 3) | — | ✅ Working | Added `min_energy_threshold_${scope}` reader; **midday-only override exists for preset/cooldown/box_pressure**; evening + allday use global | High |
| Backtest harness | `scripts/backtest/` | 1175 (configs) + replay/score/types/cli | ✅ Working | Per-rank `hitsByPick` extension (`99bba6b`); 4 sweep families parked (ENH-EVCO, ENH-DBL H1/H2/H3, ENH-MET) | High |
| Intel tuning | `scripts/intel-tuning/fit.ts` (141) + `generate-proposal.ts` (487) | ✅ Working | `generate-proposal.ts` shipped today (`28f62e8`); npm `autotune:propose` script added | High |
| Slate generation pipeline | `hooks/useDataIngestion.tsx` + `compute-slate-zk6` | — | ✅ Working | None today | High |
| Adaptive tracking writes | `compute-slate-zk6` + `run-hit-detection` | — | ✅ Working | None today | High |
| Daily report aggregator | `supabase/functions/compute-daily-report/index.ts` | 193 | ✅ Live (v1) **+ scheduled** | First scheduled via pg_cron (`7ad8b86`); backfilled 5/12-5/17 | High |
| Weight proposal generator (edge) | `supabase/functions/generate-weight-proposal/index.ts` | 376 | ✅ Live (v1) **+ scheduled** | Shipped today (`3820074`); first scheduled fire Sunday 2026-05-24 09 UTC | High |
| Apply / revert / dismiss | `lib/applyWeightUpdate.ts` | 315 | ✅ Working | Rewritten from orphan today (`28f62e8`) | High |
| Admin Proposals UI | `components/admin/ProposalReviewView.tsx` | 490 | ✅ Working | Shipped today (`fef5939`), G3 badge added (`c2ab906`) | High |
| Regenerate banner | `components/admin/ProposalRegenBanner.tsx` | 121 | ✅ Working | Shipped today (`fef5939`) | High |
| `send-push` edge function | (v1) | — | ⚠️ DORMANT | Never invoked; push_tokens table empty | n/a |

**Pending TODO that surfaced today:** the ENH-MET min_energy_threshold reader was added to `engines/zk6.ts` AND to the edge function source file, but **the edge function has not been redeployed** since (compute-slate-zk6 is still v16, last updated 2026-05-10 per `created_at`/`updated_at` timestamps). Local source + production are out of parity on this code change. **Flagged in §B.7 watch list.**

---

## §B.2 — Active config state (`app_config`, 2026-05-18 EOD)

Categorized; ✓ marks per-scope override existence.

| Key | Value | Touched today? |
|---|---|---|
| `engine_weights_balanced` | `{BOX:49.5, PBURST:27, CO:13.5, DGC:10}` | — |
| `engine_weights_balanced_midday` ✓ | `{BOX:20.8, PBURST:5.2, CO:74, DGC:0}` | — (CONFIG-07, 5/15) |
| `engine_weights_conservative` | `{BOX:67.5, PBURST:13.5, CO:9, DGC:10}` | — |
| `engine_weights_conservative_midday` ✓ | `{BOX:35.1, PBURST:3.2, CO:61.6, DGC:0}` | — |
| `engine_weights_aggressive` | `{BOX:40.5, PBURST:31.5, CO:18, DGC:10}` | — |
| `engine_weights_aggressive_midday` ✓ | `{BOX:14, PBURST:5, CO:81, DGC:0}` | — |
| `box_pressure_weight_midday` ✓ | `-0.40` | — (CONFIG-02, 5/14) |
| `box_pressure_weight_evening` ✓ | `-0.40` | — (CONFIG-02, 5/14) |
| `recent_hit_cooldown` (global) | `20` | — |
| `recent_hit_cooldown_midday` ✓ | `10` | — |
| `min_energy_threshold` (global) | `70` | — |
| (no per-scope `min_energy_threshold_*`) | n/a | **reader added today** but no live override set (ENH-MET null result) |
| `pressure_threshold` | `250` | — |
| `pressure_bonus_weight` | `10` | — |
| `pair_rep_cap` | `2` | — |
| `k6_singles_max` | `4` | — |
| `k6_doubles_max` | `2` | — |
| `k6_triples_on` / `k6_triples_enabled` | `false` | — |
| `synergy_boost_on` | `false` | — |
| `synergy_boost_weight` | `0.15` | — |
| `horizon_weights` | `{H01Y:100, rest:0}` | — |
| `active_weight_preset` / `engine_preset` | `balanced` | — |
| `zk6_engine_version` / `zk6_version` | `v2.1` | — |

**Per-scope override summary:** midday has 4 distinct overrides (preset × 3 modes + cooldown + pressure); evening has 1 (pressure only); allday has zero — uses globals.

**No `app_config` rows were modified today.** All today's writes were to `audit_logs`, `engine_daily_report` (via backfill), and vault.

---

## §B.3 — Investigation outcomes

### Engine split investigation (`docs/engine_split_investigation_2026-05-18.md`)
**Decision: Path D — don't split.** Per-scope override infrastructure already exists in production and is the right tool. Midday's 30pp underperformance is partly structural (30% fewer draws, 7 evening-only jurisdictions) and partly tuning headroom (~13-22pp per Appendix D analysis). **Next checkpoint:** 2026-05-22 CONFIG-07 scheduled review. **§7 work items #1-#2 marked COMPLETED-NULL**, **#5 moved to ACTIVE queue** earlier today.

### `min_energy_threshold_midday=50` backtest (`docs/min_energy_threshold_midday_backtest_2026-05-18.md`)
**Null result.** Δ slate hit rate = 0.0pp across all scopes. Isolation check passed (evening + allday bit-identical between baseline and candidate). Midday per-rank composition shifted but slate-level netted to identical hit count. **Recommendation accepted: do not deploy.** Per-scope reader infrastructure retained (both engine paths + harness) for future per-scope experiments. Config marked PARKED with full post-mortem in `scripts/backtest/configs.ts`.

### Self-tuning infrastructure audit (`docs/self_tuning_audit_2026-05-18.md`)
**Hypothesis partially correct.** Rich signals are recorded (3,500+ evaluated picks over 30d); same-day hit exclusion + dataset rebuild + auto-supplemental slates are real automated feedback loops; but parameter tuning was human-in-the-loop and the `applyDataDrivenWeights()` function existed-but-orphaned with a subtle correctness bug. The audit triggered three follow-up work orders (Orders 1+2 same day, Order 3 superseded by the WPS work order). **All three follow-up orders + WPS Phases A/B/C shipped same day.**

---

## §B.4 — Work orders drafted but not executed

**None remain unexecuted.**

The morning's work orders (Engine Split Investigation + min_energy_threshold + Self-Tuning Audit + follow-up Orders 1-3) all completed. The Weight Proposal System work order (drafted mid-session) shipped end-to-end (Phases A/B/C + G3 badge addition).

**Implicit deferred work** (not formal orders but mentioned during the session):
- **Full Deno port of the engine** for the autotune edge function to run G3 + G4. ~12-20h. Deferred indefinitely per Option B choice; operators run `npm run autotune:propose -- --manual` for full G3 evidence when needed.
- **`pair_rep_cap_${scope}` + `pressure_threshold_${scope}` per-scope readers.** ~2h. Queued behind 2026-05-22 CONFIG-07 review (per engine-split investigation §7 item #5).
- **30-day post-deploy retrospective** on the engine split decision. ~1h. Scheduled for 2026-06-17.

---

## §B.5 — Open questions / decision checkpoints

| Date | Decision | Data needed | Owner |
|---|---|---|---|
| **2026-05-19 ~04 EDT** | First scheduled `compute-daily-report` fire. Verify writes 2026-05-18 row. | `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;` next morning | claude-code on next session check-in |
| **2026-05-22** | CONFIG-07 7-day review fires (existing scheduled routine). Does midday slate hit rate hold? | 7-day midday slate-rate post-deploy | scheduled routine + operator review |
| **2026-05-24 ~05 EDT** | First scheduled `generate-weight-proposal` fire. Expected: `weight_proposal_blocked` (G1 n=100 vs 500). Verify the schedule fires correctly. | admin Proposals tab → Blocked section, or `SELECT * FROM audit_logs WHERE action LIKE 'weight_proposal%' ORDER BY created_at DESC LIMIT 5;` | claude-code on next session check-in |
| **~2026-06-17** | 30-day post-deploy re-evaluation of engine-split decision. Refresh §1-3 of investigation. | 90 days of fresh adaptive_tracking + daily_intelligence | claude-code |
| **~2026-06-22** | 4-week evaluation of weekly autotune output. Are proposals consistently useful, noise, or always-blocked? | 4 weekly audit_logs rows from `generate-weight-proposal-weekly` | operator |
| **Ongoing** | Watch for autotune G1 to start passing (would require adaptive_tracking outcomes to reach n=500 in 30d window) | row count query on AT | claude-code |

---

## §B.6 — Health metrics (2026-05-18 EOD snapshot)

| Table | Rows | Last write | Status |
|---|---:|---|---|
| `slate_snapshots` | 791 | 2026-05-18 14:53 UTC | ✅ Active (this morning's regens) |
| `adaptive_tracking` | 221 | 2026-05-18 14:53 UTC | ✅ Active |
| `daily_intelligence` | 2,536 | 2026-05-18 14:53 UTC | ✅ Active |
| `histories` | 3,002 | 2026-05-18 20:27 UTC | ✅ Active (most recent ledger import) |
| `engine_daily_report` | **18** (was 3 this morning) | 2026-05-18 22:58 UTC | ✅ **Backfilled today**; first scheduled fire tomorrow |
| `hit_detection_runs` | 29 | 2026-05-18 20:27 UTC | ✅ Active (manual triggers earlier) |
| `engine_runs` | 13 | 2026-05-18 14:53 UTC | ⚠️ DORMANT — writes only on slate gen, sparse |
| `audit_logs` | 1,124 (+6 today) | 2026-05-18 20:30 UTC | ✅ Active; today: 3 import_daily + 3 regenerate_slate |
| `imports` | 410 | 2026-05-18 20:30 UTC | ✅ Active |
| `datasets_box` | 30,000 | n/a | ✅ Stable |
| `datasets_pair` | 4,110 | n/a | ✅ Stable |
| `horizon_blends` | 30 | n/a | ✅ Stable |
| `percentile_maps` | 60 | n/a | ✅ Stable |
| `pair_events` | 0 | never | ❌ Empty (feature stub, table exists but never written) |
| `saved_slates` | 0 | never | ❌ Empty (feature stub) |
| `slate_credits` | 0 | never | ❌ Empty (feature stub) |
| `user_sessions` | 0 | never | ❌ Empty (feature stub) |
| `push_tokens` | 0 | never | ❌ Empty (`send-push` edge function never invoked) |

**pg_cron jobs (new today):**
- jobid 1 — `compute-daily-report-nightly` — `0 8 * * *` — active. First fire: 2026-05-19 08:00 UTC.
- jobid 2 — `generate-weight-proposal-weekly` — `0 9 * * 0` — active. First fire: 2026-05-24 09:00 UTC.

**Vault secrets (new today):**
- `cron_anon_key` — anon JWT used by pg_cron HTTP calls

---

## §B.7 — Known issues + watch list

1. ~~`compute-slate-zk6` edge function source has ENH-MET reader committed locally but NOT REDEPLOYED.~~ **CLOSED 2026-05-19** — redeployed v17 via `npx supabase functions deploy compute-slate-zk6`. sha256 changed from `d1c143d3…` to `9a120404…`. Verified deployed source contains `scopeMinEnergyKey` (×5) + `scopeMinEnergyOverride` (×5) + `min_energy_threshold_${scope}` template literal + `ENH-MET` marker. Behavior bit-identical to v16 today (no `min_energy_threshold_${scope}` key in `app_config`), but next per-scope experiment can land cleanly.

2. **`engine_runs` table is sparse and dormant.** 13 rows total across the lifetime of the project; writes only happen on `compute-slate-zk6` invocation. No reader anywhere. Self-tuning audit §3 classified as DORMANT. Two options: (a) retire it, (b) build something that reads it. Neither is urgent.

3. **`adaptive_tracking` only persists `mode='balanced'`.** 221/221 rows are balanced. Conservative + aggressive modes never get tracking data, so any AUC fit from outcomes only covers balanced. Documented in self-tuning audit §8 finding 2. Worth deciding whether to ship "shadow generation" of conservative/aggressive slates to populate AT for those modes, or to retire those modes entirely.

4. **Midday underperformance ceiling is ~70%, not ~80%.** Per investigation Appendix D, ~8pp of midday's 30pp gap is structural (data volume + missing jurisdictions); ~13-22pp is tuning headroom. The current CONFIG-07 midday preset is plausibly the right kind of intervention. Watch the 2026-05-22 review.

5. **`send-push` edge function exists but never invoked.** Push notifications aren't wired. Feature stub. Worth deciding at some point whether to ship push or retire.

6. **5 feature-stub tables sit at 0 rows.** `saved_slates`, `slate_credits`, `user_sessions`, `push_tokens`, `pair_events`. Schema debt. Either populate or drop.

7. **Documentation pointer drift after ENH-MET rename.** `docs/self_tuning_audit_2026-05-18.md` references `applyDataDrivenWeights()` throughout, with a note at the top that the function was renamed. The rename note is accurate but the body text would benefit from a follow-up update. Low priority — readers can follow the note pointer.

8. **The G1 sample-size threshold (500) is 5× current data volume (n=100).** This is intentional safety (per the WPS work order) but means scheduled proposals will block weekly until volume grows. Worth a check-in after 4 weeks to decide whether to lower or accept.

---

## §B.8 — What changed today

### Files modified or created (by commit, in order)

| Commit | Files |
|---|---|
| `9bb961b` (last night, but referenced) | `supabase/functions/run-hit-detection/index.ts` (BUG-150 race fix) |
| `d58f9ad` | `components/HitHeroBand.tsx` + adaptive_tracking + daily_intelligence + slate_snapshots data cleanup (BUG-151) |
| `67af12d` | `CLAUDE.md` + `assets/HitMaster_Brand_Rehab_Skill_Brief_v2.md` (brand skill brief ingestion) |
| `3933fb8` | `scripts/backtest/configs.ts` (ENH-EVCO scaffolding) |
| `44b8ac8` | `scripts/backtest/diag-doubles.ts` + `package.json` (doubles diagnostic) |
| `99bba6b` | `scripts/backtest/score.ts` + `types.ts` + `cli.ts` + `output.ts` + `configs.ts` (per-rank harness + ENH-EVCO parked) |
| `727f2f9` | `scripts/backtest/types.ts` + `replay.ts` + `configs.ts` (ENH-DBL infrastructure + parked configs) |
| `2c1af51` | `engines/zk6.ts` + `supabase/functions/compute-slate-zk6/index.ts` + `scripts/backtest/types.ts` + `replay.ts` + `configs.ts` + 2 docs (ENH-MET reader + null backtest report) |
| `c28e209` | `docs/self_tuning_audit_2026-05-18.md` (audit report) |
| `0a252b1` | `lib/applyWeightUpdate.ts` + audit note + `docs/scheduled_jobs.md` + `engine_daily_report` 5/12-5/17 backfill (Order 1 rename + Order 2 partial) |
| `28f62e8` | `lib/applyWeightUpdate.ts` (full rewrite) + `scripts/intel-tuning/generate-proposal.ts` + `package.json` (WPS Phase A) |
| `fef5939` | `components/admin/ProposalReviewView.tsx` + `ProposalRegenBanner.tsx` + admin nav + DashboardView + EngineConfigView + `docs/weight_proposal_system.md` (WPS Phase B) |
| `7ad8b86` | `supabase/migrations/2026-05-18_pg_cron_compute_daily_report.sql` + `docs/scheduled_jobs.md` (compute-daily-report scheduling) |
| `3820074` | `supabase/functions/generate-weight-proposal/index.ts` + `supabase/migrations/2026-05-18_pg_cron_generate_weight_proposal.sql` + 2 doc updates (WPS Phase C) |
| `c2ab906` | `components/admin/ProposalReviewView.tsx` (G3 badge) |

### New edge functions deployed
- `generate-weight-proposal` v1 (sha256 `5c35d6cf…`) — runs G1+G2+G5; G3+G4 skipped

### Edge functions NOT redeployed but with source changes pending
- `compute-slate-zk6` — local source has ENH-MET reader; deployed v16 is older. See §B.7 #1.

### Database schema changes
- Two pg_cron jobs created
- Two pg_net + pg_cron extensions installed
- Vault secret `cron_anon_key` stored
- 5 SQL migrations added: 2 pg_cron migrations + 1 prior session-collapse migration referenced

### Data changes
- `engine_daily_report` backfilled for 2026-05-12 → 2026-05-17 (15 rows added; 18 total)
- No `app_config` writes

---

## §B.9 — Recommended next session

### Priority 1: Verify the two scheduled jobs fire correctly (~15 min)

The first scheduled `compute-daily-report` fires 2026-05-19 08:00 UTC, the first `generate-weight-proposal` fires 2026-05-24 09:00 UTC. Each fire needs a one-time human spot-check:

```sql
-- After 2026-05-19 morning:
SELECT id, status_code, content::text AS body, created
FROM net._http_response ORDER BY created DESC LIMIT 5;

SELECT slate_date, scope, picks_count, hits_count, rate
FROM engine_daily_report WHERE slate_date = '2026-05-18';

-- After 2026-05-24 morning:
SELECT id, action, created_at, payload_meta->>'gate_that_blocked' AS gate
FROM audit_logs
WHERE action IN ('weight_proposal_generated','weight_proposal_blocked')
  AND created_at >= '2026-05-24'
ORDER BY created_at DESC LIMIT 5;
```

If either fires correctly, just close the loop in a memory note. If either fails, debug (likely vault key access or edge fn deploy state).

**Why P1:** scheduled jobs that don't actually fire are worse than no scheduling at all — they create false confidence. One-time verification per schedule is mandatory.

### Priority 2: Redeploy `compute-slate-zk6` to pull in ENH-MET reader (~5 min, gated on intent)

Listed in §B.7 #1. The reader is benign code (just an extra `app_config` key fetch + fallback) so redeploying is safe regardless of whether `min_energy_threshold_midday` ever gets set. The only reason to defer is if there's no near-term intent to set per-scope min_energy values.

**Why P2:** mismatched local source vs production is a footgun for the next person who tries to set a per-scope key thinking it'll be honored.

### Priority 3: Watch the 2026-05-22 CONFIG-07 review fire (~0 min active, ~30 min reactive)

Scheduled routine fires Thursday. Read the outcome and either:
- Close midday tuning as "good enough" if slate-rate ≥ 60% over 7d (would also let us retire ENH-DBL/ENH-EVCO investigations permanently)
- Execute investigation §7 item #5 (`pair_rep_cap_${scope}` + `pressure_threshold_${scope}`) if midday slate-rate < 60%

**Why P3:** date-driven, not work-driven. Calendar item, not effort item.

### Lower-priority items (not Top 3 but worth mentioning)

- **Surface scheduled job status in admin UI.** The Proposal Review's "System Status" section currently shows `lastRun` from audit_logs but not the actual cron schedule. ~30 min to query `cron.job_run_details` for last-fire timestamps. Improves operator situational awareness.
- **Consider GH Actions for CI tests.** The project has no automated tests beyond `npm run lint`. A weekly `npm run backtest:replay` in GH Actions would catch any engine regressions even when no operator runs the harness.
- **Retire or populate the 5 empty feature-stub tables.** Schema debt; cheap to clean up.

---

## Appendix: deferred work tickets

| Ticket | Scope | Effort | Status |
|---|---|---:|---|
| Engine §7 #5 (`pair_rep_cap_${scope}`, `pressure_threshold_${scope}` overrides) | Code + backtest sweep | 2h | Queued, pending 5/22 CONFIG-07 review |
| Engine §7 #6 (30-day post-deploy retrospective) | Investigation refresh | 1h | Scheduled for ~2026-06-17 |
| Full Deno port of engine (for autotune G3+G4 in edge fn) | Full port of zk6.ts + replay.ts + dependencies | 12-20h | Deferred indefinitely (Option B chosen) |
| `engine_runs` reader (or retire table) | Decision + maybe code | 1-2h | Not urgent; classified DORMANT |
| Shadow-generate conservative + aggressive slates to populate AT | Infrastructure | 3-4h | Decision-blocked; unclear if those modes matter in production |
| Auto-apply with tighter gates (graduate from approve-required) | Code + gates + monitoring | 8-10h | 4-week evaluation window first |
| ProposalReviewView "System Status" cron.job_run_details query | UI tweak | 30m | Polish; low priority |
| Push notifications wire-up (or retire `send-push`) | Feature work | unknown | Decision-blocked |

---

**End of status report.** Report saved at `docs/status_report_2026-05-18_end_of_day.md`. Reader: come back to this if you've been away from the codebase for >3 days; otherwise the relevant per-system docs (`docs/scheduled_jobs.md`, `docs/weight_proposal_system.md`, `docs/engine_split_investigation_2026-05-18.md`) are more current as systems evolve.
