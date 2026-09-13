#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for config in app.env livekit.json caddy.json; do
  [[ -s .deploy/$config ]] || { echo 'Run node scripts/prepare-vps.mjs first.' >&2; exit 1; }
done
[[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'Commit changes before packaging a reproducible release.' >&2; exit 1; }
umask 077
git archive HEAD > .deploy/alveo-release.tar
tar -rf .deploy/alveo-release.tar .deploy/app.env .deploy/livekit.json .deploy/caddy.json
echo 'Created .deploy/alveo-release.tar (contains secrets; do not upload publicly).'
