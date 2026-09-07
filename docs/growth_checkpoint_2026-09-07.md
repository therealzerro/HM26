# Growth checkpoint — 2026-09-07

Source: operator-pasted Facebook Group Insights export for the Pro group (4/1–9/6: daily series, contributors, popular days/times, top posts), the Meta "Approximate earnings" export (1/1–9/7), and the operator's 9/7 funnel snapshot. Member names from the exports are NOT recorded here (PII stays service-role only). Builds on `growth_checkpoint_2026-09-02.md` — read that first; this file records what changed.

Data written (service-role SQL mirroring the `subscriber-admin` edge function; audit rows in `subscriber_import_history`): 18 Pro contributors upserted (`fb_group_contributors`, window end 9/6) + 18 `fb_engagement_snapshots`; 147 days into `fb_earnings_daily` (4/14→9/7, 6 new); 139 days into the NEW `fb_group_daily` table (Pro, 4/21→9/6; zero rows before 4/21 dropped; `total_members` NULL before 6/10 when Insights first reported it).

## Headline

| | 9/2 | 9/7 | Δ |
|---|---|---|---|
| Page followers | 14,184 | 14,185 | +1 |
| Free group | 470 | 485 | +15 (3.0/day — up from 1.8/day since 8/16) |
| Pro roster active (app) | 71 | 72 | +1 |
| **Pro group Total Members (Insights)** | 68 (9/1) | **63 (9/6)** | **−5** |
| Gross MRR (roster × $2.49) | ~$177 | ~$179 | flat on paper |
| Conversion (roster / free) | 15.1% | 14.85% | displayed |
| Conversion (group members / free) | 14.5% | **13.0%** | real |

**The churn window opened on schedule.** The 9/2 checkpoint said the 49 August subscribers renew 9/4–9/23 and that engagement decay was the precursor. Members went 69 (9/3) → 67 → 66 → 63 (9/6): −6 in three days, ~9% of the base, on the first renewal dates.

**Roster now overstates Pro by 9.** The app roster carries 72 active while the group holds 63. The 13 May-era churn candidates flagged 9/2 are still unreviewed, and the 9/4–9/6 departures are not in any email export yet. Until the roster is reconciled, use the Insights member count as the Pro headcount and treat the funnel tab's 14.85% as an upper bound. (The Funnel dashboard now shows both numbers side by side — see "In-app" below.)

## Meta payouts (1/1–9/7 export; the 8/4–8/12 cohort's renewals are the test)

| Month | Subscriptions (net) | Content + stars | Total |
|---|---|---|---|
| Apr (from 4/14) | $5.43 | $52.58 | $58.01 |
| May | $36.63 | $4.45 | $41.08 |
| Jun | $38.00 | $8.40 | $46.40 |
| Jul | $33.50 | $0.88 | $34.38 |
| Aug | $122.08 | $4.04 | $126.12 |
| **Sep 1–7** | **$29.84** | $0.34 | $30.18 |
| All-time | $265.48 | $70.67 | $336.15 |

- Export values for 4/15–9/1 are byte-identical to the 9/2 import (spot-checked 8/25–9/1); 9/2 was revised from $0.00 to $0.07 (content).
- **Renewal read, 4 days in:** Sep 4–7 subscriptions $24.91 vs Aug 4–7 $48.29 → **52%**. Sep 1–7 vs Aug 1–7: $29.84 vs $50.72 → 59%. Early — Meta's daily postings wobble ±1 day and 9/6 alone was $11.80 — but the direction agrees with the member count. The full number is still the 9/24 readout vs August's $122.08 (below ~$85 = the spurt cohort is leaving).
- Last-30-day subscription payouts (8/9–9/7) $85.55 vs roster net MRR $125.50 → **68%**. The roster is 32% above what Meta is actually paying; the 9 phantom actives plus the pre-August legacy $0.99 subs explain most of it.
- Content monetization remains ~$0.05/day. Not a revenue line.

## Pre-July history (new in this export)

Insights engagement runs from 4/21; the member count only reports from 6/10 (37). By period (daily means):

| Period | Members (end) | Posts/d | Comments/d | Reactions/d | Active/d |
|---|---|---|---|---|---|
| 4/21–4/30 (launch) | n/a | 4.5 | 0.6 | 1.7 | 2.9 |
| 5/1–5/14 | n/a | 3.4 | 2.1 | 3.0 | 9.1 |
| 5/15–5/31 | n/a | 5.6 | 4.2 | 8.4 | 14.9 |
| 6/1–6/14 | 39 | 3.9 | 2.9 | 5.4 | 19.5 (50%) |
| 6/15–6/30 | 33 | 1.8 | 0.7 | 0.9 | 12.8 (39%) |
| 7/1–7/28 | 21 | **0.0** | 0.0 | 0.1 | 1.2 (6%) |
| 7/29–8/5 | 28 | 4.9 | 2.0 | 3.6 | 9.8 (35%) |

Two pre-August engagement peaks: 5/19 (12 comments / 29 reactions) and 5/30 (22 / 24) — both human-thread days, same pattern as the August peaks. The June slide (39 → 33) began while posting was still ~2/day; the July collapse (33 → 21) was 28 consecutive days of zero posts. Posting cadence and membership move together at every turn in this series; there is no era where members held with the feed silent.

## Pro group engagement by week (extends the 9/2 table)

| Week | Members | Posts/d | Comments/d | Reactions/d | Active/d | Active % |
|---|---|---|---|---|---|---|
| 8/6–8/12 | 63 | 8.1 | 15.0 | 25.7 | 43.7 | 69% |
| 8/13–8/19 | 69 | 5.1 | 3.1 | 10.4 | 46.9 | 68% |
| 8/20–8/26 | 69 | 4.4 | 1.3 | 7.4 | 35.9 | 52% |
| 8/27–9/2 | 68 | 3.7 | 0.6 | 1.9 | 29.7 | 44% |
| **8/31–9/6** | **63** | 4.0 | **0.1** | 1.7 | 27.7 | 44% |

(Active % uses week-end members; the 9/2 doc used the same formula with slightly different rounding.) One member comment in seven days. Zero-comment days: 10 of the 18 since 8/20. The pipeline is posting 4/day into silence. 9/6 (Sunday) had 39 active — the highest since 8/24 — on the day the member count dropped 3; likely members checking the group around renewal, not a re-engagement.

## Contributors (28-day rolling window to 9/6, vs window to 9/1)

| | to 9/1 | to 9/6 |
|---|---|---|
| Members with any activity | 24 | 18 |
| Member posts | 8 | 6 |
| Member comments | 75 | 51 |
| Member reactions | 109 | 90 |

Six members fell out of the active window; none entered. The three most active commenters and the two most active reactors are unchanged from 9/2.

## What engaged (delta since 9/2)

Leaderboard unchanged at the top: the "two different lists" thread (13c), "box vs straight" (11c), the human-written Morning Brief announcement (6c/10r, 51 views), welcomes, and "not state specific?" (6c). Nothing posted since 9/2 has drawn more than 1 comment. The same-day midday verify post (the MKT-69 "8h 11m" straight-match reel, the one Meta's recommendation explicitly asked for) drew 0 comments / 1 reaction / 21 views inside Pro. Templated slate posts now land at 15–25 views (25–40% of members), down from 30–60 in mid-August.

Popular days/times unchanged: 8–10 AM and 5–7 PM, Tuesday top, Wed/Thu lowest. The 8:30 AM / 5:00 PM drop cadence still matches.

## Diagnosis (updated)

1. **Churn is now measured, not predicted.** −6 members in the first three renewal days; subscription payouts running ~52–59% of the same August days. Expect the count to keep sliding through 9/23; the monthly payout export is the definitive number.
2. **Nothing from the 9/2 retention list has shipped in the group** (onboarding pin, anchor-thread question, Sunday receipts thread). Comments went 0.6/d → 0.1/d in the week since. The lever that produced every engagement peak in this series (a human asking or answering something) has not been pulled since the Morning Brief announcement.
3. **Top of funnel improved.** Free group +3.0/day vs +1.8/day, with the page flat (+1 follower). The gain is arriving through the group, not the page. YouTube was enabled for the allday_public leg on 9/2 (MKT-15/65 ruling); attribution to it is not possible from these exports.

## In-app (shipped 2026-09-07 with this checkpoint — ENH-FUNNEL-02 in MASTER_AUDIT)

- **Sub Import → 🔥 Insights accepts the whole Group Insights download as pasted.** The parser is section-aware: the daily block → new `fb_group_daily` table; the Contributors block → `fb_group_contributors` + `fb_engagement_snapshots` as before; Popular Days/Times and the Posts block (member names + post text) are skipped and never stored. Before this, the daily rows parsed as contributors named "2026-04-21".
- **Funnel Intelligence** now shows: PRO GROUP (Insights members, as-of date) beside ACTIVE PRO (roster) with the gap called out; REAL CONVERSION (group members ÷ free group); an **Engagement pulse** card (last 7 days vs prior 7: posts, comments, reactions, active/day, active %, member Δ); a **Renewal wave** card (month-to-date subscription payouts vs the same days last month, and the last 7 days vs the same 7 days a month earlier).
- **Pro Subscribers** shows a roster-vs-group banner when the roster exceeds the Insights count, pointing at Probe Potential Churns.

## Free group (Growth/Engagement export 4/14–9/6 + Insights download, ingested 9/7 evening)

Ingested: 139 daily rows into `fb_group_daily` (`group_type='free'`; columns Joined → `joined`, Posted or Commented → `engaged_members`, Viewed → `active_members`; no member count in either export), 20 contributors (window end 9/6, all already on file from the 5/19 import), one `group_insights` history row. The Insights *download* variant carries a bare "Date" header with empty metric columns — that is why the in-app import "did not understand" it; the parser now skips that block with a warning and reads the Growth/Engagement export for the series (BUG-176).

**Intake (Joined, the free group's own count of new members):**

| Period | Joined | /day | Viewed/day | Engaged/day | Comments/day |
|---|---|---|---|---|---|
| 6/15–6/30 (first reported) | 37 | 2.3 | 36 | 1.4 | 2.1 |
| 7/1–7/28 | 12 | 0.4 | 19 | 0.3 | 0.0 |
| 7/29–8/5 | 72 | 9.0 | 80 | 2.5 | 8.0 |
| **8/6–8/12 spurt** | **142** | **20.3** | 202 | 5.6 | 13.7 |
| 8/13–8/19 | 30 | 4.3 | 129 | 2.1 | 4.9 |
| 8/20–8/26 | 8 | 1.1 | 80 | 1.3 | 1.1 |
| 8/27–9/2 | 15 | 2.1 | 58 | 1.1 | 1.7 |
| 8/31–9/6 | 24 | 3.4 | 69 | 1.6 | 3.6 |

335 joins since 6/13; 172 of them in 8/4–8/12. Joined per day agrees with the funnel snapshots (3.0/day 9/2→9/7 vs 3.4 here) — the two sources reconcile. Viewed/day (members who opened the group) is 60–90 lately, i.e. **12–18% of the 485 members see the group on a given day**; the 8/6–8/12 peak reached ~200 (40%+). Comments 3.6/day this week, up from 1.1–1.7 the prior two weeks — the free room is currently more conversational than Pro (0.1/day).

**Who they are (Insights download, aggregates only):** 55% women; 45–54 is the largest band (149 = 31%), then 35–44 (116) and 55–64 (95); 18–24 is 1.5%. Country: US 424 (88%), Bahamas 27, then single digits. Cities: New York 58, Nassau 19, Detroit 14, then a Mississippi cluster (Canton, Jackson, Starkville, Tupelo, Aberdeen, Cleveland, Columbia, Vicksburg… ≈35 combined), Georgia and the Carolinas. Weekday distribution is flat (16–19). Popular hours 8–11 AM and 5–7 PM — same as Pro.

**What engaged (top posts):** the four highest-view posts are all pre-rebrand voice — "🚨 8/6 MIDDAY GIANT WIN IN CO" 1,054 views, "🎯 Direct Hit from the Midday Board in NC … Only in the Pro Group" 850, "STRAIGHT MATCH TODAY! From the … ALLDAY Picks" 727, "8/10 Early Evening Matches. Here's your reason to join the Pro Group" 662 — versus 45–165 for the templated drops. Top by comments: a member's "Hit Master stays on top with the 💰💰💰💰" (8c/15r), the 8/13 covered Midday drop (8c/8r — the covered board draws questions), two member intros (6c each), "Thank you for what you do!" (6c/8r). The START HERE FAQ pin (posted 9/7) is at 3c/2r/57 views. Members' own posts ("I'm ready to start winning", "Hopefully I can finally win something") carry the vocabulary the brand avoids — that is the audience talking, not the page, and it is tier 2 where it is legal.

**Read:** the free group's outsized posts were the ones that named a state and a result in plain words ("WIN IN CO", "Direct Hit … NC"). That vocabulary is barred on tier 1 and the rebrand replaced it with MATCH / STRAIGHT MATCH in the free room too; views per post fell from 660–1,050 to 45–165 across the same period that intake fell from 20/day to 3/day. Correlation, not proof — the spurt itself was driven by the session-wave launch — but it is the one variable in the free room's history that moved with views. Not proposed: reverting vocabulary on any surface (brand law); worth a ruling: whether the *free* room's verify captions may name the state and the result in MATCH vocabulary ("STRAIGHT MATCH in NC this morning") rather than "from coast to coast".

## Actions (operator decisions)

- **Reconcile the roster before the next funnel snapshot:** review the 13 churn candidates (Sub Import → Probe Potential Churns) and import a fresh supporter export after 9/23 so `active_pro_subscribers` stops reading 72 against a 63-member group.
- **Ship the no-code retention items from 9/2 #2 this week** — they are the only proposals that act inside the renewal window. Pin the "how to read the board" reel + 5-line FAQ (answers the four confusion threads verbatim); add one question to the Morning Brief post; Sunday receipts thread.
- **Read the September payout export on 9/24** (day after the last August renewal date). Compare to $122.08. Paste it into Sub Import → Earnings; the Renewal wave card computes the ratio.
- Everything else from the 9/2 ranked list stands (caption CTA line needs MKT-15 copy ruling; annual tier; replace the free-group All-State Scan; Apple Developer account).

Not proposed (standing rulings): per-state lists, accuracy levers, scheduled posting, Instagram, scope distinctness.
