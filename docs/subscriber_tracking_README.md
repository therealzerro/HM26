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
| `fb_group_daily`               | Group Insights DAILY series (Total Members · Posts · Comments · Reactions · Active Members), one row per group per day, no PII. Added 2026-09-07; feeds the Funnel dashboard's Pro-group headcount, engagement pulse and member bars. |
| `fb_engagement_snapshots`      | Historical 28-day engagement counts per import.        |
| `funnel_daily_snapshots`       | Daily page-followers + free-group + active-pro counts with auto-computed conversion rate, gross MRR, net MRR. |
| `subscriber_import_history`    | Audit trail for every import action.                   |
| `fb_earnings_daily`            | Meta "Approximate earnings" per day (total / content monetization / stars / subscriptions). Subscriptions are NET of Meta's cut. Added 2026-09-02. |

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

Two lists exist and both import (ENH-SUB-NAMES-01, 2026-09-12):

1. **Supporter Email Addresses** (Insights → Subscribers → Supporter email
   addresses → Download CSV / copy the table): email + date subscribed
   (M/D/YYYY). This is the roster's identity key.
2. **Subscribers list** (the member list Meta shows since 9/2026): display
   name + date in the `Sep 12, 2026` form, copied from the phone as vertical
   pairs (`Name⏎Sep 12, 2026⏎blank⏎`). No email is present.

### Import in the app

Admin tab → **📧 Sub Import** → 📧 Subscribers tab.

1. Paste the export into the textarea. Tab, comma, multi-space, and the
   phone's vertical layout all work for both lists; `M/D/YYYY`, `YYYY-MM-DD`
   and `Mon D, YYYY` dates are accepted. Every row needs a date; a list with
   no dates cannot be imported.
2. Review the preview (parsed rows, warnings, and — for a name paste — the
   **Name → roster link plan**). The roster is keyed on email
   (`pro_subscribers.email` is UNIQUE NOT NULL), so every name row is
   resolved before commit (`lib/subscriberNameLink.ts`):
   - **linked** — a roster row already carries that Facebook name;
   - **linked by name** — the name matches one email's local part strongly
     enough (surname ≥4 letters plus first name / initial / same join date
     ±1 day, or first name plus same date; exactly one candidate). The name
     is saved on that row so the next paste links exactly. Validated on the
     9/12 paste: 23 of 60 linked, 0 wrong, the "surname only, date off"
     candidates were 4 of 5 wrong and are deliberately not linked;
   - **new · name-only** — no match → a row keyed on a placeholder address
     `<name-slug>@facebook-name.invalid` (RFC 2606 reserved TLD, never
     deliverable). Name-only rows display by name everywhere in Admin.
   If a "new" name is really an existing email subscriber the matcher
   missed, cancel, type the name into that row's **Facebook Name** field in
   the Subscribers tab, and paste again.
3. Hit **Probe Potential Churns** — lists currently-active roster rows whose
   email is **not** in the resolved import. With a name paste an email row
   also lands here when its name was not matched, so link before churning.
   Nothing is auto-churned.
4. Hit **Commit N Rows**. New keys are inserted; existing keys are updated
   in place (manual fields like `acquisition_source` are preserved;
   `facebook_name` is written for linked name rows).

**Manual add** (Subscribers tab → Add) takes exactly ONE email address since
2026-09-12 (BUG-177: it used to accept any text with an "@", and a whole
pasted export became one roster row).

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

### Import Group Insights (whole download, as-is — since 2026-09-07)

Admin tab → **📧 Sub Import** → 🔥 Insights tab.

1. Select Free Group or Pro Group.
2. Paste the **entire** Group Insights CSV download. The parser is
   section-aware:
   - the daily block (`Date, Total Members, …, Active Members`) → one row per
     day in `fb_group_daily` (all-zero days before the group existed are
     dropped; `total_members` is NULL on days Insights reported 0 members
     because the count did not exist yet — Pro before 2026-06-10);
   - the `Contributors` block (28-day window) → UPSERT into
     `fb_group_contributors` + a `fb_engagement_snapshots` row per member;
   - `Popular Days`, `Popular Times` and the `Posts` block are skipped and
     never stored (the Posts block carries member names + post text).
   The window-end date auto-fills to the last day of the daily series; the
   Contributors table pasted alone still works (set the date by hand). TSV,
   multi-space and the quoted CSV (BUG-172) all parse.

   **Free group — two exports, both accepted (2026-09-07, BUG-176):**
   - the *Group Insights download* ships a bare `Date` header with EMPTY
     metric columns (no daily numbers at all), then Age Range, Top Cities,
     country `Name,Value`, Contributors. The parser skips the empty daily
     block with a warning and imports the Contributors; the demographic
     tables are never stored. (This is the paste that "did not understand
     this data" before 9/7 — the date rows were parsed as contributors.)
   - the *Growth/Engagement export* carries the real daily series:
     `Date, Joined, Posted or Commented, Viewed, Posts, Comments, Reactions`
     → `fb_group_daily` with `joined`, `engaged_members`, and Viewed mapped
     onto `active_members`; `total_members` stays NULL (the free export has
     no member count — the funnel snapshot carries it).
   Select **Free Group** before committing either one.
3. Commit. The alert lists what landed; `subscriber_import_history` gets one
   `group_insights` row covering both blocks.

Read it back in **👥 Engagement** (same screen): every member ever listed,
ranked by the latest window (score = posts×5 + comments×2 + reactions), Δ vs
the previous imported window, and a dimmed "gone quiet" list of members who
fell out of the window. Totals row compares the two most recent windows.

### Marking churn in bulk

📧 Subscribers tab → paste the current supporter export → **Probe Potential
Churns** lists active roster rows missing from it. **Mark all N churned
(today)** sets `status=churned, date_churned=today` on each (confirm dialog;
reversible per row in Pro Subscribers) and logs a `manual` import row
`bulk_churn_from_probe_<date>`. Only use it when the pasted export is the
complete current list — a partial paste would churn paying members.

### Import Meta earnings

Admin tab → **📧 Sub Import** → 💵 Earnings tab.

1. Professional dashboard → Monetization → Earnings → export (CSV).
2. Paste the whole file as-is — the `sep=,` line, the "Approximate
   earnings" title, quoted cells and ISO timestamps are all handled.
3. Commit. Rows UPSERT on date, so re-pasting an overlapping window
   updates it in place. Logged to `subscriber_import_history` as
   `earnings`.

The Funnel dashboard shows a "Meta payouts" row: subscriptions last 30
days, month to date, other income, all-time — and the ratio of actual
30-day subscription payouts to the roster's Net MRR. Meta pays 70% of the
$2.49 price ($1.74 per renewal; $0.69 per legacy $0.99 sub), which is the
observed per-renewal amount in the export and confirms the 70% constant in
`funnel_daily_snapshots`.

### Reading the Funnel dashboard (2026-09-07 layout)

Terminology (operator ruling 2026-09-07): **subscribers** = the Pro group;
**members** = the free group. Tiles and cards use those words.

**Members · free group card** (from the free group's Growth/Engagement
export in `fb_group_daily`): JOINED last 7 days and per day vs the prior 7,
VIEWED per day with the share of members who open the group daily (uses the
snapshot's free-group headcount — the free export has no member count),
POSTED OR COMMENTED per day, the series total of joins, a 7-day vs prior-7
table (joined, viewed, engaged, posts, comments, reactions), and a 60-day
joined-per-day bar strip. Refresh by pasting the Growth/Engagement export
into Sub Import → 🔥 Insights with Free Group selected.

Three subscriber numbers, deliberately side by side — they measure different
things and drift apart exactly when it matters:

| Tile | Source | What it is | When it lies |
|---|---|---|---|
| ACTIVE PRO · ROSTER | `pro_subscribers` status=active | the billing list | between email imports (leavers stay "active") |
| PRO GROUP · INSIGHTS | `fb_group_daily` latest `total_members` | who is actually in the group | only as fresh as the last Insights paste (as-of date shown) |
| PAYING · 30D ÷ $1.74 | `fb_earnings_daily` last 30 days ÷ $1.74 | renewals that cleared | legacy $0.99 subs pay $0.69 and read as 0.4 of a renewal |

Rule: quote the Insights count as the Pro headcount in briefs; treat roster
MRR/conversion as upper bounds until the roster is reconciled (a gold banner
appears on both Funnel and Pro Subscribers when roster − group > 2).
CONVERSION · REAL = Insights members ÷ free group.

Cards: **Renewal wave** — this month's subscription payouts vs the same
calendar days last month (Meta bills on the subscribe date, so this is the
renewal rate of last month's intake; <85% = the cohort is leaving; read over a
week, daily postings wobble ±1 day) and last 7 days vs the same 7 days a month
earlier. **Payouts by month** with ≈renewals. **Pro group engagement pulse** —
last 7 days vs prior 7 (posts, member comments, reactions, active/day, active
share, zero-comment days). **Pro group members** bars — the 90-day Insights
series (red = down day); falls back to the roster snapshot bars when no series
is loaded. **Growth velocity** — free group and page followers per day between
snapshots, Pro group per day over 7 days, and the implied Pro ceiling.

**Pro Subscribers** adds **Renewals due** (next 7 days list with "1st renewal"
flags for members ≤1 month in; count for days 8–30) and **Cohorts by subscribe
month** (joined / active / churned / retained — RETAINED only moves when churn
is marked, so 100% beside a shrinking group means a stale roster).

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
