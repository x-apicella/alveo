import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('diagnostics show local RTC measurements with separate directions and stages', async ({ page }) => {
  const bundle = await build({ entryPoints: ['tests/fixtures/source-viewer.jsx'], bundle: true, write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole('button', { name: 'Stream diagnostics' }).click();
  await expect(page.getByText('No active tracks to measure.')).toBeVisible();
  await page.evaluate('window.fixture.publish()');
  await expect(page.getByRole('table')).toBeVisible();
  const game = page.getByRole('row').filter({ hasText: 'Friend — Game (video)' });
  await expect(game).toContainText('Receiving');
  await expect(game).toContainText('video/VP8');
  await expect(game).toContainText('Jitter: 2 ms');
  await expect(game).toContainText('3 packets (total)');
  await expect(game).toContainText('2 frames (total)');
  await expect(page.getByRole('row').filter({ hasText: 'Own audio (audio)' })).toContainText('Sending');
  await page.getByRole('button', { name: 'Stream diagnostics' }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
});
