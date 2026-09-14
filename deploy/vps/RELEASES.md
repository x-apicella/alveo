# App releases and rollback

CI publishes the **same image it tested** to `ghcr.io/x-apicella/alveo` after a
successful push to `main`. The workflow summary records its immutable digest and
commit. Pull requests cannot publish. Registry retention must keep the active and
previous images; do not prune their local images until a newer release is accepted.

## Before the first release

- Bootstrap the existing VPS stack using the main deployment guide. This release
  command requires one running app and does not bootstrap or update media services.
- Install Node 22 on the deployment host. Use a dedicated deployment OS identity;
  Docker access is privileged. Keep SSH keys and a read-only GHCR package token
  private. Authenticate Docker on the host using `docker login --password-stdin`.
  Do not put credentials in image tags, command arguments, source or logs.
- Create a dedicated smoke account with membership in a private test server, a
  text channel and a voice channel. Save its current session cookie and channel IDs
  in `.deploy/release-smoke.json` (mode **600**):

  ```json
  {"cookie":"alveo_session=REPLACE_PRIVATELY","textChannelId":"UUID","voiceChannelId":"UUID"}
  ```

  Obtain the cookie through ordinary login and refresh it before expiry. The probe
  reads that server's history and requests a short-lived media token; it prints
  neither response. It creates no messages, invites or media publications. A stale
  session fails the preflight before replacing the running app.
- Stage against a **separate database and auth tenant**, separate signing/media
  credentials, no production callbacks or emails, and synthetic test accounts.
  CI's disposable Postgres covers automatic migrations, two app instances,
  authenticated messaging and browser tests. It is not a real Neon/Google staging
  acceptance test. Use the same digest in isolated staging before production.

## Deploy

1. Select a successful **main** CI run. Record its full SHA and GHCR digest. Confirm
   the repository package allows this host to pull it. Review the diff from the
   running revision, especially `drizzle/` migrations and session/auth contracts.
2. Confirm both versions work against the resulting schema. Use additive migrations
   and defer destructive changes to a later release. The compatibility flag is an
   operator assertion following this review, **not an automatic schema proof**.
   If the old app cannot run on the new schema, do not use this automatic rollback
   path: prepare and verify an isolated restore or forward repair first (#33).
3. From the trusted Alveo checkout on the VPS, run:

   ```bash
   node scripts/release-vps.mjs ghcr.io/x-apicella/alveo@sha256:DIGEST FULL_COMMIT_SHA --schema-compatible
   ```

   The script locks `.deploy/releases/lock`, verifies current health, pulls the
   digest, verifies its OCI commit label, and replaces **only app**, with no build,
   dependency restart, volume deletion or media configuration changes. The existing
   Compose definition allows 30 seconds for graceful shutdown. Expect a short app
   interruption; HTTP/SSE clients reconnect. The LiveKit process stays running.
4. The new app must pass `/api/health`, `/login`, authenticated message history and
   media-token checks on loopback. Startup applies pending migrations. There are
   up to 30 attempts (each HTTP request times out after 8 seconds), spaced by two
   seconds. The command records the deployed commit and previous image locally.
5. Check public HTTPS, real login, live chat and an existing media call from an
   external client. Local health gates do not prove DNS/TLS, Google consent, TURN
   or media playback. Record sanitized staging and production results in the issue.

## Failure recovery

A failed activation or health gate restores the previous **local image ID** and
runs the same health gates. `.deploy/releases/` records `deployed`, `rolled-back`,
`rollback-failed` or `preflight-failed`, with SHA, image and timestamps. It never
records cookies or upstream error bodies. Retain release records for 90 days.

If rollback fails, preserve the previous image, inspect restricted app logs and
repair forward or use the separately verified database recovery procedure. Code
rollback does not undo migrations. Never restore a database over production simply
to satisfy a health gate: that can lose newer messages and revive revoked access.

An interrupted process may leave the lock directory. Inspect its `owner.json`,
verify no release process is running and inspect the actual app image/health before
removing the stale lock. Do not remove a live deployment's lock. All deployment
operators must use this command; manual Compose commands do not honor the lock.

## Verification status

Automated tests cover successful release ordering, partial activation failure,
health failure and verified rollback, rollback failure, wrong revision, stale
authentication, lock contention and rejection of mutable tags/unreviewed migrations.
CI tests the image before publishing it. A real isolated staging rollout/rollback
drill and a production app-only release still need operator evidence for #34;
the presence of this tooling is not that evidence.
