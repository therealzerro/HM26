# Pro Subscriber Tracking + Funnel Intelligence

Source-of-truth roster for Pro tier subscribers (email PII + date subscribed),
Facebook Group Insights engagement layer, and daily funnel snapshots with
real MRR. Replaces reliance on Facebook's lagged dashboard reporting.

Shipped under `ENH-FUNNEL-2026-05-19` (MASTER_AUDIT.md).

## Data model

| Table                          | Purpose                                                |
| ------------------------------ | ------------------------------------------------------ |
| `pro_subscribers`              | One row per paying subscriber. Email is the unique key. PII. |
| `fb_group_contributors`        | Engagement-active members from Group Insights exports. Name+group is the unique key. |
| `fb_engagement_snapshots`      | Historical 28-day engagement counts per import.        |
| `funnel_daily_snapshots`       | Daily page-followers + free-group + active-pro counts with auto-computed conversion rate, gross MRR, net MRR. |
| `subscriber_import_history`    | Audit trail for every import action.                   |

All tables have RLS enabled with **no public policies**. Access is exclusively
via the `subscriber-admin` Edge Function using the service-role key. The
function is gated by an `X-Admin-Key` header that must match the
`ADMIN_OPS_KEY` env var.

## Security model

The app uses the anon key directly via `fetchFromSupabase()` with no Supabase
Auth. Standard RLS policies based on `auth.uid()` would never fire. To keep
email PII out of the bundled anon-key surface:

1. **DB level:** tables deny anon entirely (RLS enabled, no policies).
2. **Edge Function:** `subscriber-admin` bypasses RLS via service-role key.
3. **Header gate:** every call must include `X-Admin-Key`. The function
   compares against `Deno.env.get('ADMIN_OPS_KEY')` and returns 401 otherwise.
4. **Client storage:** the operator enters the key once into the admin UI
   (`AdminKeyGate`); we persist it to AsyncStorage and attach it to every
   call. The key is never bundled into the JS shipped to App Store / TestFlight.

## One-time operator setup

### 1. Choose and set the admin key

Generate a strong random string (≥ 32 chars). In the Supabase dashboard:

> Project Settings → Edge Functions → Manage secrets → add `ADMIN_OPS_KEY`

Or via the CLI:

```bash
supabase secrets set ADMIN_OPS_KEY=<your-secret>
```

### 2. Re-deploy the function so it picks up the new secret

Already-deployed at version 1 from the initial build, but a redeploy is
required after setting the secret:

```bash
supabase functions deploy subscriber-admin
```

### 3. Enter the key into the app

Open the admin tab → Funnel / Subscribers / Sub Import → paste the same key
into the unlock prompt. It persists across reloads on that device only.

If the operator changes the secret on the server side, the next call will
401 and the prompt re-appears.

## Daily / weekly workflow

### Export subscribers from Meta Business Suite

1. Open the Page in Meta Business Suite.
2. Insights → Subscribers → Supporter email addresses → Download CSV (or
   copy the table).
3. Two columns: email + date subscribed (M/D/YYYY).

### Import in the app

Admin tab → **📧 Sub Import** → 📧 Subscribers tab.

1. Paste the export into the textarea (tab-separated, comma-separated,
   multi-space, and the phone's vertical layout — email on one line, date on
   the next — all work since 2026-09-02, BUG-173). Every row needs a date;
   an email-only list cannot be imported.
2. Review the preview (parsed rows, warnings).
3. Hit **Probe Potential Churns** — this lists any currently-active
   subscribers whose email is **not** in the new import. These are not
   auto-churned; operator reviews them and manually marks status = 'churned'
   in the Subscribers tab if confirmed.
4. Hit **Commit N Rows**. New emails are inserted; existing emails are
   updated in place (manual fields like `facebook_name`, `acquisition_source`
   are preserved).

### Record a funnel snapshot

Admin tab → **📈 Funnel** → scroll to "Record Funnel Snapshot".

- **Date** defaults to today.
- **Page Followers** — number from Facebook Page Insights.
- **Free Group Members** — count from the free FB group.
- **Active Pro Subscribers** is auto-pulled from the roster — no manual entry.

Conversion rate, gross MRR, and net MRR are generated columns in Postgres,
so they are always consistent with the inputs. Net MRR uses a 70% retention
rate (30% platform fee placeholder; adjust in `funnel_daily_snapshots` DDL
if the actual cut differs). Price constant is $2.49 since the 2026-09-02
migration (was the $0.99 launch price).

### Import Group Insights engagement

Admin tab → **📧 Sub Import** → 🔥 Insights tab.

1. Select Free Group or Pro Group.
2. Set the window-end date (defaults to today). Engagement is 28-day rolling.
3. Paste 4-column data: name, posts, comments, reactions. The raw Group
   Insights CSV export (every cell double-quoted) pastes as-is since
   2026-09-02 (BUG-172); TSV and multi-space still work.
4. Commit. Each row UPSERTs into `fb_group_contributors` and appends a new
   `fb_engagement_snapshots` row for trend analysis.

### Manual / comped subscribers

Admin tab → **👥 Subscribers** → scroll to "Add Manual Subscriber". Use for
comped beta access, partner accounts, or anything not yet flowing through
the Facebook subscription export.

## Roster state (2026-09-02)

Roster refreshed 2026-09-02 from a 57-row supporter export (dates 4/30→8/23):
70 active + 1 comped on file, of which 13 May-era actives were NOT in the
export — churn candidates awaiting operator review (Sub Import → Probe
Potential Churns lists them). The operator-reported Pro group count is 68;
the 57 in the export are the paying base.

Earlier the same day, before the export arrived:
The 8/16 and 9/2 `funnel_daily_snapshots` rows were written with the
operator count directly (service-role, notes column says so). **Until a
fresh Meta Business Suite email export is imported, do not record a
snapshot from the Funnel tab** — `upsert_snapshot` recomputes
`active_pro_subscribers` from the roster and will write 21.
`page_followers` on both rows is carried forward from 5/19 (14,037) and
needs a Page Insights refresh. Generated MRR columns were regenerated at $2.49 on 2026-09-02
(`supabase/migrations/2026-09-02_funnel_mrr_249.sql`, applied).

## Reconciliation gap (current state, 2026-05-19)

- Email export: **21 subscribers** with dates 2026-04-24 → 2026-05-19.
- Free group UI: 23–24 humans visible.
- Variance: 2–3 humans. Possible causes:
  - Payment processing lag (Facebook UI is sometimes ahead of the export).
  - Churned but still in the group.
  - Comped or special-case members the operator added manually.
  - The business account itself counted by the UI.

Resolve manually by checking each unaccounted-for name in Facebook and
either marking the subscriber as 'comped' in the admin UI or contacting
the member.

See `docs/subscriber_reconciliation_queries.sql` for the diagnostic SQL.

## PII handling rules

- Emails are stored as `text` in `pro_subscribers.email` with a unique
  constraint. They are **never** logged to `console.*` from the Edge
  Function or the client (verified: greps clean).
- The admin UI defaults to **masked emails** (`jam****@gmail.com`). Click
  the 🔒 Masked / 🔓 Revealed toggle to unmask. The toggle is per-session
  and not persisted.
- CSV/export from the admin UI is not implemented in this drop — if/when
  added, it must log to `subscriber_import_history` as an audit entry.
- Do not paste email exports into Slack, GitHub issues, screenshots, or
  any other shared surface. Treat them like passwords.

## iOS migration prep

`pro_subscribers` already has the three forward-looking columns:

- `ios_migration_invited_at` — timestamp when the migration email is sent.
- `ios_migration_completed_at` — timestamp when the user redeems an iOS code.
- `ios_user_id` — the RevenueCat / Supabase Auth UUID created during migration.

When RevenueCat IAP launches (Phase 4), the migration script will:

1. Query `pro_subscribers WHERE status='active' AND ios_migration_invited_at IS NULL`.
2. Send a redemption email to each (mechanism TBD — likely Postmark or Resend).
3. Stamp `ios_migration_invited_at` on send.
4. When the operator confirms (or the IAP webhook fires), stamp `ios_user_id`
   and `ios_migration_completed_at`.

This work is out of scope for ENH-FUNNEL-2026-05-19.

## Rollback

```sql
-- docs/rollback_2026-05-19_subscriber_tracking.sql
DROP TABLE IF EXISTS fb_engagement_snapshots CASCADE;
DROP TABLE IF EXISTS fb_group_contributors CASCADE;
DROP TABLE IF EXISTS funnel_daily_snapshots CASCADE;
DROP TABLE IF EXISTS subscriber_import_history CASCADE;
DROP TABLE IF EXISTS pro_subscribers CASCADE;
DROP FUNCTION IF EXISTS touch_updated_at();
```

All tables are net-new with no foreign keys into existing engine tables.
Drop is clean and reversible via re-seed from the raw email export.

## Files

- Migration: `supabase/migrations/2026-05-19_subscriber_tracking.sql`
- Edge Function: `supabase/functions/subscriber-admin/index.ts`
- Client: `lib/subscriberAdminClient.ts`
- Parsers: `lib/subscriberEmailParser.ts`, `lib/groupInsightsParser.ts`
- UI: `components/admin/AdminKeyGate.tsx`, `ProSubscribersView.tsx`,
  `SubscriberImportView.tsx`, `FunnelDashboardView.tsx`
- Reconciliation SQL: `docs/subscriber_reconciliation_queries.sql`
