#!/usr/bin/env bash
set -euo pipefail
umask 077
image=${1:-}
revision=${2:-}
[[ $image =~ ^ghcr\.io/x-apicella/alveo@sha256:[a-f0-9]{64}$ && $revision =~ ^[a-f0-9]{40}$ ]] || exit 1
cd /opt/alveo
mkdir -p .deploy/releases
exec 9>.deploy/releases/automatic.lock
flock -w 600 9
incoming=$(mktemp -d /opt/alveo/.deploy/release-XXXXXXXX)
candidate=
cleanup() {
  if [[ -n $candidate ]]; then docker rm "$candidate" >/dev/null 2>&1 || true; fi
  # mktemp creates an absolute child of this fixed, private directory.
  [[ $incoming == /opt/alveo/.deploy/release-* ]] && rm -rf -- "$incoming"
}
trap cleanup EXIT
read -r registry_token
[[ -n $registry_token ]] || exit 1
export DOCKER_CONFIG="$incoming/registry"
mkdir -m 700 "$DOCKER_CONFIG"
printf '%s' "$registry_token" | docker login ghcr.io -u x-apicella --password-stdin >/dev/null 2>&1
unset registry_token
# Bound the archive and extract only regular files with exact expected names.
head -c 1048577 > "$incoming/bundle.tar"
python3 - "$incoming" <<'PY'
import pathlib, sys, tarfile
root = pathlib.Path(sys.argv[1])
archive = root / "bundle.tar"
if archive.stat().st_size > 1048576:
    raise SystemExit("Release bundle exceeds size limit")
allowed = {"scripts/release-vps.mjs", "deploy/vps/compose.yaml",
           "deploy/vps/release.compose.yaml", "deploy/rollback-policy.json"}
with tarfile.open(archive) as bundle:
    members = bundle.getmembers()
    if len(members) != len(allowed) or {m.name for m in members} != allowed or any(not m.isfile() for m in members):
        raise SystemExit("Unexpected release bundle contents")
    for member in members:
        if member.size > 262144:
            raise SystemExit("Release file exceeds size limit")
        target = root / member.name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(bundle.extractfile(member).read())
PY
docker pull "$image" >/dev/null
[[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$revision" ]] || exit 1
current=$(docker compose -f deploy/vps/compose.yaml ps -q app)
[[ $current =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Expected one existing app container.' >&2; exit 1; }
candidate=$(docker create "$image")
docker cp "$candidate:/opt/alveo-release" "$incoming/verified"
for file in scripts/release-vps.mjs deploy/vps/compose.yaml deploy/vps/release.compose.yaml deploy/rollback-policy.json; do
  cmp -- "$incoming/$file" "$incoming/verified/$file" || { echo 'Bundle does not match the published image.' >&2; exit 1; }
done
docker cp "$current:/app/drizzle" "$incoming/previous-schema"
docker cp "$candidate:/app/drizzle" "$incoming/candidate-schema"
# Metadata is copied from the actual images, never inferred from GitHub history.
python3 - "$incoming" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
def fingerprint(directory):
    result = hashlib.sha256()
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    if not files:
        raise SystemExit("Missing migration metadata")
    for path in files:
        result.update(path.relative_to(directory).as_posix().encode() + b"\0")
        result.update(path.read_bytes() + b"\0")
    return result.hexdigest()
old, new = (fingerprint(root / name) for name in ("previous-schema", "candidate-schema"))
policy = json.loads((root / "deploy/rollback-policy.json").read_text())
if old != new and {"from": old, "to": new} not in policy["compatibleTransitions"]:
    raise SystemExit(f"Migration compatibility review required: {old} -> {new}")
PY
ln -s /opt/alveo/.deploy "$incoming/.deploy"
node "$incoming/scripts/release-vps.mjs" "$image" "$revision" --schema-compatible
# Retain the exact control files for subsequent manual rollback/deployment.
install -m 600 "$incoming/deploy/vps/compose.yaml" /opt/alveo/deploy/vps/compose.yaml
install -m 600 "$incoming/deploy/vps/release.compose.yaml" /opt/alveo/deploy/vps/release.compose.yaml
install -m 600 "$incoming/scripts/release-vps.mjs" /opt/alveo/scripts/release-vps.mjs
echo "Verified deployed commit: $revision"
