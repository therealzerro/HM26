# Growth checkpoint — 2026-10-15

Source: the operator's 10/15 paste of **Page-level** Meta Insights exports, window **9/17–10/14 (28 days)**: Approximate earnings (total + content_monetization + stars + subscriptions), Subscriptions earnings, Viewers, Content interactions, Facebook follows, Subscribers (current / gained / canceled / daily), Views + interactions + published by content type, Age & gender, Top cities, Top countries. This is the page-level daily series that had been owed since v6.1 §C / MKT-74 ("Page Insights DAILY export … the only page-level series we do not hold").

Ingested 10/15: `fb_earnings_daily` 9/17→10/14 (28 rows, upsert on `earn_date`; table now 283 rows, 1/1→10/14) and the new **`fb_page_daily`** table (28 rows: `viewers_unique`, `content_interactions`, `follows_new`, `subscribers_total`; ENH-FUNNEL-03 column names, RLS on, service-role only, no PII). Not in this paste and still not held: page followers total, media views per day, page visits.

**Gap:** earnings 9/13–9/16 (4 days) are in neither the 9/12 import nor this paste. September subscriptions are therefore known to **$91.73 (26 of 30 days)**; the missing days sit after the renewal wave, so the month is ~$95–100 — inside the 9/12 projection ($95–97) and above the ~$85 "cohort leaving" line. Owed: a 9/13–9/16 earnings paste to close September.

## Headline

| | 9/12 | **10/15** | Read |
|---|---|---|---|
| Page followers | 14,192 (9/12); 14,197 (9/15 snapshot) | — (not in paste) | +61 new follows in the 28d window |
| Free group | 515 (9/12); 530 (9/15 snapshot) | **633** (Insights age/gender total, 10/14) | +103 in a month; 112 joins in 27 days (4.1/day) |
| Meta Subscribers (page Insights, current) | list 60 | **52** (10/13; 10/14 = 0 is a partial-day artifact, stored NULL) | −8 since the 9/12 list; series 61 (9/17) → 52 (10/13) |
| Paying-equivalent (trailing 30d subs ÷ $1.74) | 59 ($103.32) | **52** ($90.87, 9/15–10/14 with the 4-day gap) | Insights 52 / paying-equiv 52 — the two live Pro numbers agree |
| Pro group Total Members (Insights) | 61 (9/11) | **54** (10/14; 62 peak 9/27–28) | −8 since the peak; flat at 54 for 10/11–10/14 |
| Sep subscription payouts | $69.40 (1–12) | **$91.73 (26/30 days known)** | vs Aug $122.08 → ≥75%, likely ~80% with the gap filled |
| Oct subscription payouts 1–14 | — | **$68.54** | Oct 1–12 $62.94 vs Sep 1–12 $69.40 = 91% |

Three Pro numbers 10/15: **group 54 (10/14) / page Subscribers 52 (10/13) / paying-equivalent 52** — within two of each other, the tightest agreement yet. Real conversion (Pro group ÷ free group) = 54 ÷ 633 = **8.5%** (11.8% on 9/12, 13.0% on 9/7, 14.5% on 9/2): the free room grows ~4/day, the Pro room does not.

Meta's own 28-day counters in the Subscribers block read **gained 12 / canceled 14** (net −2) while the daily headcount series falls 61 → 52 (−9). Different windows or definitions on Meta's side; the headcount series is the number to quote.

## Renewal waves (subscriptions, 4th–12th of each month)

| Wave | Subs payouts | vs prior wave |
|---|---|---|
| Aug 4–12 (launch cohort first payments) | $85.73 | — |
| Sep 4–12 (first renewal) | $64.47 | 75% |
| **Oct 4–12 (second renewal)** | **$60.13** | **93%** |

The decay is slowing: the cohort that survived its first renewal mostly renewed again. Biggest single days: 10/6 $10.05, 10/12 $10.21, 10/4 $8.93, 10/8 $8.85. Subscription payouts landed on 21 of 28 days; content monetization added $4.46 over the window (≤ $0.40/day), stars $0.

All-time subscriptions 1/1→10/14: **$395.91**.

## Page reach, engagement, follows — by week

| Week | Viewers/day | Interactions | New follows | Reels posted (all kinds) | of which public |
|---|---|---|---|---|---|
| 9/17–9/23 | 1,713 | 840 | 13 | 49 | 10 |
| 9/24–9/30 | **943** | **293** | 7 | **15** | 2 |
| 10/1–10/7 | 1,677 | 1,285 | 18 | 54 | 7 |
| **10/8–10/14** | **2,136** | 1,317 | **23** | 55 | 6 |

Reels-posted columns are `marketing_reels.posted_at` by ET day. The week of 9/24–9/30 had three days with nothing posted and two with two cuts; viewers, interactions and follows all halved that week and recovered as soon as posting resumed. The near-zero interaction days (≤15) are 9/19, 9/22, 9/23, 9/24, 9/27, 9/29, 9/30, 10/2 — six of the eight are the thin or missed posting days.

Window totals: viewers avg **1,682/day** (Sep 17–30: 1,328 · Oct 1–14: 1,906 · last 7: 2,136, the best stretch in the window); interactions **3,735** (Sep 17–30: 1,133 · Oct 1–14: 2,602); follows **61** (1.4/day late Sep → 2.9/day in Oct).

## Content mix (28d, page)

| Type | Views | Share | Interactions | Interactions / 1,000 views | Published |
|---|---|---|---|---|---|
| Reels | 169,467 | 52.8% | 3,332 | **19.7** | 80 |
| Links | 127,148 | 39.6% | 182 | 1.4 | — |
| Multi photo | 13,331 | 4.2% | 153 | 11.5 | — |
| Photo | 10,895 | 3.4% | 67 | 6.1 | 18 |
| Stories | — | — | 1 | — | 90 |

Reels carry 89% of all interactions on 53% of views: **2,118 views and 41.6 interactions per published reel**. Link posts take 40% of views but convert to interactions at 1/14th the reel rate — they are reach, not engagement (consistent with MKT-74: caption line one = free-board URL; the link is the job, not the like).

## Page audience (Insights, 28d)

| Age | Women | Men |
|---|---|---|
| 18–24 | 0.9% | 1.0% |
| 25–34 | 9.3% | 10.9% |
| 35–44 | 10.5% | 11.1% |
| 45–54 | 10.3% | 6.3% |
| 55–64 | 12.4% | 5.0% |
| 65+ | **17.1%** | 5.2% |

60.5% women / 39.5% men; 45+ = 56%; 55+ = 40%; women 65+ is the single largest cell. Countries: **US 70.4%**, Vietnam 3.4%, India 2.3%, Brazil 1.6%, Philippines 1.6%, UK 1.2%, Egypt 1.0%, Indonesia 1.0%, Mexico 1.0%, Canada 0.9% — roughly **30% of the page audience is outside the US** and cannot act on a US 3-digit board. Top cities: New York 1.5%, Ho Chi Minh City 0.7%, Chicago 0.6%, Hanoi 0.5%, Houston 0.5%, Los Angeles 0.5%, Cairo 0.4%, Detroit 0.4%, Philadelphia 0.4%, Phoenix 0.4%.

Contrast with the free group (9/7 import): 88% US, 55% women, 45–54 largest. The page skews older, more female and less US than the group that converts — the group is the better-qualified audience, which is the existing tier map.

## What this changes

- **Pro:** the two live Pro numbers agree at 52 (Insights headcount / paying-equivalent). Second renewal held at 93% of the first; September lands ~80% of August once the 4 missing days arrive.
- **Top of funnel:** page reach and follows are the highest in the window right now (2,136 viewers/day, 23 follows in the last week) and track posting volume day for day. Weeks with full posting run ~1,700–2,100 viewers/day; the thin week ran 943.
- **Content:** reels do the engagement work; links do the reach work. No change proposed to either.
- **Audience:** 30% non-US on the page is a ceiling on page-level conversion that the group does not have.

## Pro group (Insights download 9/17–10/14, ingested to `fb_group_daily`)

| Week | Members (end) | Posts/d | Comments/d | Reactions/d | Active/d | Active % |
|---|---|---|---|---|---|---|
| 9/17–9/23 | 60 | 4.7 | 1.1 | 2.7 | 24.0 | 40% |
| 9/24–9/30 | 59 | **2.3** | 1.6 | 1.4 | 22.1 | 38% |
| 10/1–10/7 | 56 | 4.6 | 0.9 | 3.1 | 19.3 | 34% |
| 10/8–10/14 | 54 | 5.6 | 1.6 | 2.4 | 18.4 | 34% |

Members: 61 (9/17) → 62 (9/27–28) → **53 (10/10) → 54 (10/11–10/14, four flat days)**. Eleven single-member drop days; the slide is concentrated **9/29–10/10 (62 → 53)**. Pending/approved/declined requests 0 all window — nobody is joining the Pro group through the group door; subscriptions arrive via the page. One post removed by admin.

Member-authored posts in the room, in date order: "Are todays numbers posted 23 Sept?" (4 comments, 33 views — the most-discussed post in the window), "Todays numbers are not posted yet 24th Sept", "where are today's numbers?", "Where's the numbers", "Another day and no numbers! I'd appreciate better communication." — plus one new-member introduction (3 reactions). Boards were not posted on 9/22, 9/24, 9/25, 9/27, 9/29 and 9/30 per `marketing_reels.posted_at`; the membership slide begins 9/29. Active % fell from 44–48% (September checkpoints) to 34%.

Popular times: 8–9 AM dominates every day (the 8:30 drop), Saturday is the busiest day (12 interactions), Monday the quietest (5).

## Free group (Growth/Engagement export 9/17–10/13, ingested to `fb_group_daily`)

| Week | Joined/d | Viewed/d | Engaged/d | Posts/d | Comments/d | Reactions/d |
|---|---|---|---|---|---|---|
| 9/17–9/23 | **5.6** | 134 | 2.7 | 14.6 | 3.4 | 7.7 |
| 9/24–9/30 | 3.6 | 151 | 1.9 | 12.1 | **0.6** | 4.4 |
| 10/1–10/7 | 3.6 | 155 | 2.3 | 13.6 | 0.9 | 7.4 |
| 10/8–10/13 (6d) | 3.8 | 149 | 3.3 | 16.5 | 3.8 | 6.0 |

112 joins in 27 days (4.1/day; 14 on 9/18, the day of the WI straight-match post). **Viewed 147/day = 23% of 633** — up from 68/day = 13% of 515 at the 9/12 checkpoint; the room is read twice as much as a month ago. Comments 2.1/day over the window (0.6/day in the thin week, 3.8/day last week), reactions 6.4/day. Popular days Friday (30) and Monday (25); popular hours 8–10 AM.

Top posts (views): the 9/18 match announcements naming the state (527, 538), the 10/12 welcome post (630) and a pre-window "Direct Hit … NC" post (1,245) lead; templated drops run 20–180. Same observation as 9/7 — state-named match posts out-view templated drops 3–5× — and the same standing rule: never propose reverting vocabulary; the ruling question (state + result in MATCH vocab on free verify captions) stays open.

**Member-posted content to rule on:** roughly a third of the listed top posts come from one member account posting daily emoji "GOOD for ALL States" pick charts with links to its own group and YouTube channel, and twice soliciting payment for picks inside the room ("Cash app, Chime or apple pay only!!! Inbox me"). Those posts draw 30–165 views and 0–4 comments. They are gambling-vocabulary content on a brand-rehab surface and a funnel leak; moderation is the operator's call. A second member posts raw daily results lists ("From alldraw fill in the blank pattern").

Audience (633): **64.5% women**; 45–54 = 31.6% (largest), 35–54 = 57%, 45+ = 60%; **US 87.4%**, Bahamas 6.2% (Nassau 29 + Freeport 7 — a real cluster), Nigeria 8, South Africa 7; non-US 12.6%. Cities: New York 72, Nassau 29, Detroit 21, a Mississippi cluster of 51 across 17 towns (Jackson 9, Canton 6, Tupelo 6), Atlanta 7, Houston 6. Versus the page (70% US, 60% women, 65+ women largest): the free group is more US, more 35–54, and the Bahamas cluster is group-only.

## Still owed

- Earnings 9/13–9/16 (closes September).
- Group series 9/12–9/16 (5 days) — the 9/12 import ended 9/11 and these pastes start 9/17. Pro group 10/14 is in; free group 10/14 was blank in the export.
- Page followers total (funnel snapshot last typed 9/15 = 14,197).
- A ruling on the member account selling picks in the free group (above).
- Sub Import has no paste parser for the page-level export yet (this checkpoint went in by SQL); ENH-FUNNEL-03 `fb_page_daily` now exists with the scoped column names, so an API pull or a parser lands in place.

Not proposed (standing rulings): per-state lists, accuracy levers, scheduled posting, Instagram, scope distinctness, quoting any of these numbers in copy.
