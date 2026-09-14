#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${VPS_HOST:?Configure the production VPS_HOST variable}"
: "${VPS_USER:?Configure the production VPS_USER variable}"
: "${VPS_SSH_KEY:?Configure the production VPS_SSH_KEY secret}"
: "${VPS_KNOWN_HOSTS:?Configure the verified VPS_KNOWN_HOSTS secret}"
: "${REGISTRY_TOKEN:?Missing short-lived registry token}"
: "${RELEASE_IMAGE:?Missing verified image digest}"
: "${RELEASE_REVISION:?Missing verified commit}"
[[ $VPS_HOST =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && $VPS_USER =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 1
[[ $RELEASE_IMAGE =~ ^ghcr\.io/x-apicella/alveo@sha256:[a-f0-9]{64}$ && $RELEASE_REVISION =~ ^[a-f0-9]{40}$ ]] || exit 1
directory=$(mktemp -d)
trap 'rm -f -- "$directory/key" "$directory/known_hosts" "$directory/bundle.tar"; rmdir -- "$directory"' EXIT
printf '%s\n' "$VPS_SSH_KEY" > "$directory/key"
printf '%s\n' "$VPS_KNOWN_HOSTS" > "$directory/known_hosts"
unset VPS_SSH_KEY VPS_KNOWN_HOSTS
tar -cf "$directory/bundle.tar" scripts/release-vps.mjs deploy/vps/compose.yaml deploy/vps/release.compose.yaml deploy/rollback-policy.json
{
  printf '%s\n' "$REGISTRY_TOKEN"
  cat "$directory/bundle.tar"
} | ssh -T -i "$directory/key" -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$directory/known_hosts" \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
  "$VPS_USER@$VPS_HOST" "deploy $RELEASE_IMAGE $RELEASE_REVISION"
