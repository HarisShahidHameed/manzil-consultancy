#!/usr/bin/env bash
# Runs ON THE SERVER (invoked by .github/workflows/deploy.yml over SSH, never locally).
# Reads KEY=value lines on stdin, built from the repo's GitHub secrets, and sets those keys
# in the shared .env. Every other line is kept as it is, so a setting with no GitHub secret
# keeps its server value. The previous file is kept as .env.bak.
set -euo pipefail

SHARED_ENV="${SHARED_ENV:-/opt/manzil/shared/backend/.env}"
if [ ! -f "$SHARED_ENV" ]; then
  echo "Missing $SHARED_ENV — create it once from backend/.env.example before the first deploy (see docs/DEPLOYMENT.md)." >&2
  exit 1
fi

umask 077
NEW="$(mktemp)"
OUT="$(mktemp)"
trap 'rm -f "$NEW" "$OUT"' EXIT
cat > "$NEW"

if [ ! -s "$NEW" ]; then
  echo "No app settings in GitHub secrets; $SHARED_ENV left unchanged"
  exit 0
fi

# Drop the existing lines for the keys being set (with or without `export`), then append them.
awk '
  NR == FNR { keys[substr($0, 1, index($0, "=") - 1)] = 1; next }
  {
    line = $0
    sub(/^[ \t]*(export[ \t]+)?/, "", line)
    key = substr(line, 1, index(line, "=") - 1)
    sub(/[ \t]+$/, "", key)
    if (!(index(line, "=") > 0 && key in keys)) print
  }
' "$NEW" "$SHARED_ENV" > "$OUT"
cat "$NEW" >> "$OUT"

if cmp -s "$OUT" "$SHARED_ENV"; then
  echo "App settings already match GitHub secrets; $SHARED_ENV unchanged"
  exit 0
fi

cp -p "$SHARED_ENV" "$SHARED_ENV.bak"
# Written in place so the file keeps its owner and permissions.
cat "$OUT" > "$SHARED_ENV"
echo "Set from GitHub secrets: $(cut -d= -f1 "$NEW" | tr '\n' ' ')"
