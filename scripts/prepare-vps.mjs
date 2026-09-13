import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export function configs(env) {
  for (const key of ['ALVEO_DATABASE_URL', 'ALVEO_DATABASE_DIRECT_URL', 'NEON_AUTH_URL']) {
    if (!env[key]) throw new Error(`Missing ${key} in local .env`);
  }
  const app = {};
  // Only runtime values belong on the VPS. Never copy provider-management tokens.
  for (const key of ['ALVEO_DATABASE_URL', 'ALVEO_DATABASE_DIRECT_URL', 'NEON_AUTH_URL',
    'DND_AUTH_SHARED_SECRET', 'DND_AUTH_ISSUER', 'DND_APP_LOGIN_URL']) {
    if (env[key]) app[key] = env[key];
  }
  Object.assign(app, {
    SESSION_SECRET: randomBytes(32).toString('hex'),
    NEON_AUTH_COOKIE_SECRET: randomBytes(32).toString('hex'),
    LIVEKIT_API_KEY: `alveo${randomBytes(12).toString('hex')}`,
    LIVEKIT_API_SECRET: randomBytes(32).toString('hex'),
    NEXT_PUBLIC_LIVEKIT_URL: 'wss://livekit.alveo.chat',
    ALLOW_DEV_LOGIN: 'false',
  });
  for (const value of Object.values(app)) {
    if (/[\r\n\0]/.test(value)) throw new Error('Multiline environment values are not supported');
  }
  const livekit = {
    port: 7880,
    rtc: { tcp_port: 7881, port_range_start: 50000, port_range_end: 50200, use_external_ip: true },
    redis: { address: '127.0.0.1:6379' },
    turn: { enabled: true, domain: 'turn.alveo.chat', tls_port: 5349, udp_port: 3478, external_tls: true },
    keys: { [app.LIVEKIT_API_KEY]: app.LIVEKIT_API_SECRET },
    room: { auto_create: true, empty_timeout: 300 },
    logging: { level: 'info' },
  };
  // Follows livekit/deploy's TLS/SNI routing: TURN and HTTPS share TCP 443.
  const route = (host, port, http) => ({
    match: [{ tls: { sni: [host] } }],
    handle: [
      { handler: 'tls', ...(http ? { connection_policies: [{ alpn: ['http/1.1'] }] } : {}) },
      { handler: 'proxy', upstreams: [{ dial: [`127.0.0.1:${port}`] }] },
    ],
  });
  const caddy = {
    admin: { disabled: true },
    storage: { module: 'file_system', root: '/data' },
    apps: {
      tls: { certificates: { automate: ['alveo.chat', 'livekit.alveo.chat', 'turn.alveo.chat'] } },
      layer4: { servers: { main: { listen: [':443'], routes: [
        route('turn.alveo.chat', 5349, false),
        route('livekit.alveo.chat', 7880, true),
        route('alveo.chat', 8080, true),
      ] } } },
      http: { servers: { app: {
        listen: ['127.0.0.1:8080'],
        automatic_https: { disable: true },
        routes: [{ match: [{ host: ['alveo.chat'] }], handle: [{
          handler: 'reverse_proxy', upstreams: [{ dial: '127.0.0.1:3000' }],
          flush_interval: -1,
          headers: { request: { set: { 'X-Forwarded-Proto': ['https'], 'X-Forwarded-Host': ['alveo.chat'] } } },
        }] }],
      } } },
    },
  };
  return { app, livekit, caddy };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(root, '.deploy');
  const files = ['app.env', 'livekit.json', 'caddy.json'];
  if (files.some(file => existsSync(resolve(output, file)))) {
    throw new Error('Deployment files already exist; refusing to rotate credentials. Reuse .deploy/ for updates.');
  }
  const { app, livekit, caddy } = configs(parse(readFileSync(resolve(root, '.env'))));
  mkdirSync(output, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(output, 'app.env'), Object.entries(app).map(([k,v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  writeFileSync(resolve(output, 'livekit.json'), JSON.stringify(livekit, null, 2) + '\n', { mode: 0o600 });
  writeFileSync(resolve(output, 'caddy.json'), JSON.stringify(caddy, null, 2) + '\n', { mode: 0o600 });
  console.log('Prepared .deploy/ with private production configuration. Local .env unchanged. No secrets printed.');
}
