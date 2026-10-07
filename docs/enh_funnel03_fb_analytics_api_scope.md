# ENH-FUNNEL-03 — Automatic Facebook analytics ingestion (views + monetization): Phase 0 scope

**Date:** 2026-10-07 · **Status:** SCOPED, NOTHING BUILT · **Operator ask:** "see if there is a way for HitMaster to automatically get and ingest Facebook analytics, including views and monetization."

Builds on ENH-FUNNEL-02 (2026-09-07: hand-pasted Group Insights + earnings exports → `fb_group_daily` / `fb_earnings_daily`) and SOCIAL-01 (2026-07-09: `fb-publish` edge function with a permanent Page token). Verified against Meta's live docs on 2026-10-07 (Graph API v25.0 names; sources at the end).

---

## 1. Answer in one paragraph

**Yes for the Page, no for the Groups.** Everything Meta exposes about the public HitMaster **Page** (daily views, viewers, profile visits, follows, video views, per-reel plays and watch time, and the approximate-earnings series) can be pulled by the existing edge-function pattern with one re-minted token and no App Review. Everything about the **free and Pro Groups** (members, joins, active members, posts/comments/reactions, and the views on reels posted *into* the groups) cannot: Meta removed the Groups API on 2024-04-22 and has not replaced it, so those stay as the Sub Import paste. The one genuinely open question is whether the API's monetization breakdown reports **subscriptions and Stars** (which are ~98% of the money) or only ad-based Content Monetization; Meta's docs don't enumerate the breakdown values, so a 10-minute Graph API Explorer probe (§6) decides whether the earnings paste can be retired or must stay.

Hard rule honoured: **no cron, no scheduled writer** (OPS-01, 2026-06-11). "Automatic" here means *one click pulls everything since the last pull*, from the Admin screen and optionally as a non-blocking Daily Workflow step. The operator's morning click remains the only trigger.

---

## 2. What is held today vs. what the API can replace

| Series | Today | Source of truth | API-able? | Notes |
|---|---|---|---|---|
| Page followers | typed by hand into the funnel snapshot (`funnel_daily_snapshots.page_followers`; carried forward from 5/19 for weeks) | Page Insights | **Yes** — `page_follows` (day), `page_daily_follows_unique`, `page_daily_unfollows_unique` | `page_fans*` were deprecated 2025-11-15; use `page_follows` |
| Page views / viewers / visits | **not held at all** — the standing MKT-74 G data ask ("Page Insights DAILY export 8/23→9/22") in handoff v7.0 F/H4 is still owed | Page Insights | **Yes** — `page_media_view` (views; breakdowns `is_from_ads`, `is_from_followers`), `page_total_media_view_unique` (viewers), `page_views_total` (profile visits) | `page_impressions*` gone 2025-11-15; unique-reach variants gone 2026-06-15. Media views ≠ impressions (different counting) — label accordingly |
| Page video views | not held | Page Insights | **Yes** — `page_video_views` (3-second plays), `page_video_view_time` | `page_video_views_unique` deprecated above v25 — do not use |
| Per-reel plays / watch time (public kinds) | not held; `reel_views_today` in the snapshot is a hand-typed group number | Video Insights | **Yes, Page reels only** — `GET /{page-id}/video_reels` lists them; `GET /{video-id}/video_insights` with `blue_reels_play_count`, `fb_reels_total_plays`, `post_video_avg_time_watched`, `total_video_view_total_time`, `creator_monetization_qualified_views` | Covers `allday_public` (9am) and `record_public` (7pm), and `verify_public` when posted. The six free/pro kinds go to the groups → no API |
| Earnings (daily) | "Approximate earnings" CSV pasted into Sub Import → `fb_earnings_daily` (columns: total, content_monetization, stars, subscriptions) | Professional dashboard export | **Partly / TBD** — `monetization_approximate_earnings` (page; day/week/days_28/month; **breakdown `monetization_tool`**; "all revenue sources except bonuses") and `content_monetization_earnings` (breakdown `earning_source`; micro_amount + currency) | Whether `monetization_tool` enumerates `subscriptions` and `stars` is **not documented** in anything readable. Probe decides (§6). Example export row 2026-08-06: total 23.94 = subs 23.37 + content 0.57 + stars 0 — if subs are missing from the API, the API covers ~2% of revenue |
| Actual payouts (bank) | read off the dashboard, quoted in checkpoints | Payout settings | **No** | API = approximate earnings only |
| Group members / joins / active / posts / comments / reactions (free + Pro) | Group Insights export pasted → `fb_group_daily` | Group Insights | **No** — Groups API retired 2024-04-22, nothing since | Paste stays. This is the headcount truth for Pro (quote Insights, never roster) |
| Meta Subscribers list (names + start dates) | pasted (ENH-SUB-NAMES-01) | Business Suite | **No** | Stays paste |
| Views on reels posted into the groups | hand-read from Facebook | Group post UI | **No** | "Views" in briefs keep meaning the group numbers until the page series exists |
| YouTube Shorts (`allday_public`) | not held | YouTube Data/Analytics API | Possible, **different API, out of scope here** | Separate scope if wanted |

---

## 3. Access: what the token already has and what must change

- `fb-publish` runs on `FB_PAGE_ID` + `FB_PAGE_TOKEN` secrets (Supabase), Graph v25.0, a **Page token derived from a long-lived user token → never expires** (SOCIAL-01, verified 2026-07-09). The `status` action already round-trips the token and reads `followers_count`.
- That token was minted with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` — **it lacks `read_insights`**, which the Insights API requires (Page metrics and video insights; video insights docs also cite `pages_manage_engagement`). Any `/insights` call with the current token returns a permissions error.
- **Fix = one re-mint, same app, same 15-minute flow** as `docs/facebook_publishing_setup.md` Steps 2–5, adding `read_insights` (+ `pages_manage_engagement`) to the permission list, then `supabase secrets set FB_PAGE_TOKEN=…`. The Business-type app has no Live toggle and Standard Access covers Pages the operator administers; `pages_read_engagement` is documented as no-review, and the 7/9 flow proved Standard Access for `pages_manage_posts`. Confirm `read_insights` behaves the same at mint time (the Explorer refuses it immediately if not). Only Page **admins** can query earnings metrics — the operator's account is one.
- Earnings are visible to the API only because the operator's account has full control of the Page. No new secrets, no new app, no Business Verification.

---

## 4. Proposed build (if the §6 probes pass)

**Trigger (non-negotiable shape):** a **"Pull from Meta" button** on Admin → Sub Import (new tab "📡 Meta API") that calls a new edge function. Optional second entry point: a **non-blocking Step 6** at the end of the Daily Workflow that calls the same action (failure logs and never fails the workflow; the operator can turn it off in `app_config`). No pg_cron, no scheduler, no background writer.

**Edge function `fb-insights`** (service-role, `ADMIN_OPS_KEY` gate like `subscriber-admin`, same CORS/verify_jwt posture; deploy with the CLI if >30KB):
- `status` — token check + which metrics the page accepts (probe each metric name individually and report `invalid metric` per name, so a future Meta deprecation degrades one column, not the pull).
- `pull_page {since?, until?}` — default `since` = last stored day − 3 (re-fetch the trailing 3 days because Meta finalises daily insights with lag; upsert heals partials), `until` = yesterday ET. Writes `fb_page_daily`.
- `pull_earnings {since?, until?}` — `monetization_approximate_earnings` day + `monetization_tool` breakdown, `content_monetization_earnings` day + `earning_source`. If the breakdown carries subscriptions/stars: write `fb_earnings_daily` with a new `source` column (`'api'` vs `'paste'`, paste wins on conflict unless the operator chooses otherwise). If not: write `fb_page_daily.earnings_*` only and leave the earnings paste untouched.
- `pull_reels {days=30}` — list `/video_reels`, match to `marketing_reels` rows by `(created_time ≈ posted_at, kind ∈ public kinds)` with the description text as tiebreaker, store `fb_video_id` on the row, snapshot insights into `fb_reel_stats`.
- `backfill {since}` — same as `pull_page`/`pull_earnings` over 2026-08-23 → today (Meta retains 2 years for public Pages). This closes the MKT-74 G viewer→visit / visit→follow ask in one run.

**Tables (RLS on, zero policies, service-role only — the subscriber-tracking posture):**
- `fb_page_daily (day PK, media_views, media_views_from_followers, viewers_unique, page_visits, follows_total, follows_new, unfollows, video_views, video_view_time_s, earnings_approx_usd, earnings_content_usd, earnings_by_tool JSONB, pulled_at)`
- `fb_reel_stats (fb_video_id, as_of_day, kind, reel_date, plays, total_plays, avg_watch_ms, watch_time_s, qualified_views, pulled_at, PK (fb_video_id, as_of_day))` — one row per reel per pull day so 24h/72h/7d growth is readable.
- `marketing_reels.fb_video_id TEXT NULL` (link only).
- `fb_earnings_daily.source TEXT DEFAULT 'paste'` (only if the earnings probe passes).

**UI (admin surfaces only — subscriber UI untouched):**
- Sub Import → "📡 Meta API": Pull button, last-pull stamp, per-metric health list, backfill button, dry-run toggle (show what would be written).
- Funnel dashboard: "Page" card row (media views / viewers / visits / follows per day, 7-day and 28-day), followers field pre-filled from `fb_page_daily` with the manual override kept; earnings cards read API series when `source='api'` exists.
- Reels admin: plays / avg watch per public cut, 24h and 7d.
- Morning brief (`docs/morning_brief.md` runbook + `lib/brief/computeBrief.ts`): one page-views line, only after the series has ≥14 days.

**Effort:** Phase 0 probes 15 min operator time. Phase 1 (edge fn + two tables + Sub Import tab + Funnel cards + backfill) ≈ 1 working day. Phase 2 (reel linkage + Workflow step + brief line) ≈ half a day. No engine files touched; no public-facing strings; no brand exposure (read-only, nothing is posted).

---

## 5. Risks and limits (stated, not assumed)

1. **Monetization coverage is unknown until probed.** If `monetization_tool` lacks subscriptions, the API delivers views but **not the money that matters**; the earnings paste stays and the scope shrinks to Phase 1 minus earnings. Do not promise "monetization automated" before §6 Q2 returns.
2. **Metric churn.** Meta removed 23 fields on 2025-11-15 and 24 more on 2026-06-15; `page_video_views_unique` and all `*_impressions_unique` are gone. The pull must be per-metric fault-tolerant and pinned to v25.0+ names; the `status` action is the canary. Do not cross-compare `page_media_view` with any pre-2025 "impressions" figure.
3. **Daily lag.** Yesterday's page insights pulled at 07:30 ET can be partial; the trailing-3-day re-fetch handles it. Earnings are "approximate" by Meta's own definition and get adjusted retroactively — the dashboard must say "approximate", and payout readouts (e.g. the 9/24 $122.08 comparison) keep using the dashboard number.
4. **Token lifecycle.** The Page token dies on password change, app deauthorisation, or loss of the page role — exactly the `fb-publish` exposure, surfaced by the existing PAGE CONNECTION card. Re-mint restores both functions at once.
5. **Groups stay manual, by Meta's design.** No compliant tool reads Group Insights; anything claiming to is scraping the operator's own session (ToS exposure on a page that was actioned twice). Not proposed.
6. **Reel matching is heuristic** (time window + description). Mismatches are visible in the Reels admin and correctable by hand; the `fb_video_id` link is idempotent once set.
7. **Scope discipline.** This is a data-intake lane. It changes no reel, caption, cadence, kind, or consumer screen, and it is not a posting automation.

---

## 6. Phase 0 — operator probes (Graph API Explorer, after the re-mint)

Run with the **Page token** selected, Graph v25.0. Paste the raw JSON of each into the session; the four answers set Phase 1's scope.

```text
Q1  Page series exists?
GET /{page-id}/insights?metric=page_media_view,page_total_media_view_unique,page_views_total,page_follows,page_daily_follows_unique,page_video_views&period=day&since=2026-09-29&until=2026-10-06

Q2  Does the earnings breakdown name subscriptions / stars?   ← THE gate for the monetization half
GET /{page-id}/insights?metric=monetization_approximate_earnings&period=day&breakdown=monetization_tool&since=2026-09-29&until=2026-10-06
GET /{page-id}/insights?metric=content_monetization_earnings&period=day&breakdown=earning_source&since=2026-09-29&until=2026-10-06
(if "breakdown" is rejected, try breakdowns=monetization_tool — the Explorer's field picker shows the accepted spelling)

Q3  Public reels listable?
GET /{page-id}/video_reels?fields=id,created_time,description,permalink_url,updated_time&limit=10

Q4  Per-reel insights readable?
GET /{reel-id-from-Q3}/video_insights?metric=blue_reels_play_count,fb_reels_total_plays,post_video_avg_time_watched,total_video_view_total_time,creator_monetization_qualified_views
```

Pass criteria: Q1 returns daily values (not `invalid metric`) for at least `page_media_view`, `page_views_total`, `page_follows`; Q2 returns per-tool rows and names a subscriptions tool; Q3 lists the recent `allday_public`/`record_public` uploads; Q4 returns plays for one of them. Q1+Q3+Q4 passing with Q2 failing = build the views half only.

---

## 7. Decisions owed by the operator

1. Re-mint the token with `read_insights` and run §6 (15 min) — or decline, and this scope parks.
2. Entry point: button only, or button + non-blocking Workflow Step 6?
3. If Q2 passes: does the API series become the earnings truth (paste retired) or run alongside the paste for one month first? Recommendation: alongside for 30 days, compare, then retire.
4. YouTube: separate scope or not at all?

---

## Sources (read 2026-10-07)

- Meta — Page Insights overview, permissions, 2-year retention, June-2026 deprecation warning: https://developers.facebook.com/docs/platforminsights/page/
- Meta — Page insights metric reference (names, periods, `monetization_tool` / `earning_source` breakdowns): https://developers.facebook.com/docs/graph-api/reference/insights/
- Meta — Deprecated Page Insights metrics (2025-06-15, 2025-11-15 lists with replacements): https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics.md
- Meta — Page Insights API updates, 2025-08-15 (impressions → views, page fans removed 2025-11-15): https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/
- Meta — Video insights metrics (reels plays, watch time, ad-break earnings, admin-only earnings): https://developers.facebook.com/docs/graph-api/reference/video/video_insights/
- Meta — `/{page-id}/video_reels` edge: https://developers.facebook.com/docs/graph-api/reference/page/video_reels
- Meta — `read_insights` permission reference: https://developers.facebook.com/docs/permissions/reference/read_insights
- Supermetrics — June 30 2026 field changes (24 metrics sunset, replacements): https://docs.supermetrics.com/docs/facebook-insights-field-changes-june-30-2026
- Supermetrics — Insights update log (2025-05-27 monetization metrics added; 2025-11-13 23 fields removed): https://docs.supermetrics.com/docs/facebook-insights-updates
- Social Media Today — Meta API update notes (`content_monetization_earnings`, `monetization_approximate_earnings`): https://www.socialmediatoday.com/news/meta-announces-updates-marketing-graph-ad-copies-api/749366/
- Zernio API reference — units and non-comparability of the two earnings metrics: https://docs.zernio.com/analytics/get-facebook-post-earnings
- Ayrshare — Groups API removal 2024-04-22: https://www.ayrshare.com/facebook-removes-groups-api-access-impact-and-implications/
- bundle.social — permissions without App Review (`pages_show_list`, `pages_read_engagement`, `pages_read_user_content`): https://bundle.social/blog/facebook-api-permissions
