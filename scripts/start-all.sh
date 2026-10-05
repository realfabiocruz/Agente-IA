#!/usr/bin/env bash
# Sobe a API (porta interna 3001) e o site (porta $PORT) num único serviço.
# Usado no Render; o site repassa /api para a API em localhost.
# Se um dos dois cair, o script sai e o Render reinicia o serviço.
set -uo pipefail
cd "$(dirname "$0")/.."
API_PORT="${API_PORT:-3001}" node apps/api/dist/main.js &
(cd apps/web && exec npx next start -p "${PORT:-3000}") &
# Agente de voz (LiveKit) no mesmo processo: só com VOICE_WORKER_INLINE=1 e as chaves.
# No Render, ele roda num serviço próprio (scripts/start-voice.sh), por causa de CPU e memória.
if [ "${VOICE_WORKER_INLINE:-}" = "1" ] && [ -n "${LIVEKIT_URL:-}" ] && [ -n "${LIVEKIT_API_KEY:-}" ] && [ -n "${LIVEKIT_API_SECRET:-}" ]; then
  (cd apps/voice-agent && exec node dist/agent.js start) &
else
  echo "Worker de voz não roda neste processo"
fi
wait -n
code=$?
kill $(jobs -p) 2>/dev/null || true
exit "$code"
