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

1. Paste the export into the textarea (tab-separated, comma-separated, and
   multi-space all work).
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
if the actual cut differs).

### Import Group Insights engagement

Admin tab → **📧 Sub Import** → 🔥 Insights tab.

1. Select Free Group or Pro Group.
2. Set the window-end date (defaults to today). Engagement is 28-day rolling.
3. Paste 4-column data: name, posts, comments, reactions.
4. Commit. Each row UPSERTs into `fb_group_contributors` and appends a new
   `fb_engagement_snapshots` row for trend analysis.

### Manual / comped subscribers

Admin tab → **👥 Subscribers** → scroll to "Add Manual Subscriber". Use for
comped beta access, partner accounts, or anything not yet flowing through
the Facebook subscription export.

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
