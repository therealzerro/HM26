#!/usr/bin/env bash
# Daily reel run, DETACHED — survives terminal disconnects and the death of
# whatever session launched it. The pipelines run on the codespace VM either
# way; this removes the last tether (the launching shell).
#
#   npm run reel:daily              # verify → allday → midday → evening → record
#   npm run reel:daily -- --from=midday   # resume after a partial run
#   npm run reel:daily -- --skip-preflight         # bypass the OPS-07 data gate (operator-stated)
#   npm run reel:daily -- --allow-all-matched      # let record_public render a 30-of-30 strip (operator-stated)
#   tail -f "$(ls -t ~/.hm26_reel_runs/*.log | head -1)"   # watch it
#
# Each kind publishes as it completes (upsert per (reel_date, kind)), so a
# failure mid-list loses nothing already registered — re-run with --from=.
# This is operator-TRIGGERED, never scheduled (OPS-01: the Daily Workflow
# click is the only automation trigger in this system).
#
# OPS-07 (2026-10-09): before detaching, scripts/reel-preflight.ts must PASS —
# D−1 ledger has both sessions at a same-weekday-sane count, D−1 is graded on
# all three scopes, D's three boards are live. This is the gate reel:daily
# never had (OPS-05: the 9/26 midday gap ran half a day through verify).
set -u

# MKT-79: `record` (record_public, the 30-day track record reel) runs LAST —
# purely additive: if it aborts, everything before it has already published.
ORDER=(verify allday midday evening record)
FROM=""
SKIP_PREFLIGHT=0
ALLOW_ALL_MATCHED=0
for ARG in "$@"; do
  case "$ARG" in
    --from=*)            FROM="${ARG#--from=}" ;;
    --skip-preflight)    SKIP_PREFLIGHT=1 ;;
    --allow-all-matched) ALLOW_ALL_MATCHED=1 ;;
    "")                  ;;   # npm passes an empty arg for the bare form
    *) echo "ABORT: unknown argument '$ARG' (known: --from=<kind> --skip-preflight --allow-all-matched)" >&2; exit 1 ;;
  esac
done
if [ -n "$FROM" ]; then
  KNOWN=0; for K in "${ORDER[@]}"; do [ "$K" = "$FROM" ] && KNOWN=1; done
  [ "$KNOWN" = 1 ] || { echo "ABORT: --from=$FROM is not a kind (${ORDER[*]})" >&2; exit 1; }
fi

LOGDIR="$HOME/.hm26_reel_runs"
mkdir -p "$LOGDIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
LOG="$LOGDIR/reels_$STAMP.log"

# Not already detached? Gate, then re-exec ourselves under setsid+nohup and return.
if [ -z "${HM26_REELS_DETACHED:-}" ]; then
  cd "$(dirname "$0")/.."
  if ! curl -sf -o /dev/null --max-time 5 http://localhost:8081/; then
    echo "ABORT: dev server not reachable on :8081 — start npm run start-tunnel first." >&2
    exit 1
  fi
  if [ "$SKIP_PREFLIGHT" = 1 ]; then
    echo "⚠ preflight SKIPPED by --skip-preflight (operator-stated) — verify / allday_public / record_public may under-count if D−1 is incomplete."
  else
    npx tsx scripts/reel-preflight.ts || { echo "ABORT: preflight failed — nothing launched. See the lines above." >&2; exit 2; }
  fi
  HM26_REELS_DETACHED=1 setsid nohup "$0" "$@" >>"$LOG" 2>&1 < /dev/null &
  echo "Detached reel run started (PID $!) — survives disconnects."
  echo "Log: $LOG"
  echo "Watch: tail -f $LOG"
  exit 0
fi

cd "$(dirname "$0")/.."
FLAGS=""
[ "$SKIP_PREFLIGHT" = 1 ] && FLAGS="$FLAGS · preflight skipped"
[ "$ALLOW_ALL_MATCHED" = 1 ] && FLAGS="$FLAGS · record --allow-all-matched"
echo "=== daily reel run $STAMP (from=${FROM:-verify}$FLAGS) ==="
STARTED=0
for KIND in "${ORDER[@]}"; do
  if [ -n "$FROM" ] && [ "$STARTED" = 0 ]; then
    [ "$KIND" = "$FROM" ] && STARTED=1 || { echo "--- skip $KIND (before --from)"; continue; }
  fi
  echo "=== reel:$KIND ==="
  if [ "$KIND" = "record" ] && [ "$ALLOW_ALL_MATCHED" = 1 ]; then
    # Same chain as package.json reel:record, with the renderer's all-matched
    # override — the one flag reel:record cannot carry through npm.
    npx tsx scripts/render-record-body.ts --allow-all-matched \
      && npx tsx scripts/assemble-record-reel.ts \
      && npx tsx scripts/publish-reels.ts record
  else
    npm run "reel:$KIND"
  fi
  RC=$?
  echo "EXIT($KIND):$RC"
  if [ "$RC" -ne 0 ] && [ "$KIND" != "verify" ] && [ "$KIND" != "record" ]; then
    # verify legitimately aborts on a zero-match day; record aborts on its own
    # gates (count gate, three-digit assert, all-matched reject) and is last
    # anyway; a slate kind failing is real. Stop so the log ends at the
    # failure instead of burying it.
    echo "=== STOPPED at $KIND (exit $RC) — resume with: npm run reel:daily -- --from=$KIND ==="
    exit "$RC"
  fi
done
echo "=== all kinds done ==="
