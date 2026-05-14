# ZK6 Backtest Harness

Empirical hit-rate measurement for the ZK6 engine. Two modes:

- **report** — analyses existing `slate_snapshots`, no engine re-run
- **replay** — re-runs the engine for past dates with explicit config presets

## Setup

```bash
cp .env.backtest.example .env.backtest
# Edit .env.backtest and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## Running

```bash
# Report: analyse last 60 days of live snapshots
npm run backtest:report -- --days 60

# Replay: re-run engine with a single config
npm run backtest:replay -- --days 30 --config default

# Replay: compare multiple configs side-by-side
npm run backtest:replay -- --days 30 --config default,destroyed,legacy

# Replay: specify engine mode (default: balanced)
npm run backtest:replay -- --days 30 --config default,destroyed --mode balanced

# Replay: all three modes
npm run backtest:replay -- --days 30 --config default --mode all
```

## Config presets

| Preset | Description |
|---|---|
| `default` | Current production config (post-2026-05-12 revert) |
| `destroyed` | Gemini CLI config that ran 2026-05-09 → 2026-05-12 |
| `legacy` | BOX-heavy 3-signal model (DGC weight = 0) |

Custom configs via `--config-file path/to/config.json`.

## Interpreting results

Hit rate is per-slate: a slate "hits" if any of its 6 picks match a draw result (box or straight).
Confidence intervals are Wilson 95% — trust them for n > 20.

### Lift vs uniform-random 6-pick baseline

Both `report` and `replay` summaries now include a lift block. For each `(date, scope)` it
computes an analytic baseline — the expected performance of 6 picks sampled uniformly from
`000–999` against the same scope-filtered draw universe. Per result, P(random pick matches
box) = `perms_of_comboset / 1000` (singles: 6, doubles: 3, triples: 1).

Two ratios are reported per bucket:

- **`pick` lift** = (engine pick-hits / picks attempted) / (baseline expected pick-hits / picks attempted)
  — primary metric, doesn't saturate. `>1.0` means the engine beats no-information picks.
- **`slate` lift** = engine slate-hit rate / mean(baseline slate-hit prob)
  — saturates fast on allday (large K → baseline ~100%); reported for completeness.

**Caveat:** the baseline is rail-unconstrained. The engine's multiplicity caps may
preferentially allocate picks to doubles/triples (lower box-hit probability), which can
penalise pick lift for reasons unrelated to signal quality. A rail-matched baseline is a
planned follow-up; until then, treat absolute pick-lift numbers as a directional canary
(collapse toward 1.0 = regression) rather than a precise "x% better than random" claim.

## Approximation note

The replay harness uses `datasets_box` and `datasets_pair` **as they exist today**, not as
they existed on the backtest date. The history-derived `dsOverride` corrects `drawsSince`
accurately for any past date. The `timesDrawn` values are slightly forward-biased — a combo
with 50 hits today may have had 48 on the backtest date (~1-3% drift over 30 days).

**Relative comparisons between configs are reliable. Absolute hit rate may be slightly inflated.**

## Process rule

Per `CLAUDE.md`: any change to engine code or `app_config` engine-affecting keys must be
preceded by a 30-day baseline backtest and a 30-day candidate backtest. Merge only if
candidate ≥ baseline, or explicit user override with stated reason.
