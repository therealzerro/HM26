# MKT-86 — E4 / E5 / E6 scopes (Ledger work order 2026-10-15, "scope only")

Nothing in this file is built. Each scope says what exists today, what the build would be, what fills automatically versus what the operator pastes, and the cost. Standing rules apply throughout: no scheduled jobs (the Daily Workflow click and the operator's exports are the only triggers), no accuracy claims, none of these numbers in public copy, no member data leaves the app.

---

## E4 — Weekly growth readout template

**Ask.** The 10/14–10/15 growth report as a repeatable Monday template the operator feeds from his Meta exports: free joins, Pro gained/canceled, Pro active %, free daily readers, best and worst posts.

**What exists today.** Every number in the 10/15 report already lands in four tables through Sub Import (📧 Subscribers, 🔥 Insights, 💵 Earnings, 📄 Page): `fb_group_daily` (both groups), `fb_earnings_daily`, `fb_page_daily`, `pro_subscribers`. The Funnel dashboard already computes the Pro pulse, the free-group pulse, the renewal wave and the page reach from them. The only inputs with no home are the two Group Insights **Top Posts** blocks (member names + post text → never stored, PII rule) and the page **content-type** block (views by Reels/Links/Photo → skipped by the page parser).

**Build.** One script, `scripts/weekly-growth-readout.ts` (also an Admin → Funnel "📋 Copy weekly readout" button reading the same helper), that renders a fixed Markdown block for the last complete Mon–Sun week vs the week before:

| Line | Source | Fills automatically? |
|---|---|---|
| Free joins (week, per day) | `fb_group_daily.free.joined` | **Yes** once the free Growth export is pasted |
| Free daily readers (Viewed/day, % of members) | `fb_group_daily.free.active_members` ÷ latest headcount | **Yes** (headcount from the free Insights age/gender total or the funnel snapshot — operator types it) |
| Free comments / reactions per day | `fb_group_daily.free` | Yes |
| Pro members start → end of week | `fb_group_daily.pro.total_members` | Yes once the Pro Insights export is pasted |
| Pro gained / canceled | Meta's Subscribers counters are 28-day windows, not weekly | **Pasted** (operator types the two counters) or derived as Δmembers only |
| Pro active % (7d) | `fb_group_daily.pro.active_members` ÷ members | Yes |
| Pro comments per day, zero-comment days | `fb_group_daily.pro` | Yes |
| Page viewers/day, interactions, new follows | `fb_page_daily` | Yes once the page exports are pasted |
| Subscription payouts (week) + renewal-wave ratio | `fb_earnings_daily` | Yes once the earnings export is pasted |
| Best and worst posts | Group Insights Top Posts block | **Pasted by hand, counts only** — the parser never stores post text; the operator copies the top three titles with views into the readout, no member names |
| Reels posted per day (our side) | `marketing_reels.posted_at` | Yes |

Output: a `docs/growth_weekly/YYYY-WW.md` file plus clipboard text. Lint: none needed (internal), but the script refuses to print any string that matches an email or the placeholder domain.

**Cost.** ~half a day: one script, one Admin button, one doc template. Depends on the operator pasting four exports each Monday (free growth, Pro Insights, page series, earnings) — the readout prints "no data this week" per line otherwise, never a stale number.

**Not in scope.** No API pull (ENH-FUNNEL-03 remains scoped). No automatic Monday run.

---

## E5 — Conversion trace

**Ask.** Per week, Pro signups next to the featured-post variant (A/B/C) live that week and the straight-match days, using caption v2 ids, so we learn which door works.

**What exists today.**
- Pro signups per day: `pro_subscribers.date_subscribed` is the join date only when the supporter export carries dates (the 10/15 export did not: 11 rows are dated by import day and flagged "unknown real start"). Meta's own **Gained subscribers** counter is 28-day, not daily. The daily `fb_page_daily.subscribers_total` series gives a net headcount per day, which is the only daily signal we hold.
- Featured post variant: not recorded anywhere yet. The captions PDF prints the variant by ISO week (A/B/C = week % 3) from 10/15, so the variant is derivable from the date — but only if the operator actually posted it that Monday.
- Straight-match days: `adaptive_tracking.hit_straight` per date and scope — fully available.
- Caption v2 ids: `constants/captionBanks.v2.json` ids exist; `marketing_reels.caption_meta` (MKT-85 build 2) is NOT landed, so no id is stored on a published row yet; `live_kinds` is empty.

**Build (two stages).**
1. *Record the doors.* (a) Land MKT-85 build 2's `caption_meta` so every published row carries the hook/CTA/question ids. (b) Add a "Featured post posted" tick in Admin → Reels (date, variant A/B/C) stored in a tiny `featured_post_log` table. (c) Keep asking for the supporter export **with dates** monthly, so `date_subscribed` is real.
2. *Trace.* A query joining, per ISO week: net Pro headcount Δ (`fb_page_daily.subscribers_total`), joins with real dates (`pro_subscribers` where notes lack "unknown real start"), the featured variant live that week (`featured_post_log`), straight-match count and the states (`adaptive_tracking`), and reels posted. Output as a table in the E4 readout. With ~1 signup every 2–3 days, the trace needs **8–12 weeks** before any variant difference clears noise; say so on the readout so nobody reads a two-week split as a result.

**Cost.** Stage 1 ~one day (caption_meta migration + Admin tick + table); stage 2 ~half a day. The honest finding may be "no door is distinguishable at this volume"; the trace still earns its keep by recording what was live when.

---

## E6 — Roster reconcile script (monthly, dry-run diff)

**Ask.** The monthly reconcile against Meta's subscriber list as a script with a dry-run diff.

**What exists today.** Sub Import → 📧 Subscribers already does the reconcile interactively (parse → upsert → Probe Potential Churns → Mark all churned), but it requires a date on every row, so an email-only export (10/15) cannot go through it. The 10/15 reconcile was done by SQL, counts only.

**Build.** `scripts/roster-reconcile.ts <export.txt> [--apply] [--churn-date=YYYY-MM-DD]`:
- Accepts all three Meta layouts: supporter emails **with** dates, emails **only**, and the Subscribers **names** list (name + "Mon D, YYYY"), using `lib/subscriberEmailParser.ts` (extend it to accept the email-only layout with a warning instead of rejecting it — that is the one parser change).
- Dry run (default) prints a diff with **counts and masked identities only** (never a full email on stdout): new (not on roster), matched active, matched churned (re-activations), active-not-in-export by cohort month, and the name-keyed placeholder rows it cannot judge.
- `--apply` performs exactly what the app does: upsert (new rows dated from the export or, for the email-only layout, the churn date with the "unknown real start" note), re-activate matches that were churned, and mark active-not-in-export churned on `--churn-date` (default = today ET) — **only with `--apply`, and it refuses to churn more than 40% of the active roster without `--force` (the 10/15 case was 45%, which is why the ruling was asked for first).**
- Writes a `subscriber_import_history` row (`subscriber_emails`, actor `roster-reconcile`), like today's SQL did.
- Ruling encoded (Ledger 10/15): Meta's current subscriber list is the source of truth for Pro headcount; absent from Meta's active list = churned on the reconcile date.

**Cost.** ~half a day. Runs when the operator runs it (monthly, after the Meta export) — never scheduled.

---

### Order the parent recommends if asked to build
E6 first (closes the roster-truth loop, one parser change, half a day), then E4 (the readout; depends only on the four pastes), then E5 stage 1 (needs MKT-85 build 2, which is already owed).
