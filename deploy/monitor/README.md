# External monitoring

Run this monitor on an existing always-on machine **outside the production VPS**.
It requires Node 22 and no npm dependencies. Code and systemd units are provided;
no host, alert destination or paid provider has been provisioned. Software license
cost is zero; hosting and notification costs depend on the owner's selected host
and receiver. Do not assume GitHub scheduled jobs provide minute-level uptime SLAs.

`node scripts/monitor.mjs` checks public app/database readiness, LiveKit HTTP and
the trusted TLS certificates for app, LiveKit and TURN. Certificates alert within
14 days of expiry. Three failed checks trigger an alert and two successful checks
trigger recovery. Only successful notification delivery changes the deduplication
state; failures retry next time. Alert delivery is at-least-once: a crash after the
receiver accepts an alert but before state saves can repeat that alert.

TLS/HTTP success is not media connectivity. `MONITOR_MEDIA_CHECK` must name an
absolute path to an operator-owned executable that joins a dedicated test room,
publishes synthetic media to a second client, forces TURN relay and verifies
received frames/audio, then removes both participants and exits zero. It must
clean up on termination and have no production-room subscriptions. Output is
discarded. The probe has a 45-second deadline. Until a real probe is configured,
media reports **unconfigured** and the overall monitor is not healthy. A simple
curl or certificate test is not a valid substitute.

## Configure on the independent host

1. Create an unprivileged `alveo-monitor` OS user and place the trusted checkout at
   `/opt/alveo-monitor`. Install Node 22 as `/usr/bin/node` or adjust `ExecStart`.
2. Create `/etc/alveo-monitor.env` owned by root, mode 600. Set
   `MONITOR_WEBHOOK_URL` to an owner-selected HTTPS receiver accepting JSON
   `{"text":"Alveo monitoring: app failure"}`, and `MONITOR_MEDIA_CHECK` to the
   private probe executable. Keep receiver tokens and media credentials out of Git.
3. Copy the service and timer to `/etc/systemd/system/`. Run `systemctl daemon-reload`
   and `systemctl enable --now alveo-monitor.timer`. Verify `systemctl list-timers`
   and restricted service logs. Arrange a separate dead-man check for this host:
   a stopped monitor cannot announce its own outage.
4. Prove notification delivery using a disposable test target/receiver before
   using production alerts. Record failure and recovery receipt timestamps, without
   webhook URLs or tokens. No alert has been sent by adding these files.

The state directory contains only the latest fixed-name probe statuses, counters
and notification flags. One process owns a mkdir lock; concurrent invocations fail
without deleting that lock. After a forced interruption, verify the process is dead
before removing a stale lock. Unreadable state fails loudly rather than resetting
notification history. Restrict journal access and cap retention at seven days.
No response bodies, cookies, messages, source titles or captured media are logged.
An external diagnostics provider is not introduced by this local tooling; update
privacy disclosures before selecting a provider that collects additional data.

## Operations still required for #32

- Select the independent host and alert destination, confirm actual cost/retention,
  enable the timer and prove delivery through a controlled failure/recovery.
- Install and validate the actual forced-relay media executable. HTTP/TLS probes
  alone deliberately cannot report full media health.
- Collect host CPU/memory/disk/bandwidth and LiveKit room/participant/relay/packet
  loss/reconnect metrics through a private endpoint; do not expose metrics publicly.
  Derive resource thresholds from the capacity measurements in #36. Initial TLS
  and consecutive-failure thresholds are policy defaults, not capacity evidence.
- Triage app failure against deploy records and database connectivity, LiveKit
  failure against service health, TLS failure against DNS/certificate renewal,
  and media failure against TURN/firewalls and client diagnostics.

Unit tests exercise threshold transitions, deduplication, retry, redaction,
readiness parsing and missing-media behavior. They do not prove notification
delivery or measure production uptime.
