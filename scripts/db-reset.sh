#!/bin/sh
# Reset a TEST database to pristine seed state (drops schema, re-runs migrations).
# REFUSES anything that is not a *_test database — this is the guard rail that
# makes "reset the wrong DB" structurally impossible.
# Usage: DB=bodyliabatch_test sh scripts/db-reset.sh
set -eu
DBNAME="${DB:-bodyliabatch_test}"
case "$DBNAME" in
  *_test) ;;
  *) echo "FATAL: db-reset.sh only runs against *_test databases (got '$DBNAME')." >&2; exit 1 ;;
esac
if [ "${APP_ENV:-development}" = "production" ]; then
  echo "FATAL: db-reset.sh must never run in production." >&2; exit 1
fi
echo "Resetting $DBNAME ..."
psql -h "${DB_HOST:-localhost}" -U "${DB_USER:-roshanshah}" -d "$DBNAME" -c \
  "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null
DB="$DBNAME" sh "$(dirname "$0")/db-migrate.sh"
psql -h "${DB_HOST:-localhost}" -U "${DB_USER:-roshanshah}" -d "$DBNAME" -c \
  "SELECT (SELECT count(*) FROM batches) AS batches, (SELECT count(*) FROM batch_aliases) AS aliases, (SELECT count(*) FROM staff_users) AS staff;"
