#!/usr/bin/env bash
# Runs ON THE SERVER (invoked by .github/workflows/flush-db.yml over SSH, never locally).
# Takes a pg_dump backup before anything gets truncated — the recovery path if a flush
# was triggered by mistake. Prints "BACKUP_FILE=<path>" on success so the workflow can
# scp that file back and upload it as a workflow artifact.
set -euo pipefail

DEPLOY_ROOT="/opt/manzil"
SHARED_ENV="$DEPLOY_ROOT/shared/backend/.env"
BACKUP_DIR="$DEPLOY_ROOT/shared/backups"

if [ ! -f "$SHARED_ENV" ]; then
  echo "Missing $SHARED_ENV" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
set -a
source "$SHARED_ENV"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set in $SHARED_ENV" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
FILE="$BACKUP_DIR/pre-flush-$STAMP.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "BACKUP_FILE=$FILE"
