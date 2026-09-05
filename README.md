# Alveo

A small, self-hosted voice, video and text platform for a group of friends, built
around one feature Discord doesn't have: **a single participant can publish any
number of sources at once** — webcam and microphone plus several application
windows, each with or without its own audio, or the audio of an app on its own.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Web app and API | Next.js (App Router) | One codebase for UI, API routes and SSR |
| Media server | [LiveKit](https://livekit.io) (Apache 2.0) | Publishes unlimited tracks per participant; self-hosts in one binary |
| Database | Postgres via Drizzle ORM | Bundled in docker-compose, or a hosted provider |
| Realtime chat | Server-Sent Events over Postgres `LISTEN/NOTIFY` | No extra service, works across replicas |
| Auth | Single sign-on from the D&D app (HS256 JWT) | Reuses the accounts you already have |
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
Alveo reads only `ALVEO_DATABASE_URL`.

## Production on a VPS

Pick a box near your group (Hetzner Ashburn or Hillsboro, or any US provider).
Point two DNS names at it, for example `alveo.example.com` and `livekit.example.com`.

```bash
cp .env.example .env
# Set real values: SESSION_SECRET, POSTGRES_PASSWORD, LIVEKIT_API_KEY/SECRET,
# NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.example.com, DND_AUTH_SHARED_SECRET,
# DND_APP_LOGIN_URL, and ALLOW_DEV_LOGIN=false.
# Edit livekit.yaml `keys:` to match, and the hostnames in Caddyfile.
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

- Audio capture with a share works for browser tabs and whole screens everywhere,
  and for individual windows on Windows in Chromium browsers. Firefox and Safari
  capture no audio from windows.
- Capturing an application's audio *without* sharing anything visual is not
  possible in a browser. "Audio only" here captures a screen or tab and discards
  the video. True per-application audio (Discord desktop style) needs a desktop
  wrapper using OS APIs; that is the planned next phase.

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
