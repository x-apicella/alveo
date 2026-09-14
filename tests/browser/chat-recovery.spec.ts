import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('chat retries retain send IDs; history prepends and SSE merges without duplicates', async ({ page }) => {
  const bundle = await build({ entryPoints: ['tests/fixtures/chat-panel.jsx'], bundle: true, write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  await page.route('http://localhost/chat-fixture', route => route.fulfill({ contentType: 'text/html',
    body: '<style>.chat-body{height:250px;overflow:auto}.message-row{height:50px}</style><div id="root"></div>' }));
  await page.goto('http://localhost/chat-fixture');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect.poll(() => page.evaluate('window.fixture.url()')).toBe('/api/channels/channel/events?cursor=100');
  const input = page.getByRole('textbox', { name: 'Message #general' });
  await input.fill('Retry me');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('retry to confirm');
  await expect(input).toHaveValue('Retry me');
  await page.getByRole('button', { name: 'Retry send' }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByText('Retry me', { exact: true })).toHaveCount(1);
  const attempts = await page.evaluate('window.fixture.attempts()') as { clientId: string }[];
  expect(attempts[0].clientId).toBe(attempts[1].clientId);
  await page.locator('.chat-body').evaluate(element => { element.scrollTop = 0; });
  await page.getByRole('button', { name: 'Load older messages' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load older');
  await page.getByRole('button', { name: 'Load older messages' }).click();
  await expect(page.locator('.message-row')).toHaveCount(101);
  await expect(page.getByRole('button', { name: 'Load older messages' })).toHaveCount(0);
  await page.evaluate('window.fixture.connection(false)');
  await expect(page.getByRole('status')).toBeVisible();
  await page.evaluate('window.fixture.incoming(); window.fixture.connection(true)');
  await expect(page.locator('.message-row')).toHaveCount(102);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.locator('.message-row').first()).toContainText('Message 1');
  await expect(page.locator('.message-row').last()).toContainText('Message 102');
});
