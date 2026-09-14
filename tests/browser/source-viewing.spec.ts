import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('source selection, independent mixing and reconnect preferences', async ({ page }) => {
  const bundle = await build({
    entryPoints: ['tests/fixtures/source-viewer.jsx'], bundle: true, write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(page.getByText('No sources yet.', { exact: false })).toBeVisible();
  await page.evaluate('window.fixture.publish()');
  const game = page.getByRole('article', { name: 'Friend — Game', exact: true });
  const music = page.getByRole('article', { name: 'Friend — Music', exact: true });
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.locator('audio')).toHaveCount(1); // Only the remote microphone.
  const microphone = page.getByRole('article', { name: 'Friend — Microphone', exact: true });
  await microphone.getByRole('slider').fill('60');
  await expect(microphone.locator('audio')).toHaveJSProperty('volume', 0.6);
  await game.getByRole('button', { name: 'Watch', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(game.locator('video')).toHaveCount(1);
  await expect(page.locator('audio')).toHaveCount(2);
  await music.getByRole('button', { name: 'Listen', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(3);
  await expect.poll(() => page.locator('audio').evaluateAll(elements =>
    new Set(elements.map(element => (element as HTMLAudioElement).srcObject instanceof MediaStream
      ? ((element as HTMLAudioElement).srcObject as MediaStream).getAudioTracks()[0]?.id : null)).size,
  )).toBe(3);
  await music.getByRole('slider').fill('35');
  await expect(music.locator('audio')).toHaveJSProperty('volume', 0.35);
  await game.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(game.locator('audio')).toHaveCount(0);
  await expect(game.locator('video')).toHaveCount(1);
  await game.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(game.getByRole('button', { name: 'Unfocus' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate('window.fixture.desired()["Game-audio-1"]')).toBe(false);
  await expect.poll(() => page.evaluate('window.fixture.desired()["Game-video-1"]')).toBe(true);
  await expect.poll(() => page.evaluate('window.fixture.desired()["Second game-video-1"]')).toBe(false);
  await page.evaluate('window.fixture.stop()');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.evaluate('window.fixture.publish()');
  await expect(music.locator('audio')).toHaveJSProperty('volume', 0.35);
  await expect(game.getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate('window.fixture.desired()["Game-video-2"]')).toBe(true);
  await game.getByRole('button', { name: 'Stop watching' }).click();
  await expect(game.locator('video')).toHaveCount(0);
  await expect.poll(() => page.evaluate('window.fixture.desired()["Game-video-2"]')).toBe(false);
  await page.getByRole('article').filter({ hasText: 'Own audio' }).getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('article').filter({ hasText: 'Own audio' }).locator('audio')).toHaveCount(0);
});
