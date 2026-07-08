#!/usr/bin/env bash
# Runs ON THE SERVER (invoked by .github/workflows/deploy.yml over SSH, never locally).
# Expects the new release to already be uploaded to $DEPLOY_ROOT/releases/$RELEASE_ID
# (backend/{dist,package.json,package-lock.json,prisma/} + frontend/dist + this ops/ dir).
#
# Usage: remote-deploy.sh <release_id>
set -euo pipefail

RELEASE_ID="${1:?release id required}"
DEPLOY_ROOT="/opt/manzil"
RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE_ID"
SHARED_ENV="$DEPLOY_ROOT/shared/backend/.env"
KEEP_RELEASES=3

if [ ! -d "$RELEASE_DIR" ]; then
  echo "Release dir $RELEASE_DIR not found" >&2
  exit 1
fi
if [ ! -f "$SHARED_ENV" ]; then
  echo "Missing $SHARED_ENV — create it once from backend/.env.example before the first deploy (see docs/DEPLOYMENT.md)." >&2
  exit 1
fi

echo "==> Linking shared .env into release"
ln -sfn "$SHARED_ENV" "$RELEASE_DIR/backend/.env"

echo "==> Installing backend dependencies (full, needed for prisma generate)"
cd "$RELEASE_DIR/backend"
npm ci

echo "==> Generating Prisma client"
npx prisma generate

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Seeding (idempotent — roles, permissions, admin user only in production)"
NODE_ENV=production node dist/seed.js

echo "==> Pruning dev dependencies to save disk"
npm prune --omit=dev

echo "==> Flipping current symlink"
ln -sfn "$RELEASE_DIR" "$DEPLOY_ROOT/current"

echo "==> Starting PM2 process from current release"
mkdir -p "$DEPLOY_ROOT/shared/logs"
# Always delete + start fresh (never `pm2 reload`): reload keeps the script/cwd
# path a running process was originally started with, so it silently keeps
# running the old release directory after every `current` symlink flip — until
# that old release gets pruned out from under it and the process crash-loops.
pm2 delete manzil-backend > /dev/null 2>&1 || true
pm2 start "$DEPLOY_ROOT/current/ops/ecosystem.config.js"
pm2 save

echo "==> Pruning old releases (keeping last $KEEP_RELEASES)"
cd "$DEPLOY_ROOT/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf

echo "==> Health check"
sleep 2
if ! curl -fsS http://127.0.0.1:5000/api/health > /dev/null; then
  echo "Health check failed after deploy of $RELEASE_ID" >&2
  exit 1
fi

echo "==> Deploy of $RELEASE_ID complete"
