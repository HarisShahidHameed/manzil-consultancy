#!/usr/bin/env bash
# Runs ON THE SERVER (invoked by .github/workflows/flush-db.yml over SSH, never locally),
# only after remote-flush-backup.sh has already produced a backup. Expects
# backend/dist/flush.js and backend/dist/seed.js to already be uploaded into the
# current release's backend/dist/ (compiled by the workflow from prisma/flush.ts and
# prisma/seed.ts — those live outside backend/src's normal tsc build).
set -euo pipefail

DEPLOY_ROOT="/opt/manzil"
BACKEND_DIR="$DEPLOY_ROOT/current/backend"

if [ "${CONFIRM_FLUSH:-}" != "YES_FLUSH_THIS_DATABASE" ]; then
  echo "CONFIRM_FLUSH not set correctly — refusing to run." >&2
  exit 1
fi

cd "$BACKEND_DIR"

echo "==> Truncating all application tables"
CONFIRM_FLUSH="$CONFIRM_FLUSH" NODE_ENV=production node dist/flush.js

echo "==> Reseeding (roles, permissions, admin user)"
NODE_ENV=production node dist/seed.js

echo "==> Health check"
sleep 1
curl -fsS http://127.0.0.1:5000/api/health > /dev/null

echo "==> Flush + reseed complete"
