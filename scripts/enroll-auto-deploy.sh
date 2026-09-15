#!/usr/bin/env bash
# Run from a machine that already has trusted administrator SSH access and gh login.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
admin=${1:?Usage: bash scripts/enroll-auto-deploy.sh USER@VPS_HOST}
[[ $admin =~ ^[a-z_][a-z0-9_-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 1
repo=x-apicella/alveo
directory=$(mktemp -d)
remote=
cleanup() {
  if [[ -n $remote ]]; then
    ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$admin" \
      "rm -f -- '$remote/receive-release.sh' '$remote/ssh-release-gateway.sh' '$remote/key.pub'; rmdir -- '$remote'" >/dev/null 2>&1 || true
  fi
  rm -f -- "$directory/key" "$directory/key.pub" "$directory/known_hosts" "$directory/install.sh" "$directory/probe" "$directory/environment.json"
  rmdir -- "$directory"
}
trap cleanup EXIT
gh auth status >/dev/null 2>&1
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$admin" 'sudo -n true'
host=$(ssh -G "$admin" | awk '$1 == "hostname" {print $2; exit}')
port=$(ssh -G "$admin" | awk '$1 == "port" {print $2; exit}')
[[ $host =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && $port == 22 ]] || { echo 'Enrollment currently requires SSH port 22.' >&2; exit 1; }
# Obtain the public host key over the existing authenticated, pinned connection.
host_key=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$admin" 'sudo -n cat /etc/ssh/ssh_host_ed25519_key.pub')
[[ $host_key =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+ ]] || exit 1
printf '%s %s\n' "$host" "$host_key" > "$directory/known_hosts"
ssh-keygen -q -t ed25519 -N '' -C alveo-github-deploy -f "$directory/key"
remote=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$admin" 'umask 077; mktemp -d /tmp/alveo-enroll-XXXXXXXX')
[[ $remote =~ ^/tmp/alveo-enroll-[a-zA-Z0-9]+$ ]] || exit 1
scp -q -o BatchMode=yes -o StrictHostKeyChecking=yes scripts/receive-release.sh scripts/ssh-release-gateway.sh "$directory/key.pub" "$admin:$remote/"
cat > "$directory/install.sh" <<'INSTALL'
set -euo pipefail
directory=$1
[[ $directory =~ ^/tmp/alveo-enroll-[a-zA-Z0-9]+$ ]] || exit 1
test -d /opt/alveo/.deploy
command -v node >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
command -v python3 >/dev/null
command -v flock >/dev/null
docker compose version >/dev/null
install -o root -g root -m 755 "$directory/receive-release.sh" /usr/local/sbin/alveo-receive
install -o root -g root -m 755 "$directory/ssh-release-gateway.sh" /usr/local/bin/alveo-ssh-gateway
if ! id alveo-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash alveo-deploy
fi
home_dir=$(getent passwd alveo-deploy | cut -d: -f6)
[[ $home_dir == /home/alveo-deploy ]] || exit 1
test ! -L "$home_dir/.ssh"
install -d -o alveo-deploy -g alveo-deploy -m 700 "$home_dir/.ssh"
test ! -L "$home_dir/.ssh/authorized_keys"
printf 'restrict,command="/usr/local/bin/alveo-ssh-gateway" %s\n' "$(cat "$directory/key.pub")" >> "$home_dir/.ssh/authorized_keys"
chown alveo-deploy:alveo-deploy "$home_dir/.ssh/authorized_keys"
chmod 600 "$home_dir/.ssh/authorized_keys"
printf 'alveo-deploy ALL=(root) NOPASSWD: /usr/local/sbin/alveo-receive *\n' > "$directory/sudoers"
chmod 600 "$directory/sudoers"
visudo -cf "$directory/sudoers"
install -o root -g root -m 440 "$directory/sudoers" /etc/sudoers.d/alveo-github-deploy
rm -f "$directory/sudoers"
INSTALL
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$admin" "sudo -n bash -s -- '$remote'" < "$directory/install.sh"
# Authentication must succeed while the forced-command gateway rejects a shell.
set +e
ssh -T -i "$directory/key" -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$directory/known_hosts" \
  "alveo-deploy@$host" probe > "$directory/probe" 2>&1
result=$?
set -e
[[ $result == 1 ]] && grep -q 'Only an Alveo image deployment is accepted.' "$directory/probe"
if ! gh api "repos/$repo/environments/production" >/dev/null 2>&1; then
  printf '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' > "$directory/environment.json"
  gh api "repos/$repo/environments/production" --method PUT --input "$directory/environment.json" >/dev/null
  gh api "repos/$repo/environments/production/deployment-branch-policies" --method POST -f name=main -f type=branch >/dev/null
fi
gh secret set VPS_SSH_KEY -R "$repo" --env production < "$directory/key"
gh secret set VPS_KNOWN_HOSTS -R "$repo" --env production < "$directory/known_hosts"
gh variable set VPS_HOST -R "$repo" --env production --body "$host"
gh variable set VPS_USER -R "$repo" --env production --body alveo-deploy
echo 'GitHub deployment access enrolled. The administrator key was not copied.'
echo 'Re-run the main CI workflow to verify deployment. Migration transitions may require review.'
