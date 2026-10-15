#!/bin/sh
# Apply every migration in backend-go/migrations to the target DB(s).
# Local dev/test helper — refuses APP_ENV=production (prod migrates via CI).
# Usage: DB=bodyliabatch sh scripts/db-migrate.sh   (default: both local DBs)
set -eu
if [ "${APP_ENV:-development}" = "production" ]; then
  echo "FATAL: db-migrate.sh is a local helper and must never run in production." >&2; exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DBS="${DB:-bodyliabatch bodyliabatch_test}"
for DBNAME in $DBS; do
  echo "=== migrating $DBNAME ==="
  for F in "$ROOT"/backend-go/migrations/*.sql; do
    psql -h "${DB_HOST:-localhost}" -U "${DB_USER:-roshanshah}" -d "$DBNAME" \
      -v ON_ERROR_STOP=1 -f "$F" > /dev/null
    echo "applied $(basename "$F")"
  done
done
echo OK
