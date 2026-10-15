#!/bin/sh
# Start local Postgres-backed services for batch.bodylia.in (DEVELOPMENT ONLY).
# Refuses to run with APP_ENV=production: this script exists to serve the
# dev database (bodyliabatch) with dev fallbacks. Production boots via
# Docker/CI with explicit env (see deploy/ + backend-go/.env.example).
set -eu
if [ "${APP_ENV:-development}" = "production" ]; then
  echo "FATAL: scripts/services-up.sh must never run in production (APP_ENV=production)." >&2
  exit 1
fi
export APP_ENV="${APP_ENV:-development}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for DB in bodyliabatch bodyliabatch_test; do
  psql -h localhost -U "${DB_USER:-roshanshah}" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || \
    psql -h localhost -U "${DB_USER:-roshanshah}" -d postgres -c "CREATE DATABASE $DB"
done
sh "$ROOT/scripts/db-migrate.sh"
cd "$ROOT/backend-go"
PORT="${PORT:-8101}" DB_NAME="${DB_NAME:-bodyliabatch}" DB_USER="${DB_USER:-roshanshah}" \
  DB_HOST="${DB_HOST:-localhost}" JWT_SECRET="${JWT_SECRET:-dev-secret}" GIN_MODE=release go run .
