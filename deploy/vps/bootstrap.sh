#!/usr/bin/env bash
# Run ONLY on a new, dedicated Ubuntu 24.04 or 26.04 VPS, as root.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
source /etc/os-release
[[ $ID == ubuntu ]] || { echo 'Ubuntu is required.' >&2; exit 1; }
case "$VERSION_ID" in
  24.04) docker_suite=noble ;;
  26.04) docker_suite=resolute ;;
  *) echo 'Ubuntu 24.04 or 26.04 LTS is required.' >&2; exit 1 ;;
esac
command -v docker >/dev/null && { echo 'Docker already installed; refusing fresh-server bootstrap.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $docker_suite
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
# Host networking means these rules also protect the container listeners.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 3478/udp
ufw allow 50000:50200/udp
ufw --force enable
install -d -m 0755 /opt/alveo
echo 'Bootstrap complete. Upload the release, then follow deploy/vps/README.md.'
