import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { jwtVerify } from 'jose';
import { readCredentials, smokeSessionScript } from '../scripts/release-vps.mjs';

const uuid = '11111111-1111-4111-8111-111111111111';
test('release identity accepts UUID configuration without a reusable cookie and rejects loose permissions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'alveo-release-'));
  try {
    const path = join(directory, 'smoke.json');
    writeFileSync(path, JSON.stringify({ userId: uuid, textChannelId: uuid, voiceChannelId: uuid }), { mode: 0o600 });
    assert.equal(readCredentials(path).userId, uuid);
    writeFileSync(path, JSON.stringify({ userId: 'not-an-id', textChannelId: uuid, voiceChannelId: uuid }));
    assert.throws(() => readCredentials(path));
    const insecure = join(directory, 'loose.json');
    writeFileSync(insecure, '{}', { mode: 0o644 });
    assert.throws(() => readCredentials(insecure), /mode 600/);
  } finally { rmSync(directory, { recursive: true }); }
});

test('SSH transport pins host keys, sends a bounded source bundle and keeps tokens out of arguments', () => {
  const directory = mkdtempSync(join(tmpdir(), 'alveo-ssh-'));
  try {
    const fake = join(directory, 'ssh');
    writeFileSync(fake, `#!/usr/bin/env python3
import io, json, os, sys, tarfile
data = sys.stdin.buffer.read()
token, archive = data.split(b"\\n", 1)
assert token == b"fixture-token"
assert "fixture-token" not in " ".join(sys.argv)
assert "StrictHostKeyChecking=yes" in sys.argv
with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
    assert set(bundle.getnames()) == {"scripts/release-vps.mjs", "deploy/vps/compose.yaml", "deploy/vps/release.compose.yaml", "deploy/rollback-policy.json"}
print("Transport verified")
`, { mode: 0o700 });
    const env = { ...process.env, PATH: directory + ':' + process.env.PATH,
      VPS_HOST: 'vps.example.invalid', VPS_USER: 'alveo-deploy', VPS_SSH_KEY: 'fixture-key',
      VPS_KNOWN_HOSTS: 'fixture-host', REGISTRY_TOKEN: 'fixture-token',
      RELEASE_IMAGE: 'ghcr.io/x-apicella/alveo@sha256:' + 'a'.repeat(64), RELEASE_REVISION: 'b'.repeat(40) };
    const result = spawnSync('bash', ['scripts/deploy-via-ssh.sh'], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'Transport verified');
    for (const override of [{ VPS_HOST: 'host; touch /tmp/injected' }, { VPS_USER: '-oProxyCommand=bad' }, { RELEASE_REVISION: 'main' }]) {
      assert.notEqual(spawnSync('bash', ['scripts/deploy-via-ssh.sh'], { env: { ...env, ...override } }).status, 0);
    }
  } finally { rmSync(directory, { recursive: true }); }
});

test('forced SSH command rejects shells, extra arguments and mutable image tags', () => {
  for (const command of ['bash', 'deploy ghcr.io/x-apicella/alveo:latest main',
    'deploy ghcr.io/x-apicella/alveo@sha256:' + 'a'.repeat(64) + ' ' + 'b'.repeat(40) + '; id']) {
    const result = spawnSync('bash', ['scripts/ssh-release-gateway.sh'], {
      env: { ...process.env, SSH_ORIGINAL_COMMAND: command }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Only an Alveo/);
  }
});

test('receiver rejects archive traversal and symlinks before extraction', () => {
  const receiver = readFileSync('scripts/receive-release.sh', 'utf8');
  const python = receiver.split("<<'PY'\n")[1].split('\nPY')[0];
  for (const malicious of ['../escape', 'scripts/release-vps.mjs']) {
    const directory = mkdtempSync(join(tmpdir(), 'alveo-bundle-'));
    try {
      const make = `import tarfile, io
with tarfile.open("bundle.tar", "w") as t:
 for name in ["scripts/release-vps.mjs", "deploy/vps/compose.yaml", "deploy/vps/release.compose.yaml", "deploy/rollback-policy.json"]:
  item = tarfile.TarInfo(name)
  if name == "scripts/release-vps.mjs":
   item.type = tarfile.SYMTYPE
   item.linkname = ${JSON.stringify(malicious)}
  else:
   item.size = 2
  t.addfile(item, io.BytesIO(b"{}") if item.isfile() else None)
`;
      assert.equal(spawnSync('python3', ['-c', make], { cwd: directory }).status, 0);
      const checked = spawnSync('python3', ['-c', python, directory], { encoding: 'utf8' });
      assert.notEqual(checked.status, 0);
      assert.match(checked.stderr, /Unexpected release bundle/);
    } finally { rmSync(directory, { recursive: true }); }
  }
});

test('receiver accepts identical schemas and rejects unreviewed migration changes', () => {
  const python = readFileSync('scripts/receive-release.sh', 'utf8').split("<<'PY'\n")[2].split('\nPY')[0];
  const directory = mkdtempSync(join(tmpdir(), 'alveo-schema-'));
  try {
    for (const name of ['previous-schema', 'candidate-schema', 'deploy']) mkdirSync(join(directory, name));
    for (const name of ['previous-schema', 'candidate-schema']) writeFileSync(join(directory, name, '0000.sql'), 'CREATE TABLE fixture (id int);');
    writeFileSync(join(directory, 'deploy/rollback-policy.json'), '{"compatibleTransitions":[]}');
    const run = () => spawnSync('python3', ['-c', python, resolve(directory)], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    writeFileSync(join(directory, 'candidate-schema', '0001.sql'), 'ALTER TABLE fixture ADD name text;');
    const failure = run();
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /Migration compatibility review required/);
    const pair = failure.stderr.match(/([a-f0-9]{64}) -> ([a-f0-9]{64})/);
    writeFileSync(join(directory, 'deploy/rollback-policy.json'), JSON.stringify({ compatibleTransitions: [{ from: pair[1], to: pair[2] }] }));
    assert.equal(run().status, 0);
  } finally { rmSync(directory, { recursive: true }); }
});

test('automated smoke token has the dedicated identity and a five-minute expiry', async () => {
  const secret = 'unit-test-signing-key';
  const child = spawnSync(process.execPath, ['--input-type=module', '-', uuid], {
    input: smokeSessionScript, env: { ...process.env, SESSION_SECRET: secret }, encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr);
  const token = child.stdout.replace('alveo_session=', '');
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
  assert.equal(payload.sub, uuid);
  assert.equal(payload.exp - payload.iat, 300);
  assert.ok(!child.stdout.includes(secret));
  const missing = spawnSync(process.execPath, ['--input-type=module', '-', uuid], {
    input: smokeSessionScript, env: { ...process.env, SESSION_SECRET: '' }, encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
});
