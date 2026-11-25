#!/usr/bin/env bash
# OPS-09 — one-time setup for the "Start reel run" button (Admin → Reels).
#
# Run on the codespace, from the repo root:
#     bash scripts/setup-reel-button.sh
#
# It asks for ONE GitHub fine-grained personal access token and then:
#   1. stores the three Supabase values the runner needs as repo secrets
#      (read from .env and .env.backtest — nothing is printed);
#   2. stores the token on the reel-run edge function (REEL_GH_TOKEN) so the
#      button can start and read runs.
#
# Create the token at github.com → Settings → Developer settings →
# Fine-grained tokens. Repository access: only this repo. Permissions:
#     Actions: Read and write      (start + read runs — what the button uses)
#     Secrets: Read and write      (step 1 above)
# Re-run this script any time the token is rotated.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
PROJECT_REF="$(grep -E '^project_id' supabase/config.toml | sed -E 's/.*"(.*)".*/\1/')"

val() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//'; }
SB_URL="$(val .env EXPO_PUBLIC_SUPABASE_URL)"
SB_ANON="$(val .env EXPO_PUBLIC_SUPABASE_ANON_KEY)"
SB_SERVICE="$(val .env.backtest SUPABASE_SERVICE_ROLE_KEY)"
for V in SB_URL SB_ANON SB_SERVICE; do
  [ -n "${!V}" ] || { echo "ABORT: $V not found in .env / .env.backtest" >&2; exit 1; }
done

read -r -s -p "GitHub fine-grained token for $REPO (input hidden): " PAT; echo
[ -n "$PAT" ] || { echo "ABORT: no token entered" >&2; exit 1; }

echo "→ repo secrets on $REPO"
printf '%s' "$SB_URL"     | GH_TOKEN="$PAT" gh secret set REEL_SUPABASE_URL --repo "$REPO"
printf '%s' "$SB_ANON"    | GH_TOKEN="$PAT" gh secret set REEL_SUPABASE_ANON_KEY --repo "$REPO"
printf '%s' "$SB_SERVICE" | GH_TOKEN="$PAT" gh secret set REEL_SUPABASE_SERVICE_ROLE_KEY --repo "$REPO"

echo "→ edge function secret on $PROJECT_REF"
ENVF="$(mktemp)"; trap 'rm -f "$ENVF"' EXIT
printf 'REEL_GH_TOKEN=%s\nREEL_GH_REPO=%s\n' "$PAT" "$REPO" > "$ENVF"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat "$HOME/.supabase/access-token")}" \
  supabase secrets set --env-file "$ENVF" --project-ref "$PROJECT_REF"

echo "→ checking the token can see the workflow"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $PAT" -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/$REPO/actions/workflows/reel-daily.yml")
[ "$CODE" = 200 ] && echo "OK — open Admin → Reels and press ▶ Start reel run." \
  || echo "WARN: GitHub answered $CODE for reel-daily.yml — is the workflow pushed to the default branch, and does the token have Actions access?"
