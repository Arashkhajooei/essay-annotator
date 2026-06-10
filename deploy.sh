#!/usr/bin/env bash
# Deploy the app to GitHub Pages.
# Needs the gh CLI authenticated with permission to create repos / push:
#   gh auth refresh -h github.com -s repo
set -euo pipefail
cd "$(dirname "$0")"

REPO="${1:-essay-annotator}"
OWNER="$(gh api user -q .login)"

if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "Creating repo $OWNER/$REPO…"
  gh repo create "$REPO" --public \
    --description "Annotate TOEFL-style essays with rhetorical moves — React + Supabase, Instagram dark theme"
fi

git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -u origin main

npm run build
node scripts/make-single-file.mjs

TMP="$(mktemp -d)"
cp -R dist/. "$TMP"
pushd "$TMP" >/dev/null
git init -q -b gh-pages
git add -A
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" \
  commit -q -m "deploy $(date +%F-%H%M)"
git push -f "https://github.com/$OWNER/$REPO.git" gh-pages
popd >/dev/null
rm -rf "$TMP"

# enable Pages on gh-pages branch (ignores 'already exists')
gh api -X POST "repos/$OWNER/$REPO/pages" \
  -f 'source[branch]=gh-pages' -f 'source[path]=/' >/dev/null 2>&1 || true

echo
echo "✓ Deployed — live in ~1 minute at: https://$OWNER.github.io/$REPO/"
