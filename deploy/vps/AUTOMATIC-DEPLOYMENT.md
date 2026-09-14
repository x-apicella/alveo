# Automatic web deployment

A successful main CI build now passes its immutable image digest to a production
job. PR jobs never receive VPS credentials. The job checks that its commit is
still main, serializes production releases without cancelling a running one,
connects through a pinned SSH host key and invokes a restricted release receiver.
The job also supports rerunning current main through workflow_dispatch.

The VPS receiver pulls with a short-lived GitHub job token, compares the image's
commit label, checks migrations from the actual previous and candidate images,
compares every transferred control file byte-for-byte with the copy inside that
published image, then runs the existing app-only health/rollback controller.
A deployment SSH key alone cannot substitute arbitrary root control scripts. Registry credentials
and incoming files are removed afterward. Database/session secrets remain on the
VPS. LiveKit, Redis and Caddy are not restarted.

## One-time activation (server administrator)

This setup requires existing administrator SSH access, Ubuntu/Python 3/Docker
Compose, Node 22 and the bootstrapped app at /opt/alveo. The current workstation
did not have the existing VPS SSH key when this workflow was prepared.

1. Install the reviewed receiver root-owned, mode 755, at
   /usr/local/sbin/alveo-receive from scripts/receive-release.sh. Install
   scripts/ssh-release-gateway.sh at /usr/local/bin/alveo-ssh-gateway with the
   same ownership/mode. These two privileged entry points are installed manually;
   ordinary code pushes cannot overwrite them.
2. Create a dedicated OS user alveo-deploy, with a home and Bash shell, no password
   login and no Docker group membership. Add a dedicated CI public SSH key to its
   authorized_keys using the prefix:
   command="/usr/local/bin/alveo-ssh-gateway",restrict
   The corresponding private key is only for this deployment receiver, not an
   existing administrator key. Grant this user the following sudoers command,
   validating the file with visudo before installing:
   alveo-deploy ALL=(root) NOPASSWD: /usr/local/sbin/alveo-receive *
   The root-owned receiver rejects malformed arguments, and its forced-command
   gateway accepts only "deploy IMAGE_DIGEST FULL_SHA".
3. Provision an isolated synthetic smoke identity on the VPS from the reviewed
   checkout. Run as the deployment administrator, with a private umask:

   ```bash
   cd /opt/alveo
   umask 077
   # Use the verified image digest selected from a successful main CI run.
   image=ghcr.io/x-apicella/alveo@sha256:VERIFIED_DIGEST
   docker run --rm --network host --env-file .deploy/app.env --entrypoint node "$image" /opt/alveo-release/scripts/provision-release-smoke.mjs > .deploy/release-smoke.json
   chmod 600 .deploy/release-smoke.json
   ```

   This idempotently creates one dedicated user/server with a text and voice
   channel and no distributed invites. The output stores only UUIDs. Each health
   attempt signs a five-minute session inside the currently running app container;
   no persistent session cookie or signing key is sent to GitHub. This verifies
   authenticated app access, not Google consent. Keep the synthetic account out
   of real servers.
4. Create GitHub environment production, restrict deployment branches to main,
   and set environment variables VPS_HOST and VPS_USER (alveo-deploy). Set
   environment secrets VPS_SSH_KEY and VPS_KNOWN_HOSTS. Verify the host-key
   fingerprint through the existing trusted connection/provider console; never
   trust an unauthenticated ssh-keyscan result by itself. No registry PAT is needed.
5. Test the receiver using the dedicated key. Review the first migration transition
   if the deployed image is older than current main. Re-run CI on current main,
   verify the production job, .deploy/releases record and actual running image
   revision, and exercise an isolated failed-health rollback drill.

The root receiver replaces only the app. Ordinary deploys may briefly interrupt
HTTP/SSE connections while the container exits gracefully; live media services
remain running. Host locks also serialize operations across separate CI runs.
After a forced termination, verify no deployment process exists before clearing
a stale .deploy/releases/lock directory.

## Migration compatibility

Identical migration trees deploy automatically. Changed trees require a reviewed
entry in deploy/rollback-policy.json matching the exact SHA-256 fingerprint of the
previous and candidate trees. The receiver prints only these non-secret hashes
when it blocks a change. Add a { "from": "OLD_HASH", "to": "NEW_HASH" } entry only
after verifying the old app works against the new schema. A human review is part
of changing this policy through a normal PR; no approval click is needed per
ordinary code push. Do not mark destructive migrations compatible merely to
unblock a run. Image rollback never reverses database migrations.

## Electron

The desktop shell loads https://alveo.chat, so deployed web UI changes appear
there too (reload an already-open window). Shell/native-capture changes require a
new desktop binary. Desktop CI currently tests Windows and Linux but does not
publish installers or update feeds. Signed installers/updates (#24), browser login
handoff (#31), and application audio capture (#11–#13) remain separate work.

## Verification limits

Unit tests cover restricted SSH command parsing, pinned-host transport, rejection
of malicious archives, migration compatibility gates, smoke configuration, and
release failure/rollback behavior. CI exercises the app image and private fixture
provisioning. Production activation and a verified deployment require the server
access and environment configuration above; this document does not claim they
have already occurred.
