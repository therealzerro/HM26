# ZK6 Parity Harness

Verifies that `engines/zk6.ts` (RN client path) and `compute-slate-zk6` (Deno
edge function) produce byte-equivalent output across the full ZK6 surface.

Built for the `EXPO_PUBLIC_USE_EDGE_ZK6` flag flip (2026-05-21). Not part of
the production runtime; lives outside the app bundle.

## What it tests

For each (scenario × scope), the harness:
1. Cleans the sandbox slate_date partition
2. Runs `engines/zk6.ts::computeSlate` in-process (Node)
3. Captures the returned `SlateSnapshot` plus rows from the 4 ZK6 tables
4. Cleans the partition again
5. POSTs the same params to the deployed `compute-slate-zk6` edge fn
6. Captures its output + rows
7. Diffs the two captures, excluding timestamps/UUIDs/the `source` marker

## Scenarios

| ID | Label          | Sandbox slate_date | Purpose |
|----|----------------|--------------------|---------|
| A  | today          | 2099-01-01         | Core math + K6 selection + table writes |
| B  | past-date      | 2099-01-02         | D2 soft-delete on non-today regen |
| C  | DST-adjacent   | 2099-01-03         | Belt-and-suspenders for old DST code path |

## Running

```bash
# Dry-run: sanity checks only, no writes
npm run zk6:parity -- --dry-run

# Full run: writes to sandbox dates, captures, diffs
npm run zk6:parity

# Clean up sandbox rows (run after parity verification)
npm run zk6:parity -- --cleanup-only

# Debug: single cell
npm run zk6:parity -- --scenario=A --scope=midday
```

## Credentials

Reads `.env.backtest` (same file the backtest harness uses):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — used for sandbox row cleanup, captures, and the
  edge-fn POST. **Never passed to engines/zk6.ts.**

Reads `.env` (the app's env, loaded by Expo at build):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — used by the shimmed expo-constants so
  engines/zk6.ts runs with anon-key auth, mirroring production behavior.

## Cleanup SQL

The harness emits this at the end of every run. To run manually:

```sql
DELETE FROM adaptive_tracking  WHERE slate_date IN ('2099-01-01','2099-01-02','2099-01-03');
DELETE FROM daily_intelligence WHERE slate_date IN ('2099-01-01','2099-01-02','2099-01-03');
DELETE FROM engine_runs        WHERE slate_date IN ('2099-01-01','2099-01-02','2099-01-03');
DELETE FROM slate_snapshots    WHERE slate_date IN ('2099-01-01','2099-01-02','2099-01-03');
```

## Output

- Console: PASS/FAIL summary + field-level failures only (passing fields hidden).
- Log file: `scripts/zk6-parity/runs/{timestamp}.json` — full captures from both
  paths for every cell. Use these to post-mortem any failure without re-running.

## Known harness limitation: `engine_runs` is verified via Scenario A only

The production `engine_runs` table has a unique constraint on `(slate_hash, mode)`
that does **not** include `slate_date`. The ZK6 engine math is deterministic for
the same scope + inputs + weights, so:

- Scenario A writes `engine_runs` rows with hashes `H_midday`, `H_evening`, `H_allday`.
- Scenarios B and C then try to write the same three hashes against different
  sandbox dates. The unique constraint fires before `slate_date` is consulted,
  the INSERTs 409-conflict, and both engines' `engine_runs` writes fail silently
  (the engines wrap this write in a try/catch with a "non-fatal" log).

**Net effect**: scenarios B and C have zero `engine_runs` rows for their sandbox
dates → zero rows to compare → trivial PASS by absence of data. Real `engine_runs`
parity is verified only via Scenario A's three cells.

**Not a coverage gap**: the other three tables (`slate_snapshots`,
`daily_intelligence`, `adaptive_tracking`) have no hash-based unique constraint,
so B and C write real rows there and contribute real parity evidence. The
harness still verifies all four tables across B/C — just not engine_runs.

**Future enhancement** if engine_runs ever drifts again and you need real
comparison data across B/C: inject a hash-disambiguator into a non-write field
(e.g. a synthetic harness-only `weightsKey` like `"balanced-A"` / `"balanced-B"`)
so each scenario produces a distinct `slate_hash` and the constraint allows
parallel writes. Adds harness complexity; only worth it if engine_runs becomes
a regression hotspot.

## Files

- `run.ts` — main entry, scenarios, output rendering
- `invoke.ts` — local + edge invocation helpers (30s timeout on edge)
- `capture.ts` — service-role table reads + partition cleanup
- `diff.ts` — field-level deep equality with per-table exclude lists (1e-9 FP tolerance)
- `svc.ts` — service-role REST client (used only for harness ops, never for engines)
- `loader.mjs` + `loader-register.mjs` — Node ESM hook that maps `expo-constants` to the shim
- `shim-expo-constants.mjs` — Node-friendly stub exposing the same shape `lib/supabase.ts` expects
