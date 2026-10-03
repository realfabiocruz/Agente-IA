#!/usr/bin/env bash
# Roda uma vez, quando o Codespace é criado: dependências, banco e build.
set -euo pipefail
npm ci
npm run prisma:generate -w apps/api
npm run prisma:deploy -w apps/api
npm run prisma:seed -w apps/api
npm run build
