#!/usr/bin/env bash
# Roda toda vez que o Codespace liga: sobe a API e o site em segundo plano.
# Logs em /tmp/api.log e /tmp/web.log.
cd "$(dirname "$0")/.."
pkill -f "node dist/main.js" || true
pkill -f "next start" || true
(cd apps/api && nohup npm start > /tmp/api.log 2>&1 &)
(cd apps/web && nohup npm start > /tmp/web.log 2>&1 &)
echo "Entrevistador subindo na porta 3000 (logs em /tmp/api.log e /tmp/web.log)."
