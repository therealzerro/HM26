# Weight Proposal System

**Effective:** 2026-05-18 (Phase A+B shipped; Phase C scheduling blocked on pg_cron)
**Reference:** `docs/self_tuning_audit_2026-05-18.md` §7.B + the Weight Proposal System work order
**Status:** Ready for manual invocation + operator review; weekly schedule pending

---

## What it does

Closes the analysis loop for ZK6 engine weight tuning automatically. Keeps the apply decision in human hands.

1. **Weekly (Sunday 5:00 AM ET):** `scripts/intel-tuning/generate-proposal.ts` runs against the last 30 days of `adaptive_tracking` outcomes. Computes AUC-fitted proposed weights via `scripts/intel-tuning/fit.ts::fitWeights`.
2. **5 gates run in sequence.** If any fail, a `weight_proposal_blocked` row is written to `audit_logs` with the reason. If all pass, a `weight_proposal_generated` row is written with `apply_ops`, `revert_ops`, full `all_gate_results`, and `expires_at = now + 7 days`.
3. **Operator reviews in admin UI** (Admin → Proposals tab). Sees the proposed weights, AUC delta, backtest delta per scope, divergence percent, and the exact SQL that would run. Clicks **Approve & Apply** (with checkbox: "I understand I can revert this") or **Dismiss**.
4. **If approved**, `lib/applyWeightUpdate.ts::applyApprovedProposal()` executes the proposal's pre-validated apply SQL against `app_config`. Writes a `weight_proposal_applied` audit row with full before/after state.
5. **Operator presses Regenerate manually** to use the new weights. The regenerate workflow is unchanged.
6. **One-click revert** is available in the Recently Applied section for any applied proposal.

## What it does NOT do

- Does NOT auto-apply weight changes
- Does NOT auto-regenerate slates after apply
- Does NOT modify per-scope overrides without operator approval
- Does NOT replace the manual CONFIG-XX workflow (operators can still tune manually anytime)

## The 5 gates

| Gate | Threshold | Behavior |
|---|---|---|
| **G1 sample size** | `n ≥ 500` adaptive_tracking outcomes in last 30d | Block if fail |
| **G2 AUC improvement** | proposed_AUC − current_AUC ≥ +0.02 on combined indicator | Block if fail |
| **G3 historical backtest** | NO scope regresses on slate hit rate vs current | Block if any scope regresses |
| **G4 divergence** | informational — flags when ≥50% of K6 picks change | Never blocks; flag shown in UI |
| **G5 per-scope respect** | structural — when a per-scope key exists, target it; never overwrite global in a way that bypasses overrides | Never blocks; defines apply_ops shape |

Gates 1 + 2 short-circuit gates 3 + 4 to save backtest compute when the proposal would block anyway.

## Files

| File | Role |
|---|---|
| `scripts/intel-tuning/generate-proposal.ts` | Proposal generator, runs all 5 gates, writes audit_logs |
| `lib/applyWeightUpdate.ts` | `applyApprovedProposal` + `revertAppliedProposal` + `dismissProposal` |
| `components/admin/ProposalReviewView.tsx` | Admin UI: 4 sections (Pending / Recently Applied / Blocked / System Status) + modals |
| `components/admin/ProposalRegenBanner.tsx` | Banner shown above regenerate UI in DashboardView + EngineConfigView |
| `scripts/intel-tuning/fit.ts` | Existing AUC fitter used by the generator |
| `scripts/backtest/replay.ts` | Existing harness; gate G3 invokes `computeSlateAsOf` from here |

## Weekly workflow (operator)

| When | What | Where |
|---|---|---|
| Sunday 5:00 AM ET | Proposal generator runs automatically | (scheduled, see "Scheduling" below) |
| Sunday/Monday morning | Operator opens admin → Proposals tab | `Admin > Proposals` |
| If proposal is pending | Review weights diff, AUC, backtest results, divergence | Pending section |
| Decision: approve | Modal → checkbox "I understand revert path" → Apply | Pending → Approve & Apply |
| Decision: dismiss | Modal → optional reason → Dismiss | Pending → Dismiss |
| Anytime after apply | Press Regenerate (unchanged workflow) to use new weights | Admin → Dashboard or Engine |
| Within 7 days | If new weights underperform, revert | Recently Applied → Revert |

## How to disable / pause

- **Pause the scheduled job** (once scheduling exists — see "Scheduling" below)
- Existing proposals stay reviewable until they expire (7 days)
- Operators can still run `npm run autotune:propose -- --manual` to force a one-off generation

## How to revert any applied proposal

1. Open Admin → Proposals
2. Scroll to **Recently Applied** section
3. Find the change to revert (shows date, who approved, what changed)
4. Click **Revert** button
5. Confirm in modal with checkbox "I want to restore the prior weights"
6. Press **Regenerate** to use restored weights

The revert path is encoded at proposal-generation time in `revert_ops`. Always available. Logged as `weight_proposal_reverted` in audit_logs.

## When to dismiss vs approve

| Approve when... | Dismiss when... |
|---|---|
| AUC delta is meaningful (≥ +0.03) | AUC delta is barely above the +0.02 threshold |
| All scope backtest deltas are clearly positive | Backtest delta on weakest scope is < +0.5pp |
| Divergence percent matches the kind of change you'd expect | Divergence is > 60% — too much shake-up for unclear gain |
| You don't have context the gates lacked | You know a data issue affected the lookback window |

The gates protect against bad proposals. Operator judgment protects against situational context the gates can't see.

## Scheduling (Phase C — live with Option B subset)

**Status (2026-05-18):** ✅ Scheduled weekly via pg_cron, Option B path. Decision documented in `docs/scheduled_jobs.md`.

**What ships scheduled:** an edge function `generate-weight-proposal` (deployed v1, sha256 `5c35d6cf…`) runs gates **G1, G2, G5** only. It writes the same `audit_logs` row shape as the Node version, plus a `g3_status: 'skipped_edge'` field that the admin UI uses to flag scheduled proposals as "backtest not validated."

**What stays manual:** gates **G3 (backtest)** and **G4 (divergence)** require the engine codebase which isn't ported to Deno. Operators who want full G3 evidence before approving a high-stakes proposal should run:

```bash
npm run autotune:propose -- --manual
```

The manual run takes 3-4 minutes (full backtest) and writes its own audit row that supersedes (but doesn't dismiss) the edge-generated one.

**Cron job:** `generate-weight-proposal-weekly`, fires Sunday 09:00 UTC (= 05:00 EDT during DST, 04:00 EST in winter). Migration: `supabase/migrations/2026-05-18_pg_cron_generate_weight_proposal.sql`.

**Disable:** `SELECT cron.unschedule('generate-weight-proposal-weekly');`

**Why this scope:** porting the full engine to Deno would be 12-20 hours (~1500 lines of zk6.ts + replay.ts + dependencies). The hybrid lets the system observe weekly and emit proposals as soon as data permits, without that investment. Once 4+ weeks of edge-gen proposals are operator-reviewed (with optional manual G3 validation), graduating to a full Deno port or accepting the manual-G3 workflow long-term becomes a data-informed decision.

## Manual verification procedure

Operators should walk through this once before relying on the system.

### Step 1 — Dry-run the generator

```bash
npm run autotune:propose -- --dry --manual
```

Expected output:
- "Mode: DRY-RUN (no audit_logs write)"
- Production weights loaded (you'll see your live CONFIG-02 / CONFIG-07 overrides logged)
- Proposed weights computed
- All gates execute; G1-G2 might block depending on current data volume
- G5 prints which keys would be targeted (verify these match the per-scope overrides shown above — should NOT propose to overwrite `engine_weights_balanced` if `engine_weights_balanced_midday` exists)
- "DRY-RUN — would have written ..." (no audit row written)

### Step 2 — Live run (writes audit_logs)

When you're ready to actually have the system generate a proposal you can review:

```bash
npm run autotune:propose -- --manual
```

Note: if G1/G2/G3 block, this writes a `weight_proposal_blocked` row, not a generated proposal. That's fine — review it in the Blocked section of the admin UI to see why.

### Step 3 — Test the admin UI

1. Open the app in dev mode (`npm run start-tunnel`)
2. Navigate to Admin (triple-tap easter egg)
3. Click **Proposals** in the nav bar
4. Verify:
   - Pending section renders (empty if G1 blocked, or shows the proposal if all gates passed)
   - Blocked section shows recent blocked attempts with gate name + reason
   - System Status section shows current adaptive_tracking sample size + threshold
5. If a proposal IS in Pending:
   - Click **Approve & Apply**, check the checkbox, click **Apply**
   - Verify success alert
   - Check `app_config` in Supabase dashboard to confirm the keys actually changed
   - Verify a `weight_proposal_applied` audit row was written
   - Open Recently Applied, click **Revert**, verify restoration

### Step 4 — Verify the regenerate banner

1. Navigate to Admin → Dashboard
2. Banner should appear at the top of the page IF there's a pending proposal OR a recent (<24h) apply
3. Click **Review** / **View diff** — should navigate to Proposals tab
4. Same on Admin → Engine view

### Step 5 — Verify per-scope respect (Task 8 acceptance)

This is the critical safety property:

```bash
npm run autotune:propose -- --dry --manual 2>&1 | grep -A1 "G5"
```

Look for the G5 reason line. It should say one of:
- "no per-scope overrides exist; will update global `engine_weights_balanced`"
- "per-scope overrides exist for [scope, scope]; will update per-scope keys ONLY (global left untouched)"

If `engine_weights_balanced_midday` exists in `app_config` (which it does today, from CONFIG-07), the G5 message MUST be the second form. If it's the first form, the per-scope detection logic broke — **abort use of the system and investigate** before any apply.

## Risk matrix

| Scenario | Mitigation |
|---|---|
| Proposal generation produces a bad recommendation | G1-G3 block before it surfaces to operator |
| Operator approves a bad proposal | Revert button restores prior weights in < 2 min |
| Per-scope override accidentally overwritten | G5 + manual verification (Step 5 above) prevents it; operator can also visually inspect apply_ops in the modal before approving |
| Schedule fails silently | System Status shows last_run timestamp; banner shows if no recent proposals exist |
| Proposal expires unreviewed | Logged as expired; next Sunday generates a fresh proposal |
| Auto-tune chases noise | G1 sample size + G2 AUC improvement + G3 backtest filter noise |
| Operator forgets to regenerate after applying | Banner state 2 reminds them |
| Operator rubber-stamps approvals | Divergence percent (G4) and rank-by-rank backtest delta forces attention on high-impact changes |

## Empirical state at launch (2026-05-18)

The generator was smoke-run in `--dry` mode on launch day:

- **G1 sample size:** n=100 outcomes in adaptive_tracking (threshold 500) → would BLOCK
- **G2 AUC delta:** +0.0068 vs current (threshold +0.02) → would also BLOCK
- **G5 per-scope respect:** ✓ correctly identified midday's CONFIG-07 override and would target `engine_weights_balanced_midday` not the global

At current data volumes, the system will write `weight_proposal_blocked` rows weekly until adaptive_tracking grows ~5× AND the signal strength increases. This is the **intended safety behavior** — the thresholds protect against small-sample chasing.

Watch the Blocked section over the coming weeks. If the blocking gate is consistently the same (G1 or G2), the thresholds may need revisiting after a longer observation period. The 4-week experiment-evaluation framing from `docs/self_tuning_audit_2026-05-18.md` §7.D still applies.

## What graduating to auto-apply would require

Out of scope for this work order, but documented for future reference:

- 4+ weeks of weekly proposals generated (not blocked) AND operator-approved without issue
- Track record of zero reverts in that window
- Tighter G2 threshold (+0.04 instead of +0.02) and G3 minimum delta requirement (e.g., +1pp per scope)
- A new function `autoApplyApprovedProposal()` that runs on a delayed schedule (e.g., 24h after generation, only if operator hasn't manually reviewed)
- Slack/email notification on auto-apply with audit trail link

A separate work order would specify this when (and if) the evidence supports it.

---

**End of doc.** Last updated 2026-05-18 (Phase A+B shipped).
