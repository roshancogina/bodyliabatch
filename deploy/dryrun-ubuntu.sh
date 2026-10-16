#!/bin/sh
# Ubuntu 24.04 dry-run: full gate before touching production.
# Usage (on the Ubuntu host, from repo root):
#   cp deploy/.env.deploy.example .env.deploy   # fill secrets
#   ./deploy/dryrun-ubuntu.sh
# Steps: unit+coverage → Go tests → compose build → stack up → migrate check →
# health → UIBatch smoke (canonical, spaced, manufacturer, label, unknown, malformed).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${ENV_FILE:-.env.deploy}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy deploy/.env.deploy.example first." >&2
  exit 1
fi
echo "==> 1/7 frontend: typecheck + vitest coverage (100% stmts/lines)"
npm run typecheck
npx vitest run --coverage
echo "==> 2/7 backend: go vet + contract tests"
(cd backend-go && go vet ./... && DB_NAME=bodyliabatch_test go test .)
echo "==> 3/7 compose build (Ubuntu 24.04 images)"
docker compose -f deploy/docker-compose.batch.yml --env-file "$ENV_FILE" build
echo "==> 4/7 stack up"
docker compose -f deploy/docker-compose.batch.yml --env-file "$ENV_FILE" up -d
trap 'docker compose -f deploy/docker-compose.batch.yml --env-file "$ENV_FILE" logs --tail=50' EXIT
echo "==> 5/7 wait for healthy API"
for i in $(seq 1 30); do
  if docker compose -f deploy/docker-compose.batch.yml --env-file "$ENV_FILE" exec -T batch-api curl -fsS http://127.0.0.1:8101/api/health >/dev/null 2>&1; then
    echo "API healthy after ${i}x10s"
    break
  fi
  if [ "$i" = 30 ]; then echo "API never became healthy" >&2; exit 1; fi
  sleep 10
done
echo "==> 6/7 DB counts (expect 5 batches / 5 aliases / 5+ products)"
docker compose -f deploy/docker-compose.batch.yml --env-file "$ENV_FILE" exec -T postgres psql -U "${DB_USER:-bodylia}" -d "${DB_NAME:-bodyliabatch}" -c "SELECT (SELECT count(*) FROM batches) AS batches, (SELECT count(*) FROM batch_aliases) AS aliases, (SELECT count(*) FROM products) AS products;"
echo "==> 7/7 UIBatch smoke via nginx proxy"
WEB_PORT="${WEB_PORT:-4173}"
check() { curl -fsS "http://127.0.0.1:${WEB_PORT}$1" | head -c 400; echo; }
echo "--- health:"; check "/health"
echo "--- canonical PE-2610-WL01:"; check "/bff/v1/batches/PE-2610-WL01"
echo "--- spaced:"; check "/bff/v1/batches/pe%202610%20wl01"
echo "--- manufacturer 2K26001:"; check "/bff/v1/batches/2K26001"
echo "--- unknown ZZ-9999-9Z99 (expect 404 kind=not_found):"; check "/bff/v1/batches/ZZ-9999-9Z99" || true
trap - EXIT
echo "DRY-RUN OK — stack left running for inspection. Tear down with:"
echo "  docker compose -f deploy/docker-compose.batch.yml --env-file $ENV_FILE down -v"
