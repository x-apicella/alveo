# Alveo

A small, self-hosted voice, video and text platform for a group of friends, built
around one feature Discord doesn't have: **a single participant can publish several
sources at once** — webcam and microphone plus several application
windows, each with or without its own audio, or the audio of an app on its own.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Web app and API | Next.js (App Router) | One codebase for UI, API routes and SSR |
| Media server | [LiveKit](https://livekit.io) (Apache 2.0) | Supports multiple tracks per participant; self-hosts in one binary |
| Database | Postgres via Drizzle ORM | Bundled in docker-compose, or a hosted provider |
| Realtime chat | Server-Sent Events over Postgres `LISTEN/NOTIFY` | No extra service, works across replicas |
| Auth | Neon Auth email/password, plus optional D&D SSO | Uses your configured provider; passwords stay with Neon |
| Hosting | One VPS with Docker Compose and Caddy | Cheapest and simplest; media server needs a real box anyway |

## Local development

```bash
cp .env.example .env            # defaults work with the compose services below
docker compose up -d            # Postgres + LiveKit
pnpm install
pnpm dev                        # migrations run automatically on startup
```

Open http://localhost:3000, sign in with any username (dev login is enabled by
`ALLOW_DEV_LOGIN=true`), create a server and join the **Table** voice channel.
Use **+ Share source** to add windows, screens or app audio on top of your camera.

Note: if your shell already exports an unrelated `DATABASE_URL`, it is ignored.
Alveo uses `ALVEO_DATABASE_URL` for queries and `ALVEO_DATABASE_DIRECT_URL` for
migrations and realtime listeners.

## Production on a VPS

Pick a box near your group (Hetzner Ashburn or Hillsboro, or any US provider).
Point two DNS names at it, for example `alveo.example.com` and `livekit.example.com`.

```bash
cp .env.example .env
# Set real values: SESSION_SECRET, POSTGRES_PASSWORD, LIVEKIT_API_KEY/SECRET,
# NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.example.com, DND_AUTH_SHARED_SECRET,
# DND_APP_LOGIN_URL, and ALLOW_DEV_LOGIN=false.
# Create a private production config; set its keys to match .env.
cp livekit.yaml livekit.prod.yaml
# Edit livekit.prod.yaml `keys:` and the hostnames in Caddyfile.
docker compose -f docker-compose.prod.yml up -d --build
```

Open UDP 50000–50200 and TCP 7881 in the firewall for media, plus TCP 80 and 443.

## Integrating with the D&D app

Alveo does not have its own passwords. The D&D app signs a short-lived JWT with
`DND_AUTH_SHARED_SECRET` and redirects the browser to Alveo:

```
GET https://alveo.example.com/api/auth/sso?token=<jwt>&next=/s/<serverId>
```

JWT claims:

| Claim | Value |
| --- | --- |
| `sub` | Stable user id in the D&D app |
| `name` | Display name |
| `picture` | Avatar URL (optional) |
| `aud` | `alveo` |
| `iss` | Matches `DND_AUTH_ISSUER` if set |
| `exp` | A few minutes out |

Alveo creates or updates the matching user and sets a session cookie. Users are
matched on `sub`, so renaming in the D&D app carries over.

## How multi-source sharing works

`src/components/SourcePanel.tsx` calls `getDisplayMedia` once per source and
publishes the resulting tracks to LiveKit with `source: ScreenShare` and
`source: ScreenShareAudio`. LiveKit treats every publication independently, so the
room renders one tile per camera or window and mixes every audio track. Ending a
share from the browser's own "Stop sharing" bar unpublishes it automatically.

Browser limits to know about:

- Audio availability depends on browser, OS, and selected source. Requesting
  audio does not guarantee an audio track; Alveo reports when none was captured.
  Test each target platform instead of assuming tab, screen, or window parity.
- Capturing an application's audio *without* sharing anything visual is not
  possible in a browser. "Audio only" here captures a screen or tab and discards
  the video. True per-application audio (Discord desktop style) needs a desktop
  wrapper using OS APIs; that is the planned next phase.

## Testing source cleanup

With Node.js 22.6 or newer, run `pnpm test` for source lifecycle regression tests.
These cover partial publication rollback, failed unpublishes, and publication
completion after leaving. Real media capture still needs a browser and LiveKit:
verify browser/app stop-sharing controls and leaving during capture with a second
participant in the room.

## Layout

```
src/app            pages and API routes
src/components     client UI (chat, voice room, source panel)
src/db             Drizzle schema and connection
src/lib            auth, data access, realtime pub/sub
drizzle/           generated SQL migrations (pnpm db:generate)
docker-compose.yml        local Postgres + LiveKit
docker-compose.prod.yml   full stack for a VPS
```

## First deployment acceptance

Production login requires configured Neon Auth or the D&D app issuing SSO tokens.
For D&D, setting a login URL alone does not implement that integration. Confirm a
valid sign-in round trip before inviting the group; development login is always
disabled in a production build.

Before starting production, replace all example secrets with distinct random
values (for example, `openssl rand -hex 32`). Use a URL-safe Postgres password
because Compose embeds it in the database URL. Keep `livekit.prod.yaml` private;
it is ignored by Git. The checked-in `livekit.yaml` is for local development.

Run `docker compose -f docker-compose.prod.yml config --quiet`, then start the
stack and inspect `docker compose -f docker-compose.prod.yml logs app livekit`.
The app waits for Postgres readiness before applying migrations at startup.

With two separate browser profiles or devices:

1. Sign in, create a server, and join it using an invite in the second profile.
2. Send messages in both directions and reload to confirm persistence.
3. Join the same voice channel and confirm microphone and camera in both directions.
4. Publish two separate sources from one participant; confirm both appear remotely.
5. Stop one source using the browser picker and confirm the other keeps playing.
6. Leave and rejoin; confirm capture stops and no duplicate audio remains.
7. Restart the stack and confirm users, membership, and messages survive.

Test media from outside the VPS network. HTTPS success alone does not prove the
media firewall ports are reachable. Record browser/OS and whether the picker
actually offers audio for the selected source; capture support varies.

## Using the connected Neon services

Keep existing `.env` credentials when updating this repository; do not overwrite
that file with the example. Configure:

- `ALVEO_DATABASE_URL`: pooled Neon connection for application queries.
- `ALVEO_DATABASE_DIRECT_URL`: direct endpoint for LISTEN and migrations. If omitted,
  Alveo derives the standard Neon direct hostname; an explicitly pooled direct URL
  is rejected. Local Postgres can use one URL for both.
- `NEON_AUTH_URL`: the Neon Auth endpoint from your project.
- `NEON_AUTH_COOKIE_SECRET`: a separate random secret of at least 32 characters.
- `SESSION_SECRET`: retained for D&D and development sessions.

The login page offers email sign-in and account creation when Neon Auth is
configured. Enable email/password and any required email verification in Neon;
configure the deployment origin as trusted if the provider requires it. Provider
verification emails and a real account login need a user-controlled email address.
The app uses the official Neon server SDK and an auth proxy. Neon identities are
stored as `neon:<provider-user-id>`; existing D&D identities are preserved and are
**not automatically linked by email**. Sessions are checked with Neon and cached
for at most 60 seconds. D&D SSO remains optional and requires expiring tokens.

For a VPS using Neon, use `docker-compose.neon.yml` instead of the bundled-Postgres
production stack. It preserves the configured database URLs. Both deployment modes
still require public app/media domains, TLS, a private `livekit.prod.yaml`, matching
LiveKit credentials, and media/TURN networking. Neither Compose file provisions
TURN automatically; finish the network setup in issue #9 before public rollout.
A LiveKit Cloud deployment does not need the local LiveKit service.

```bash
pnpm db:migrate       # apply checked-in migrations using the direct connection
pnpm check:services   # queries, tables, LISTEN/NOTIFY, anonymous Auth reachability
pnpm build
pnpm test
```

`GET /api/health` checks database/table readiness without exposing credentials.
Startup migrations use a direct session and an advisory lock to serialize replicas.
`pnpm test:smoke` runs against `SMOKE_BASE_URL` (default http://localhost:3000),
using configured SSO and database credentials. It creates two temporary users and
one server, tests invites, permissions, live chat, and logout, then deletes only
its own fixtures. It never creates Neon Auth accounts or sends email. Run it against
an explicitly selected test/staging database. CI supplies a disposable Postgres
service, builds the production image, and runs this same authenticated smoke test.

The full implementation backlog and deployment dependencies are tracked in
[roadmap #5](https://github.com/x-apicella/alveo/issues/5).

`pnpm test:browser` checks the production UI with Chromium, including message
submission immediately after loading an empty channel. When LiveKit credentials
are configured it also joins voice and verifies a synthetic microphone publication;
this does not validate real microphone quality or cross-network media. With Neon
Auth configured it checks the email form and rejection of invalid credentials.
Install the test browser with `pnpm exec playwright install chromium`. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium installation.
Set `SMOKE_EVENTS_URL` to a second app instance to verify cross-process chat delivery.
