#!/usr/bin/env bash
# Deploy the Cascadia Analytics static site to Cloudflare Pages via direct upload.
#
# Prerequisites:
#   export CLOUDFLARE_API_TOKEN="<token with Pages:Edit on the account>"
#   export CLOUDFLARE_ACCOUNT_ID="<account id>"
#   (npx wrangler is used; no login needed when the token is set)
#
# Usage:
#   ./deploy-cloudflare.sh [project-name]   # default: cascadia-analytics
#
# The script rebuilds data.js first (python3 build.py), then uploads the
# site directory. Nothing is modified: same files Netlify served.
set -euo pipefail

PROJECT="${1:-cascadia-analytics}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "ERROR: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID first." >&2
  exit 1
fi

echo "==> Rebuilding site data..."
python3 "$HERE/build.py"

echo "==> Deploying to Cloudflare Pages project '$PROJECT'..."
cd "$HERE"
npx -y wrangler@latest pages deploy . \
  --project-name="$PROJECT" \
  --commit-dirty=true \
  --branch=main

echo "==> Done."
