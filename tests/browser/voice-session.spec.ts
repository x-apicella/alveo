import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';

async function snapshot(page: Page) {
  return page.evaluate('window.fixture.snapshot()') as Promise<{ tokenRequests: number; rooms: number; live: number; microphone: boolean; sources: string[] }>;
}
test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => console.error(error.message));
  const bundle = await build({ entryPoints: ['tests/fixtures/voice-session.jsx'], bundle: true, write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    alias: { 'next/navigation': path.resolve('tests/fixtures/call-navigation.jsx'), 'next/link': path.resolve('tests/fixtures/call-link.jsx'),
      'livekit-client': path.resolve('tests/fixtures/call-livekit.jsx') },
  });
  await page.route('http://localhost/call-fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://localhost/call-fixture');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
});

test('microphone and paired share survive navigation, collapse and reconnect; move and logout clean up', async ({ page }) => {
  await page.getByRole('button', { name: 'Join voice', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(true);
  await page.getByRole('button', { name: '+ Share source', exact: true }).click();
  await page.getByRole('button', { name: 'Window or screen with audio', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).live).toBe(3);
  await page.getByRole('button', { name: 'Text page', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Chat draft' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide call', exact: true }).click();
  expect((await snapshot(page)).live).toBe(3);
  await page.evaluate('window.fixture.reconnect()');
  expect((await snapshot(page)).tokenRequests).toBe(1);
  expect((await snapshot(page)).live).toBe(3);
  await page.getByRole('button', { name: 'Other server', exact: true }).click();
  expect((await snapshot(page)).rooms).toBe(1);
  await page.getByRole('button', { name: 'Move voice here', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).rooms).toBe(2);
  await expect.poll(async () => (await snapshot(page)).live).toBe(1);
  expect((await snapshot(page)).tokenRequests).toBe(2);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Active voice call' })).toHaveCount(0);
  await expect.poll(async () => (await snapshot(page)).live).toBe(0);
});

test('deafen restores microphone; push to talk ignores typing and releases on blur', async ({ page }) => {
  await page.getByRole('button', { name: 'Join voice', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(true);
  await page.getByRole('button', { name: 'Deafen', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(false);
  await page.getByRole('button', { name: 'Undeafen', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(true);
  await page.getByRole('button', { name: 'Push to talk', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(false);
  await page.getByRole('button', { name: 'Text page', exact: true }).click();
  await page.getByRole('textbox', { name: 'Chat draft' }).focus();
  await page.keyboard.press('Space');
  expect((await snapshot(page)).microphone).toBe(false);
  await page.locator('body').evaluate(element => { element.tabIndex = -1; element.focus(); });
  await page.keyboard.down('Space');
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(true);
  await page.evaluate('window.dispatchEvent(new Event("blur"))');
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(false);
  await page.keyboard.up('Space');
  await page.getByRole('button', { name: 'Leave voice', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).live).toBe(0);
});

test('cancelled join discards late credentials and rejoin fetches a new token', async ({ page }) => {
  await page.evaluate('window.fixture.delay()');
  await page.getByRole('button', { name: 'Join voice', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel join', exact: true }).click();
  await page.evaluate('window.fixture.resolve()');
  expect((await snapshot(page)).rooms).toBe(0);
  await page.getByRole('button', { name: 'Join voice', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).rooms).toBe(1);
  await page.getByRole('button', { name: 'Leave voice', exact: true }).click();
  await page.getByRole('button', { name: 'Join voice', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).rooms).toBe(2);
  expect((await snapshot(page)).tokenRequests).toBe(3);
});

test('device preview requires an explicit click, publishes nothing, and closes on cancel', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Check microphone and camera' })).toBeVisible();
  expect((await snapshot(page)).tokenRequests).toBe(0);
  await page.getByRole('button', { name: 'Check microphone and camera' }).click();
  await expect(page.getByRole('meter', { name: 'Microphone level' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Camera on join' }).check();
  await expect.poll(() => page.locator('video').evaluate(element => (element as HTMLVideoElement).srcObject !== null)).toBe(true);
  expect((await snapshot(page)).rooms).toBe(0);
  expect((await snapshot(page)).tokenRequests).toBe(0);
  // Keep references to the real synthetic preview tracks after React unmounts.
  await page.locator('video').evaluate(element => {
    (window as unknown as { previewTracks: MediaStreamTrack[] }).previewTracks = ((element as HTMLVideoElement).srcObject as MediaStream).getTracks();
  });
  await page.getByRole('button', { name: 'Cancel device check' }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect.poll(() => page.evaluate('window.previewTracks.every(track => track.readyState === "ended")')).toBe(true);
});

test('unplugging selected capture devices stops them and offers explicit recovery', async ({ page }) => {
  await page.getByRole('button', { name: 'Join voice', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).microphone).toBe(true);
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).live).toBe(2);
  await page.evaluate('window.fixture.unplug()');
  await expect(page.getByRole('alert')).toContainText('selected device was disconnected');
  await expect.poll(async () => (await snapshot(page)).live).toBe(0);
  await page.getByRole('button', { name: 'Devices', exact: true }).click();
  await expect(page.getByText('Microphone', { exact: true }).first()).toBeVisible();
});
