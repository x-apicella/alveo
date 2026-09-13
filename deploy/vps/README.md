# Alveo on a US East VPS

This is the recommended single-server deployment for the initial friends group.
The server runs Alveo, LiveKit, Redis, and Caddy; the existing Neon database and
Neon Auth remain hosted separately. No LiveKit Cloud subscription is needed.

## 1. Order the server

1. Open https://us.ovhcloud.com/vps/ and create/sign into your OVHcloud US account.
2. Choose **VPS-2 (2027): 4 vCores, 8 GB RAM, 75 GB NVMe, 1 Gbps, unlimited traffic**.
   The public page advertised **starting at $8.50/month on September 13, 2026**.
   Confirm the actual month-to-month price, renewal price, tax, and regional stock
   at checkout. Do not assume the advertised starting price is the no-commitment price.
3. Select the standard **US East / Vint Hill, Virginia** region if available.
   If unavailable, compare another nearby standard region before ordering; do not
   silently choose a different plan or Local Zone with different specifications.
4. Select **Ubuntu 24.04 LTS**, plain OS. No cPanel/Plesk/Windows license is needed.
5. Select monthly/no long-term commitment for the initial load test. Keep the
   included backup; extra paid options are optional.
6. Import an SSH public key if checkout offers it. On the local WSL terminal:

   ```bash
   cat ~/.ssh/id_ed25519.pub
   ```

   Copy that single public-key line only. Never share the private key without `.pub`.
7. Complete checkout. Record the public IPv4 and initial login instructions.
   Ubuntu normally uses the `ubuntu` user. If checkout did not install the key,
   use the provider's initial password locally with:

   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@YOUR_SERVER_IP
   ```

8. Verify login from the local terminal:

   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@YOUR_SERVER_IP
   sudo -v
   exit
   ```

   Verify the host fingerprint against the provider console on first connection.
   Leave password-based access available until key access is verified. A server
   admin can disable passwords afterward; the bootstrap does not risk locking you out.

Capacity is provisional: one 6 Mbps feed from each of six publishers, delivered
to five others, is about 180 Mbps video egress. Multiple sources, audio, retransmits,
and higher bitrates add load. A 1 Gbps port is headroom, not a guarantee of sustained
performance. Run the real workload before committing to a longer term.

## 2. DNS and provider firewall

At the DNS provider for alveo.chat create A records:

| Name | Value |
|---|---|
| `@` | VPS public IPv4 |
| `livekit` | Same IPv4 |
| `turn` | Same IPv4 |

Use **DNS only** for all three during initial setup if using Cloudflare DNS.
Do not put LiveKit or TURN through Cloudflare's ordinary orange-cloud HTTP proxy.
Remove stale AAAA records unless IPv6 is separately configured and tested.
Don't change unrelated MX/email records.

If you enable a provider network firewall, allow TCP 22, 80, 443, 7881 and UDP
3478, 50000–50200. Keep outbound traffic allowed. The bootstrap applies the same
inbound rules with UFW. TCP 3000, 6379, 7880, 8080, and 5349 stay private.
The intentionally bounded UDP range is also in the generated LiveKit config.
Increase both together if future capacity requires it.

## 3. Prepare locally

Run these in the **local WSL terminal**, in the repo. Node 22+ and installed project
dependencies are required. This workspace already has both (Node may need its
normal nvm initialization).

```bash
cd /home/xapicella/repos/alveo
node scripts/prepare-vps.mjs
```

If `.deploy/` already exists, preparation refuses to overwrite it. Reuse the files;
do not regenerate production keys for ordinary updates. Preparation copies only
the necessary Neon/optional SSO settings and creates new session and LiveKit secrets.
It never edits local `.env`. `.deploy/` is excluded from Git AND Docker builds.

After the source changes are committed:

```bash
bash scripts/package-vps.sh
```

The resulting `.deploy/alveo-release.tar` contains private production configuration.
Keep it local and transfer only to your VPS. No GitHub credentials need to be installed
on the VPS. Store a private backup of `.deploy/` for future updates/recovery.

## 4. Bootstrap the fresh VPS

Replace `YOUR_SERVER_IP` in the following commands. Run from the local repo:

```bash
scp deploy/vps/bootstrap.sh ubuntu@YOUR_SERVER_IP:~/alveo-bootstrap.sh
ssh -t ubuntu@YOUR_SERVER_IP 'sudo bash ~/alveo-bootstrap.sh'
scp .deploy/alveo-release.tar ubuntu@YOUR_SERVER_IP:~/alveo-release.tar
ssh -t ubuntu@YOUR_SERVER_IP
```

Now run **on the VPS**:

```bash
sudo tar --no-same-owner -xf ~/alveo-release.tar -C /opt/alveo
rm ~/alveo-release.tar
sudo chmod 700 /opt/alveo/.deploy
sudo chmod 600 /opt/alveo/.deploy/*
cd /opt/alveo
sudo docker compose -f deploy/vps/compose.yaml config --quiet
sudo docker compose -f deploy/vps/compose.yaml pull
sudo docker compose -f deploy/vps/compose.yaml run --rm --no-deps caddy validate --config /etc/caddy.json
sudo docker compose -f deploy/vps/compose.yaml up -d --build
sudo docker compose -f deploy/vps/compose.yaml ps
```

Docker Compose 2.30+ is required for raw env files. The bootstrap installs current
Docker packages from Docker's official Ubuntu repository. It only accepts Ubuntu
24.04 and refuses to run if Docker is already installed. This stack uses Linux host
networking so UFW protects the listeners, without Docker-published-port bypasses.
Do not also launch the older root-level Compose stacks: they compete for ports.

Caddy obtains certificates automatically after DNS resolves to this host. Its layer-4
TLS router shares TCP 443 between the website, LiveKit signaling, and TURN/TLS.
Alveo and Redis listen only on loopback. Plain HTTP is not the app entry point;
use `https://alveo.chat` explicitly. Port 80 is available for certificate challenges.

## 5. Login and acceptance checks

1. In the existing Neon project's Auth settings, add `https://alveo.chat` to the
   allowed/trusted origins. Preserve any origins still needed for local development.
2. From your own computer:

   ```bash
   curl --fail https://alveo.chat/api/health
   curl --fail https://livekit.alveo.chat/
   openssl s_client -connect turn.alveo.chat:443 -servername turn.alveo.chat </dev/null
   ```

3. Open https://alveo.chat, sign in using a real account, and join a voice channel.
4. Have a friend on a different network join. Test microphone, camera, game video,
   source audio, multiple sources, disconnect/reconnect, and viewer subscriptions.
5. Confirm the selected connection uses UDP normally. Separately force relay-only
   ICE in a test client and verify TURN/TLS media; a valid certificate alone does
   **not** prove TURN allocation or media forwarding works.
6. Run six real clients for a sustained session while checking:

   ```bash
   sudo docker stats
   sudo docker compose -f deploy/vps/compose.yaml logs --tail=100 app livekit caddy
   ```

Check provider network graphs and client WebRTC stats for CPU saturation, packet
loss, reconnects, and bitrate. Avoid posting raw logs publicly without inspecting
them. Universal per-application audio capture still requires the desktop work.

## Updates, recovery, and growth

For updates, package a clean committed checkout with the same `.deploy/` credentials,
transfer it over SSH, extract it in `/opt/alveo`, and run `up -d --build` again.
Schedule media server updates when rooms are empty: forced restarts disconnect users.
Keep a previous private release archive; restoring its files and rebuilding rolls
back application code. Database migrations may need a separate recovery plan.
Never use `docker compose down -v` for routine updates: that deletes certificate
and Redis volumes. VPS disk backups do not back up the separately hosted Neon DB.

Start here; later separate app and media hosts, then add LiveKit nodes with shared
Redis and load balancing. Each self-hosted room still fits on one media node.
Enterprise use additionally needs availability engineering, tenant/auth review,
audit trails, observability, and tested recovery; a single VPS is not that guarantee.

References:
- https://us.ovhcloud.com/vps/
- https://support.us.ovhcloud.com/hc/en-us/articles/39499067423379-How-to-order-a-VPS
- https://docs.livekit.io/transport/self-hosting/vm/
- https://github.com/livekit/deploy/tree/main/generate/templates
- https://docs.livekit.io/transport/self-hosting/distributed/
- https://docs.docker.com/engine/install/ubuntu/
