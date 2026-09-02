# Growth checkpoint — 2026-09-02

Source: operator-pasted Facebook Group Insights export for the Pro group (7/4–9/1) plus headline counts. Member names from the export are deliberately NOT recorded here (PII stays service-role only).

## Headline

| | 8/16 | 9/2 | Δ |
|---|---|---|---|
| Free group | 440 | 470 | +30 (≈1.8/day) |
| Pro subscribers | 67 | 68 | +1 |
| Gross MRR ($2.49) | ~$167 | ~$169 | flat |
| Free→Pro conversion | 13–15% | 14.5% | stable, still 3–5× freemium norm |

Pro member count: 26 (7/4) → 20 (7/29, July decay at 0 posts/day) → 63 (8/12, +41 in 8 days, session-wave/covered-board launch) → 69 (8/19) → 68 (9/1). Zero net growth for 14 days.

## Pro group engagement by week (daily means)

| Week | Members | Posts/d | Comments/d | Reactions/d | Active/d | Active % |
|---|---|---|---|---|---|---|
| 8/6–8/12 | 63 | 8.1 | 15.0 | 25.7 | 43.7 | 82% |
| 8/13–8/19 | 69 | 5.1 | 3.1 | 10.4 | 46.9 | 71% |
| 8/20–8/26 | 69 | 4.4 | 1.3 | 7.4 | 35.9 | 52% |
| 8/27–9/1 | 68 | 3.7 | 0.7 | 1.5 | 30.5 | 44% |

Comments and reactions collapsed ~95% in three weeks; active share halved. Three straight days (8/30–9/1) at 0 comments and ≤1 reaction. July's 26→20 slide happened under the same conditions (no engagement) — this is the churn precursor.

## What engaged (top posts by comments+reactions)

1. Morning Brief announcement (human-written, @everyone) — 21c / 31r / 66 views.
2. Member confusion threads: "two different lists, which one?" (13c), "does everyone understand box vs straight?" (11c), "not state specific, run it in as many states as you can?" (8c), "playing from NY, is this all-state?" (6c).
3. New-member welcome posts (5–8 reactions each).
4. Straight-match callouts with a state named (5–7 reactions).
5. Templated daily slate captions ("Six Evening signals for 8/25, straight from the engine…"): 0–1 comments, 1–4 reactions, 21–42 views. The pinned Pro welcome post: 17 views total.

Reads: onboarding confusion is the #1 engagement driver (a gap, not a feature); pipeline captions are consumed but never answered; views per post = 30–60% of members even on the best days.

## Timing

Popular hours: 8–10 AM (brief + boards) and 5–7 PM (evening board). Tuesday is the top day; Wed/Thu lowest. Matches the 8:30 AM / 5:00 PM Pro drop cadence — no change needed.

## Free-group "All-State Scan" content

The overdue scan (draws-since per pattern class, 41 states) is the same genre Lottery Post gives away free and carries no forward information (COHORT-01: overdue cohorts flat, 4× confirmed). It is undifferentiated top-of-funnel content in the exact vocabulary Meta classified as gambling-adjacent. Recommendation below.

## Meta payouts (actual, from the Approximate-earnings export 4/15–9/2)

| Month | Subscriptions (net) | Content + stars | Total |
|---|---|---|---|
| Apr (from 4/15) | $5.43 | $52.57 | $58.00 |
| May | $36.63 | $4.45 | $41.08 |
| Jun | $38.00 | $8.40 | $46.40 |
| Jul | $33.50 | $0.88 | $34.38 |
| Aug | $122.08 | $4.04 | $126.12 |
| Sep (1–2) | $2.81 | $0.03 | $2.84 |
| All-time | $238.45 | $70.36 | $308.81 |

- Per-renewal amounts in the export are $1.74 and $0.69 = 70% of $2.49 and $0.99. The 70% net constant in the funnel table is confirmed against real payouts.
- May–Jul subscriptions were flat at ~$35/mo ≈ 20 renewals — the May roster. August tripled on the 8/4–8/12 spurt ($85.73 in nine days).
- Content monetization is ~$0.05/day; the April total is one $46.18 day (4/22). Not a revenue line.
- Roster net MRR $118.52 vs last-30-day subscription payouts $122.46 — consistent; the roster is the right model.
- **Renewal test:** the 49 August subscribers renew 9/4–9/23. September subscription payouts vs August's $122.08 is the first real churn number. Below ~$85 = the spurt cohort is leaving.

## Diagnosis

Conversion is not the problem (14.5%). Two constraints:
1. **Top of funnel starved by design** — the only intake is the de-recommended FB page and the free group; the four public platforms are switched off (MKT-16), so 8 reels/day are produced and ~1 leaves the FB estate. Free group +1.8/day × 14.5% ≈ 0.26 Pro/day ceiling.
2. **Pro engagement decay → churn** — broadcast-only cadence since 8/13; nothing in the group asks members for anything.

## Proposals (ranked by expected effect ÷ effort)

1. **Flip YouTube Shorts on** (allday_public + verify_public, already built, gated, Q1/Q2 records exist). Operator-only decision per MKT-65. Only zero-cost intake channel not subject to the FB de-recommendation. Watch: subscriber → free-group link clicks.
2. **Retention loop in Pro (no code):** (a) replace the pinned welcome with a 60-sec "how to read the board" reel + 5-line FAQ answering the four confusion threads verbatim; (b) make the Morning Brief the single daily anchor thread and ask one question in it ("which board are you on today?"); (c) weekly "receipts thread" Sunday where members post their state's matched draws — crowd-sourced verify, tier-3 vocabulary.
3. **Caption CTA line (small code, `scripts/reel-captions.ts`):** append one rotating question to Pro/Free captions. Templated captions currently get 0 comments; the human posts get 5–21. Needs MKT-15 copy ruling.
4. **Annual Pro tier** ($19.99 ≈ 8 months) offered to the 8/4–8/12 cohort before their second renewal; converts the most-engaged 30 into prepaid, churn-proof revenue. Founders framing already promised in the pinned post.
5. **Replace the All-State Scan in the free group** with the covered midday board + next-morning verify (the funnel that produced the August spurt). If a "pattern watch" is wanted, make it a weekly HitMaster-voiced report from `daily_intelligence` (times_drawn / draws_since already in the table), not a third-party overdue dump.
6. **Unblock the Apple Developer account.** The app + in-app paywall is the only channel that doesn't depend on Meta's classifier; every "enhancements parked" item is gated on it.

Not proposed: per-state "likely to hit" lists (ENG-PERSTATE-P0 closed; also a 7/25 operator rule), any accuracy lever (SIGNAL-INFO-01), scheduled/auto posting (OPS-01), Instagram (social expansion scope).
