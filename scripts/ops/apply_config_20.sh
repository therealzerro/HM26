#!/usr/bin/env bash
# CONFIG-20 / ENG-PAIRREP-01 — writes the four pair_rep_weight app_config rows (operator-run; service role from .env.backtest).
# Rollback: bash scripts/ops/apply_config_20.sh rollback   (sets all four to 0)
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; . ./.env.backtest; set +a
K="$SUPABASE_SERVICE_ROLE_KEY"; U="$EXPO_PUBLIC_SUPABASE_URL"
if [ "${1:-}" = "rollback" ]; then E=0; A=0; M=0; else E=0.20; A=0.20; M=0.05; fi
D="ENG-PAIRREP-01/CONFIG-20 operator override 2026-11-03; review 2027-01-02; rollback = scripts/ops/apply_config_20.sh rollback"
curl -s -X POST "$U/rest/v1/app_config?on_conflict=key" -H "apikey: $K" -H "Authorization: Bearer $K" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d "[{\"key\":\"pair_rep_weight\",\"value\":\"0\",\"description\":\"$D (global default; per-scope rows override)\"},
       {\"key\":\"pair_rep_weight_evening\",\"value\":\"$E\",\"description\":\"$D\"},
       {\"key\":\"pair_rep_weight_allday\",\"value\":\"$A\",\"description\":\"$D\"},
       {\"key\":\"pair_rep_weight_midday\",\"value\":\"$M\",\"description\":\"$D\"}]" \
  | python3 -I -c "import json,sys; [print(r['key'],'=',r['value']) for r in json.load(sys.stdin)]"
