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

## Backfill history

| Date backfilled | Method | When | Notes |
|---|---|---|---|
| 2026-05-14 → 2026-05-17 | Manual curl per date, work order Order 2 task 2.5 | 2026-05-18 | Closes the 5-day gap since the last write on 5/13. 2026-05-18 itself NOT backfilled — day not complete yet; let scheduled job (or manual run 5/19 morning) handle it. |

---

## Future entries to add here

When other jobs become scheduled, document them in this file using the template above.

- `rebuild-datasets-zk6` is currently operator-invoked. Worth considering a weekly cadence to keep `datasets_box`/`datasets_pair`/`horizon_blends` fresh after histories ingest.
- `run-hit-detection` fires on every ledger import via `useDataIngestion` + the wizard hit-detection hook. Could also be scheduled for catch-up (e.g., 6 AM ET) in case an import was missed.
