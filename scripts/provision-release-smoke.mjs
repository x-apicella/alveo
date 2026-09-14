// Run once INSIDE the app container; output contains IDs only, never credentials.
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const sql = postgres(process.env.ALVEO_DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  const ids = await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(61478202)`;
    await tx`INSERT INTO users (external_id, username) VALUES ('alveo:deployment-smoke:v1', 'Deployment checks')
      ON CONFLICT (external_id) DO NOTHING`;
    const [user] = await tx`SELECT id FROM users WHERE external_id = 'alveo:deployment-smoke:v1'`;
    const existing = await tx`SELECT id FROM servers WHERE owner_id = ${user.id}`;
    if (existing.length > 1) throw new Error('Ambiguous deployment fixture');
    let server = existing[0];
    if (!server) [server] = await tx`INSERT INTO servers (name, owner_id, invite_code)
      VALUES ('Deployment checks', ${user.id}, ${randomUUID().replaceAll('-', '')}) RETURNING id`;
    await tx`INSERT INTO memberships (server_id, user_id) VALUES (${server.id}, ${user.id}) ON CONFLICT DO NOTHING`;
    const result = { userId: user.id };
    for (const kind of ['text', 'voice']) {
      let [channel] = await tx`SELECT id FROM channels WHERE server_id = ${server.id} AND kind = ${kind} ORDER BY created_at LIMIT 1`;
      if (!channel) [channel] = await tx`INSERT INTO channels (server_id, name, kind)
        VALUES (${server.id}, 'Deployment checks', ${kind}) RETURNING id`;
      result[kind + 'ChannelId'] = channel.id;
    }
    return result;
  });
  process.stdout.write(JSON.stringify(ids) + '\n');
} catch {
  console.error('Could not provision the private deployment fixture.');
  process.exitCode = 1;
} finally { await sql.end({ timeout: 2 }); }
