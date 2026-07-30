#!/usr/bin/env bash
# Daily reel run, DETACHED — survives terminal disconnects and the death of
# whatever session launched it. The pipelines run on the codespace VM either
# way; this removes the last tether (the launching shell).
#
#   npm run reel:daily              # verify → allday → midday → evening
#   npm run reel:daily -- --from=midday   # resume after a partial run
#   tail -f "$(ls -t ~/.hm26_reel_runs/*.log | head -1)"   # watch it
#
# Each kind publishes as it completes (upsert per (reel_date, kind)), so a
# failure mid-list loses nothing already registered — re-run with --from=.
# This is operator-TRIGGERED, never scheduled (OPS-01: the Daily Workflow
# click is the only automation trigger in this system).
set -u

ORDER=(verify allday midday evening)
FROM="${1#--from=}"
[ "$FROM" = "${1:-}" ] && FROM=""   # no --from given

LOGDIR="$HOME/.hm26_reel_runs"
mkdir -p "$LOGDIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
LOG="$LOGDIR/reels_$STAMP.log"

# Not already detached? Re-exec ourselves under setsid+nohup and return.
if [ -z "${HM26_REELS_DETACHED:-}" ]; then
  if ! curl -sf -o /dev/null --max-time 5 http://localhost:8081/; then
    echo "ABORT: dev server not reachable on :8081 — start npm run start-tunnel first." >&2
    exit 1
  fi
  HM26_REELS_DETACHED=1 setsid nohup "$0" "${1:-}" >>"$LOG" 2>&1 < /dev/null &
  echo "Detached reel run started (PID $!) — survives disconnects."
  echo "Log: $LOG"
  echo "Watch: tail -f $LOG"
  exit 0
fi

cd "$(dirname "$0")/.."
echo "=== daily reel run $STAMP (from=${FROM:-verify}) ==="
STARTED=0
for KIND in "${ORDER[@]}"; do
  if [ -n "$FROM" ] && [ "$STARTED" = 0 ]; then
    [ "$KIND" = "$FROM" ] && STARTED=1 || { echo "--- skip $KIND (before --from)"; continue; }
  fi
  echo "=== reel:$KIND ==="
  npm run "reel:$KIND"
  RC=$?
  echo "EXIT($KIND):$RC"
  if [ "$RC" -ne 0 ] && [ "$KIND" != "verify" ]; then
    # verify legitimately aborts on a zero-match day; a slate kind failing is
    # real. Stop so the log ends at the failure instead of burying it.
    echo "=== STOPPED at $KIND (exit $RC) — resume with: npm run reel:daily -- --from=$KIND ==="
    exit "$RC"
  fi
done
echo "=== all kinds done ==="
