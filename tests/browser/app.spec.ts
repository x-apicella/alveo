import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import postgres from 'postgres';
import { RoomServiceClient } from 'livekit-server-sdk';

// Uses only uniquely named temporary Alveo fixtures. Never creates provider accounts.
test('signed-in browser can navigate channels and join local voice', async ({ page }) => {
  const subject = `alveo-browser-${crypto.randomUUID()}`;
  const sql = postgres(process.env.ALVEO_DATABASE_URL!, { max: 1 });
  let serverId: string | undefined;
  let roomId: string | undefined;
  let media: RoomServiceClient | undefined;
  try {
    const token = await new SignJWT({ name: 'Browser check' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject(subject).setAudience('alveo')
      .setIssuer(process.env.DND_AUTH_ISSUER || 'alveo-smoke').setExpirationTime('2m')
      .sign(new TextEncoder().encode(process.env.DND_AUTH_SHARED_SECRET));
    const login = await page.request.get(`/api/auth/sso?token=${encodeURIComponent(token)}`, { maxRedirects: 0 });
    expect(login.status()).toBe(307);
    const created = await page.request.post('/api/servers', { data: { name: subject } });
    expect(created.status()).toBe(201);
    serverId = (await created.json()).server.id;
    const channels = await sql`SELECT id, kind FROM channels WHERE server_id = ${serverId!}`;
    const text = channels.find(channel => channel.kind === 'text')!.id;
    roomId = channels.find(channel => channel.kind === 'voice')!.id;
    await page.goto(`/s/${serverId}/c/${text}`);
    await expect(page.getByRole('textbox', { name: 'Message #general' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message #general' }).fill('Browser delivery check');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Browser delivery check', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message #general' })).toHaveValue('');
    await page.getByRole('button', { name: 'Manage invites', exact: true }).click();
    await expect(page.getByLabel('Invite link')).toHaveCount(1);
    await page.getByLabel('Expires in hours').fill('2');
    await page.getByLabel('Maximum new members').fill('3');
    await page.getByRole('button', { name: 'Create invite', exact: true }).click();
    await expect(page.getByLabel('Invite link')).toHaveCount(2);
    const revokedLink = await page.getByLabel('Invite link').first().inputValue();
    await expect(page.getByText('0 / 3 joins', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Revoke', exact: true }).first().click();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
    await page.goto(revokedLink);
    await expect(page.getByRole('button', { name: 'Join server', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Join server', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Invite is invalid or no longer available');
    if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.NEXT_PUBLIC_LIVEKIT_URL) {
      const url = process.env.NEXT_PUBLIC_LIVEKIT_URL.replace(/^ws/, 'http');
      media = new RoomServiceClient(url, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
      await page.goto(`/s/${serverId}/c/${roomId}`);
      await page.getByRole('button', { name: 'Join voice' }).click();
      await expect(page.getByRole('button', { name: '+ Share source' })).toBeVisible();
      await expect.poll(async () => {
        const participants = await media!.listParticipants(roomId!);
        return participants.some(participant => participant.tracks.some(track => track.type === 0));
      }, { timeout: 20_000 }).toBe(true);
    }
  } finally {
    await page.goto('/login').catch(() => {});
    if (media && roomId) await media.deleteRoom(roomId).catch(() => {});
    if (serverId) await sql`DELETE FROM servers WHERE id = ${serverId} AND name = ${subject}`;
    await sql`DELETE FROM users WHERE external_id = ${subject}`;
    await sql.end({ timeout: 2 });
  }
});

test('Neon email form is available and rejects invalid credentials', async ({ page }) => {
  test.skip(!process.env.NEON_AUTH_URL, 'Neon provider is not configured in this environment');
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('alveo-check@invalid.invalid');
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});


test('Google login preserves safe invitations and shows provider errors', async ({ page }) => {
  test.skip(!process.env.NEON_AUTH_URL, 'Neon provider is not configured');
  const callbacks: string[] = [];
  await page.route('**/api/auth/sign-in/social', async route => {
    const body = route.request().postDataJSON();
    expect(body.provider).toBe('google');
    callbacks.push(body.callbackURL);
    await route.fulfill({status:400, contentType:'application/json', body:JSON.stringify({code:'PROVIDER_NOT_FOUND', message:'Unavailable'})});
  });
  for (const destination of ['/invite/test-code', '//outside.example/path']) {
    await page.goto(`/login?next=${encodeURIComponent(destination)}`);
    await page.getByRole('button', {name:'Continue with Google'}).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not start Google' })).toHaveText('Could not start Google sign-in. Please try again or use email.');
    await expect(page.getByRole('button', {name:'Continue with Google'})).toBeEnabled();
  }
  const origin = new URL(page.url()).origin;
  expect(callbacks).toEqual([`${origin}/invite/test-code`, `${origin}/`]);
});
