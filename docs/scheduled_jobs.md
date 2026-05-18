# Scheduled Jobs

Index of recurring server-side jobs in the HitMaster ZK6 system.

---

## `compute-daily-report` — nightly engine_daily_report aggregation

**Status:** ⚠️ NOT YET AUTOMATED — manual backfill done 2026-05-18 for 5/14–5/17. Scheduling decision blocked on pg_cron extension enable (see "Scheduling mechanism" below).

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

### Scheduling mechanism — decision pending

The Supabase project has `pg_cron` and `pg_net` extensions **available but not installed** (verified 2026-05-18 via `list_extensions`). The project has no GitHub Actions and no external scheduler.

The existing "scheduled routine" reference in project memory (`project_config07_review_window.md`) is the Claude Code `/schedule` skill — that requires a live Claude session at fire time and is wrong-shaped for a nightly server-side job.

**Three viable paths:**

| Option | Cost | Pros | Cons |
|---|---|---|---|
| A. Install `pg_cron` + `pg_net` Supabase extensions | DB-level change, ~5 min | Canonical Supabase pattern; survives any restart | New operational dependency; requires explicit enable |
| B. External scheduler (GitHub Actions cron) | Add `.github/workflows/` | No DB extensions; visible in repo | Requires GitHub Actions billing minutes; not yet in project pattern |
| C. Claude `/schedule` routine | Zero install | Already in use | Requires Claude session live at 4 AM ET; not appropriate for prod-critical jobs |

**Once a path is chosen, the SQL (Option A) would be:**

```sql
-- Requires pg_cron + pg_net installed first:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'compute-daily-report-nightly',
  '0 8 * * *',  -- 8 AM UTC = 4 AM ET (5 AM during DST is fine; report is for prior day)
  $$
  SELECT net.http_post(
    url := 'https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/compute-daily-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'date', (CURRENT_DATE - INTERVAL '1 day')::text
    )
  );
  $$
);
```

The service role key would need to live in a `current_setting` or be inlined (less secure). Worth a separate work order to set up the secret correctly.

**Disable / pause:**
```sql
SELECT cron.unschedule('compute-daily-report-nightly');
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
