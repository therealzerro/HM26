# scripts/picks — operator pick tools (2026-11-08)

Rule (operator, 11/08): board-leaning. "Picks for drawing X" = the All-Day board.
Early-13 / late-29 / a single block = All-Day board + the session board, ordered by
that block's own data; universe sets only when LOUD; both-boards sets outrank
single-board; sets not yet drawn today first; a miss that lands D+1 / D+2 is tracked.

    python3 scripts/picks/board_lean.py --block late29 --date 2026-11-08 [--extra early.json] [--cache DIR]
    python3 scripts/picks/track_landings.py --to 2026-11-07 [--from 2026-04-18] [--cache DIR]

    python3 scripts/picks/board_lean.py --block allday --date 2026-11-11      (11/10: All-Day board alone, all draws of the day;
                                                                               session-board overlap ranks first; reference = whole previous day)
    python3 scripts/picks/board_watch.py --date 2026-11-10 [--extra rows.json]  (11/10: day watch — boards vs today's draws, today's
                                                                               pair+digit tally, carry list for tomorrow, board persistence)

`--extra` = JSON list of rows drawn today but not yet imported (`jurisdiction`, `result_digits`[, `session`]).
`--cache DIR` keeps hist.json / snaps.json for 10 minutes. Keys from `.env.backtest` (service) or `.env` (anon).

`docs/operator_picks.csv` = one row per operator instrument (date, block, set, order, type S/B, units,
placed yes/no, note). Add a row whenever a ticket is proposed; flip `placed` on the operator's word.
Rates come from `histories` only (never stored hit flags — BUG-162).

**11/11 — early-13 rank key = STAB (operator: "use E+M as the rank key").** `board_lean.py --block early13` orders the pool by
P+D + long evening z + long midday z. Long history = the operator's 11/11 pastes of all-history box counts (220 sets) in
`data/long_evening_box.txt` and `data/long_allday_box.txt` (midday = all-day − evening); loader `hm_data.long_z()`.
Other blocks keep P+D. Backtest 4/18→11/10, early-13 box, top 3 (long counts frozen at 3/31): now 52 / 54.8 exp,
STAB 60 / 54.9 exp; top 1 16 vs 18; top 5 92 vs 100 (91.2 exp). To refresh, replace the two data files with a new paste.

**11/11 (later) — midday and evening blocks switched to STAB too (operator).** late29 and allday stay on P+D.
Backtest 4/18→11/10, box, top 3 (now → STAB / expected): midday 90 → 105 / 106.7; evening 134 → 139 / 135.8;
all-day 202 → 212 / 219.5; late-29 89 → 87 / 88.9. Top 1: midday 27 → 38 / 35.8; evening 48 → 49 / 45.3.

**11/11 (later still) — allday and late29 switched to STAB too (operator). Every block now ranks on STAB.**
Backtest top 1 (now → STAB / expected): all-day 71 → 65 / 73.4; late-29 33 → 34 / 29.6. Top 5: all-day 362 → 365 / 365.4; late-29 152 → 151 / 147.7.
