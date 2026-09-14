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
`source: ScreenShareAudio`. Each new share has a UUID and a versioned publication
name carrying its label, capture mode and audio/video pairing; the authenticated
LiveKit participant supplies ownership. Older `share-N` publications are
also understood. Ending a share from the browser's own "Stop sharing" bar
unpublishes it automatically.

The **Sources and audio** list shows cameras, shares, audio-only sources and
microphones with their owner and live/paused state. Remote microphones play by
default; use **Watch** or **Listen** to subscribe to other sources. **Stop watching**
stops both video and paired audio. Each source has independent mute and volume,
including participant microphones; your own audio is never played locally.
**Focus** expands a selected video in the grid. Fullscreen and picture-in-picture
buttons appear where the browser supports them. If autoplay is blocked, use
**Enable audio playback**.

Selections and volume survive temporary unpublication and reconnects within the
active call. Leaving the call resets them. A newly added share gets a new ID
and requires selection again. LiveKit adaptive streaming sizes subscribed video
layers to the rendered element, while dynacast avoids unused simulcast layers.
These use the SDK's [selective subscriptions](https://docs.livekit.io/transport/media/subscribe/)
and [per-track audio rendering](https://docs.livekit.io/reference/components/react/concepts/rendering-audio/).

Run `pnpm exec playwright test tests/browser/source-viewing.spec.ts` for a
standalone Chromium regression with synthetic audio/video and the real LiveKit
React components. It checks late publication, independent same-type tracks,
keyboard selection, actual media-element volume, mute, focus, stop, reconnect
preferences, and suppression of local playback without a database or media server.
Unit tests additionally cover changed labels, legacy names and malformed names.
This does not measure network delivery or real-device A/V quality; those remain
part of the two-person acceptance session (#30) and capacity testing (#36).

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
These cover partial publication rollback, failed unpublishes, ended-listener
removal, and publication completion after leaving.

The browser currently allows **three extra sources**, in addition to microphone
and camera. This is a conservative product guard, not a measured capacity claim.
Each source shows Publishing/Live state and can be stopped during publication.
**Replace** opens a new display picker for that source's existing mode. Cancelling
or choosing a source without required audio preserves the original. After a valid
selection, the old capture stops before publishing the replacement, preserving
the source ID and viewer preferences. Publication failure leaves the source
stopped and reports an error; use Share source to retry explicitly.

Temporary reconnects retain already-live capture for LiveKit's normal recovery.
Pending pickers/publications are invalidated; reconnect never opens a picker or
starts capture automatically. A terminal disconnect or unmount stops all captures
and removes ended listeners. Explicit leave, move to another call, logout, or
closing the tab ends the room. Browsing another page keeps the active call alive.

Run `pnpm exec playwright test tests/browser/source-lifecycle.spec.ts` for the
standalone browser regression. It uses real synthetic MediaStream tracks and
the production SourcePanel with mocked picker/signaling boundaries. It covers
two video/audio pairs plus an audio-only source, the three-source guard,
replacement/cancellation, partial failure, browser stop, pending stop, reconnect,
disconnect and unmount races. These are deterministic lifecycle checks, not proof
of device capture, network recovery, or six-person capacity. Real microphone,
camera and multiple application capture together still need the sessions in #30,
#11 and #36. Per-process audio isolation is not available in the browser.

## Share quality and diagnostics

Choose **Share quality** before adding or replacing a source. Existing shares
keep their settings until replaced. The initial preset is Balanced; no preset
or reconnect can start a new capture without the source picker.

| Preset | Requested maximum | Main video layer bitrate cap |
| --- | --- | --- |
| Low | 854×480, 15 fps | 0.8 Mb/s |
| Balanced (default) | 1280×720, 30 fps | 2.5 Mb/s |
| Motion (experimental) | 1920×1080, 60 fps | 6 Mb/s |

These are requested limits, not measured device capabilities. Unsupported capture
constraints fall back Motion → Balanced → Low; permission loss and ended sources
stop instead of silently changing capture. The source row shows actual capture
settings and any downgrade. Simulcast adds lower video layers, and paired stereo
audio has a separate 128 kb/s cap: the main-layer cap is **not** a total upstream,
viewer, or VPS bandwidth budget. Dynacast suppresses unused layers and adaptive
subscriptions size video to the rendered view; source selection remains explicit.

VP8 is the conservative compatibility baseline. Hardware acceleration is chosen
by the browser/OS, not guaranteed by Alveo. Advanced VP9/AV1/H265 and multi-codec
encoding should be enabled only after supported-client and CPU/bandwidth tests;
extra codec encodes can increase publisher load. Screen/game audio retains stereo
without microphone-style echo cancellation, noise suppression or gain control;
microphone capture uses the SDK's voice defaults.

**Stream diagnostics** displays local WebRTC statistics while open: actual
capture/encoded/decoded FPS when available, codec, aggregate RTP bitrate across
simulcast layers, RTT or jitter/loss, encode/decode time, dropped frames and the
browser's encoder limitation reason. Missing values remain unavailable, and
counter baselines reset on republication. These diagnostics are ephemeral and
never uploaded, logged or persisted. Encoder CPU/bandwidth reports, capture FPS,
network timing and decode time describe different stages; none alone measures
capture-to-playback latency or A/V synchronization.

1080p60 remains experimental and unmeasured. #17 stays open for supported-client
codec/hardware evaluation and measured latency/sync targets, with #36 owning the
six-person sustained capacity/cost acceptance. Use the three-source guard and
Balanced default until those measurements justify changing them. Test Motion
with a remote viewer and inspect both sender and receiver statistics before
using it for a sustained session. Protected/unsupported capture remains out of
scope as documented in the browser/native capture issues.

Unit and standalone Chromium checks cover preset fallback, capture cancellation
during constraints, actual publish encoding options, RTP deltas/counter resets
and diagnostics rendering. They do not establish a measured 1080p60 guarantee.

## Persistent voice calls

The root layout owns one active call per tab. Text-channel, server, home and
privacy navigation keep microphone, camera, shares, viewer choices and audio
alive. The connected-channel bar stays visible; **Hide call** collapses its view
without unmounting audio or capture. Use **Move voice here** in another voice
channel to stop the old call and its shares. **Leave voice**, logout, tab close
and a terminal disconnect release devices. Every explicit join/rejoin fetches
fresh credentials; cancelled or superseded requests cannot start a late call.
Temporary network reconnects use the SDK's existing session recovery.

The bar provides mute, camera, deafen, devices and push-to-talk controls, plus
participant speaking/sharing state. Deafen silences remote audio and microphone;
undeafen restores the previous microphone choice and per-source audio settings.
Push-to-talk uses Space while this tab has focus, excluding text inputs and
ordinary buttons/links; the **Hold to talk** control also supports pointer/touch
and keyboard use. Releasing the key/pointer, losing focus or hiding the page
releases PTT. Browser PTT is not a system-wide desktop hotkey.

**Check microphone and camera** explicitly starts local prejoin previews, with a
microphone level meter and optional camera preview. These publish nothing and
stop on cancel/navigation/join. Device IDs are remembered locally, but capture
permission or active calls are never restored from storage. Microphone, camera
and supported speaker selectors remain available during the call. Device lists
refresh when hardware changes. The SDK/browser can follow operating-system
default-device changes; if a selected input disappears without recovery, the
controls mute/disable it and ask the user to select and enable a replacement.
Verify headset and default-device behavior on the target browser/OS. Browsers
without speaker-selection support use the operating system's sound settings.

Tabs/devices have independent UI sessions. LiveKit's account identity means a
second connection to the same room can displace the first, which shows a
terminal-disconnect message and requires an explicit rejoin. Reload never
recreates an active call. Desktop handoff and global shortcuts remain separate
work in #10/#31.

`pnpm exec playwright test tests/browser/voice-session.spec.ts` verifies persistent
navigation, move/logout cleanup, cancelled join and fresh rejoin tokens, deafen,
PTT, prejoin preview and unplug handling with actual SDK publications and
synthetic media. Network signaling and route navigation are mocked; cross-network
real-device media quality remains the acceptance session in #30.

## Chat delivery and history

Messages have database-assigned decimal sequence cursors. The insert trigger
serializes writes within each channel until commit before assigning the cursor,
so equal timestamps and concurrent transactions cannot leave replay gaps. Sequence
values are strings in JSON (no JavaScript bigint precision loss); gaps are normal.
The migration backfills existing history in `(created_at, id)` order and adds
indexes for channel pagination and per-author retry IDs. It takes a table lock
during the backfill: schedule an app maintenance window for large histories.
This is an additive migration compatible with the previous application's writes;
an app rollback should retain the new columns, indexes and trigger.

The messages API accepts `?cursor=<sequence>` for forward batches of up to 200,
or `?before=<sequence>` for older pages of up to 50. Responses include `hasMore`
and `nextCursor`; all messages are ordered oldest to newest. The old `after=<ISO>`
filter remains available for compatibility, but sequence cursors are required
for lossless replay. SSE uses event IDs and `Last-Event-ID` to resume, drains every
backlog page with backpressure, and checks the database every five seconds even
if NOTIFY fails. Query failures close the stream so the browser reconnects;
membership is rechecked during catch-up. An old SSE URL without a sequence cursor
replays from the beginning, which old clients already deduplicate.

The composer retains a UUID retry ID while a send is unconfirmed. Retrying the
unchanged draft returns the original message; changing the text uses a new ID.
Reusing an ID for different content/channel returns 409. IDs are scoped to the
authenticated author. Retry state lives in the mounted composer, not across page
reloads. The **Load older messages** control preserves the reader's scroll
position; incoming messages and send acknowledgements merge by ID and sequence.

`node scripts/chat-recovery-smoke.mjs` targets an explicitly selected disposable
database/app, with `SMOKE_EVENTS_URL` optionally pointing to a second instance.
CI runs it against disposable Postgres and two app containers. It checks migration
of populated history, concurrent idempotent retries, cursor validation, 451 equal
timestamps, complete forward/older pagination, cross-instance SSE resume, and
commit ordering. Unit/browser fixtures cover query/listener failure, cancellation,
backpressure, saved drafts, retry IDs and duplicate-free rendering.

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

## US East VPS deployment

### Server invitations

Server owners can use **Manage invites** in the channel sidebar to create, copy,
inspect, and revoke links. New links expire in 1–168 hours and admit 1–100 new
members; a newly created server starts with a seven-day, 25-member link. Opening
an invitation requires an explicit **Join server** click. Existing-member retries
do not consume uses. Redemption and revocation serialize in Postgres across app
instances. Revoking an invite does not remove members who already joined.

Migration `0002` imports existing permanent links with a seven-day transition
window and no usage cap, preserving their URLs. Owners can revoke these links
immediately. The old `servers.invite_code` column remains for schema compatibility,
but is never a fallback for redemption. Deploy all app instances together: older
images still accept permanent links and cannot safely serve alongside this release
or be used as a rollback once invite restrictions are relied upon. No database
rollback is required to keep the old column; doing so would discard invite controls.

`node scripts/invite-smoke.mjs` uses the same isolated test environment as the
other smoke scripts. CI checks populated-schema migration, denied management,
cross-server isolation, revoked/expired links, explicit join, and concurrent
redemption/retries across two app instances. Roles, bans, private channels, member
removal, and active media revocation remain tracked in issue #18.

For the friends-group deployment using self-hosted LiveKit and the existing Neon
database, follow [the executable VPS setup guide](deploy/vps/README.md).
