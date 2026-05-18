# Scheduled Jobs

Index of recurring server-side jobs in the HitMaster ZK6 system.

---

## `compute-daily-report` — nightly engine_daily_report aggregation

**Status:** ✅ LIVE since 2026-05-18 via pg_cron. Migration: `supabase/migrations/2026-05-18_pg_cron_compute_daily_report.sql`. First scheduled fire: 2026-05-19 08:00 UTC (= 04:00 EDT) for the 2026-05-18 row.

**What it does:** Reads `daily_intelligence` for the target date, aggregates picks_count/hits_count/straights_count/boxes_count/rate/mean_energy per (slate_date, scope), upserts rows into `engine_daily_report`. Idempotent on conflict `(slate_date, scope)`.

**Why nightly at 4 AM ET:**
- After all evening draws complete (~midnight ET)
- Before morning signal generation (~6:30 AM ET)
- Daily report data is ready when operators check morning dashboards

**Source:** `supabase/functions/compute-daily-report/index.ts`

**Manual invocation (works today):**
```bash
set -a && . ./.env && set +a
curl -sS -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/compute-daily-report" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date":"YYYY-MM-DD"}'
```

**Verification:**
```sql
SELECT slate_date, scope, picks_count, hits_count, rate FROM engine_daily_report
WHERE slate_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY slate_date DESC, scope;
```

### Scheduling mechanism — pg_cron + pg_net (chosen 2026-05-18)

`pg_cron` 1.6.4 + `pg_net` 0.19.5 installed via `CREATE EXTENSION IF NOT EXISTS`. Anon JWT stored in `vault.secrets` as `cron_anon_key` so the cron SQL doesn't inline credentials.

**Verification (2026-05-18 end-to-end test):** manual invocation of the exact cron body returned HTTP 200 + processed all 3 scopes + wrote `engine_daily_report` row for 2026-05-17 (`durationMs: 638`).

**Disable / pause:**
```sql
SELECT cron.unschedule('compute-daily-report-nightly');
```

**Re-enable:** re-run the migration `2026-05-18_pg_cron_compute_daily_report.sql`.

**Inspect last N fires:**
```sql
SELECT id, status_code, error_msg, created
FROM net._http_response
ORDER BY created DESC LIMIT 10;
```

---

---

## `generate-weight-proposal` — weekly weight proposal generator (edge fn variant)

**Status:** ✅ LIVE since 2026-05-18 via pg_cron. Migration: `supabase/migrations/2026-05-18_pg_cron_generate_weight_proposal.sql`. First scheduled fire: next Sunday 09:00 UTC.

**What it does:** Runs gates G1 (sample size), G2 (AUC improvement), G5 (per-scope respect). Writes either `weight_proposal_generated` or `weight_proposal_blocked` to `audit_logs`. Operators review in admin → Proposals tab.

**Gates G3 (backtest) and G4 (divergence) are SKIPPED** — they require the engine codebase which isn't ported to Deno. Proposals from this scheduled run carry `g3_status='skipped_edge'` in `payload_meta`. The admin UI surfaces this in the Pending section. Operators who want G3 evidence before approving high-stakes proposals should run:

```bash
npm run autotune:propose -- --manual
```

…which runs all 5 gates locally (3-4 min, includes the full 30-day backtest).

**Source:** `supabase/functions/generate-weight-proposal/index.ts`

**Manual invocation:**
```bash
set -a && . ./.env && set +a
curl -sS -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/generate-weight-proposal" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry":true}'    # omit dry for live run
```

**Empirical state at launch (2026-05-18 smoke test):** `{"ok":true,"status":"blocked","gate_that_blocked":"G1_sample_size","reason":"n=100 adaptive_tracking outcomes in last 30d (threshold 500)","durationMs":797}`. Output bit-identical to the Node version's gate text — verifies parity.

**Disable / pause:**
```sql
SELECT cron.unschedule('generate-weight-proposal-weekly');
```

---

## Backfill history

| Date backfilled | Method | When | Notes |
|---|---|---|---|
| 2026-05-14 → 2026-05-17 | Manual curl per date, work order Order 2 task 2.5 | 2026-05-18 | Closes the 5-day gap since the last write on 5/13. 2026-05-18 itself NOT backfilled — day not complete yet; let scheduled job (or manual run 5/19 morning) handle it. |

---

## Future entries to add here

When other jobs become scheduled, document them in this file using the template above.

- `rebuild-datasets-zk6` is currently operator-invoked. Worth considering a weekly cadence to keep `datasets_box`/`datasets_pair`/`horizon_blends` fresh after histories ingest.
- `run-hit-detection` fires on every ledger import via `useDataIngestion` + the wizard hit-detection hook. Could also be scheduled for catch-up (e.g., 6 AM ET) in case an import was missed.
