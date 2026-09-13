import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { directDatabaseUrl } from '../src/lib/database-url.ts';

const sql = postgres(process.env.ALVEO_DATABASE_URL, { max: 1, connect_timeout: 8 });
const listener = postgres(directDatabaseUrl(), { max: 1, connect_timeout: 8 });
try {
  await sql`SELECT 1`;
  console.log('PASS database query connection');
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  if (!['users', 'servers', 'memberships', 'channels', 'messages'].every(name => rows.some(row => row.table_name === name))) throw new Error('migrations');
  console.log('PASS application tables');
  const topic = 'alveo_check_' + randomUUID().replaceAll('-', '');
  let received;
  const delivered = new Promise(resolve => { received = resolve; });
  const subscription = await listener.listen(topic, received);
  let timeout;
  try {
    await sql.notify(topic, 'check');
    await Promise.race([delivered, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('notify')), 8000); })]);
    console.log('PASS direct LISTEN / pooled NOTIFY round trip');
  } finally { clearTimeout(timeout); await subscription.unlisten(); }
  if (process.env.NEON_AUTH_URL) {
    const response = await fetch(process.env.NEON_AUTH_URL + '/get-session', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('auth');
    console.log('PASS Neon Auth endpoint (anonymous session only)');
  }
  const media = ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'NEXT_PUBLIC_LIVEKIT_URL'];
  console.log(media.every(key => process.env[key]) ? 'CONFIGURED LiveKit (media connectivity still requires a room test)' : 'MISSING LiveKit configuration; voice/video cannot connect yet');
} catch {
  console.error('Service verification failed. Check credentials, migrations, and direct connection configuration.');
  process.exitCode = 1;
} finally {
  await Promise.all([sql.end({ timeout: 2 }), listener.end({ timeout: 2 })]);
}
