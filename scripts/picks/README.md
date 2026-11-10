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
