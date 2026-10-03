#!/usr/bin/env bash
# Sobe a API (porta interna 3001) e o site (porta $PORT) num único serviço.
# Usado no Render; o site repassa /api para a API em localhost.
# Se um dos dois cair, o script sai e o Render reinicia o serviço.
set -uo pipefail
cd "$(dirname "$0")/.."
API_PORT="${API_PORT:-3001}" node apps/api/dist/main.js &
(cd apps/web && exec npx next start -p "${PORT:-3000}") &
wait -n
code=$?
kill $(jobs -p) 2>/dev/null || true
exit "$code"
