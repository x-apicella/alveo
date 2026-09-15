#!/usr/bin/env bash
set -euo pipefail
# Install root-owned; use only as an authorized_keys forced command.
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ (ghcr\.io/x-apicella/alveo@sha256:[a-f0-9]{64})\ ([a-f0-9]{40})$ ]]; then
  exec sudo -n /usr/local/sbin/alveo-receive "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
echo 'Only an Alveo image deployment is accepted.' >&2
exit 1
