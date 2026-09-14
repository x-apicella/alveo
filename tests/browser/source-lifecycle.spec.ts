import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';

async function snapshot(page: Page) {
  return page.evaluate('window.fixture.snapshot()') as Promise<{ publications: { id: string; kind: string }[]; liveTracks: number; captures: number }>;
}
async function add(page: Page, mode = 'Window or screen with audio') {
  await page.getByRole('button', { name: '+ Share source', exact: true }).click();
  await page.getByRole('button', { name: mode, exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  const bundle = await build({ entryPoints: ['tests/fixtures/source-panel.jsx'], bundle: true, write: false,
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' } });
  await page.route('http://localhost/source-fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://localhost/source-fixture');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
});

test('three independent sources, replacement identity, cancellation and browser stop', async ({ page }) => {
  await add(page);
  await add(page);
  await add(page, 'Audio only (uses display picker)');
  await expect(page.getByRole('button', { name: '+ Share source', exact: true })).toBeDisabled();
  const initial = await snapshot(page);
  expect(initial.liveTracks).toBe(5);
  expect(initial.publications).toHaveLength(5);
  expect(new Set(initial.publications.map(pub => pub.id)).size).toBe(3);
  await page.evaluate('window.fixture.configure({cancelled:true})');
  await page.getByRole('button', { name: /^Replace / }).first().click();
  await expect(page.getByRole('button', { name: /^Replace / }).first()).toBeEnabled();
  expect((await snapshot(page)).publications).toEqual(initial.publications);
  await page.evaluate('window.fixture.configure({})');
  await page.getByRole('button', { name: /^Replace / }).first().click();
  await expect.poll(async () => (await snapshot(page)).captures).toBe(4);
  await expect(page.getByRole('button', { name: /^Replace / }).first()).toBeEnabled();
  expect((await snapshot(page)).publications.map(pub => pub.id).sort()).toEqual(initial.publications.map(pub => pub.id).sort());
  expect((await snapshot(page)).liveTracks).toBe(5);
  await page.evaluate('window.fixture.state("reconnecting")');
  await expect(page.getByRole('status')).toContainText('reconnecting');
  await page.evaluate('window.fixture.state("connected")');
  expect((await snapshot(page)).publications).toHaveLength(5);
  expect((await snapshot(page)).captures).toBe(4);
  await page.evaluate('window.fixture.stopCapture()');
  await expect.poll(async () => (await snapshot(page)).publications.length).toBe(3);
  await page.evaluate('window.fixture.unmount()');
  await expect.poll(async () => (await snapshot(page)).liveTracks).toBe(0);
  expect((await snapshot(page)).publications).toHaveLength(0);
});

test('partial audio failure rolls back video and releases all capture', async ({ page }) => {
  await page.evaluate('window.fixture.configure({failAudio:true})');
  await add(page);
  await expect(page.getByRole('alert')).toContainText('Could not publish');
  expect((await snapshot(page)).liveTracks).toBe(0);
  expect((await snapshot(page)).publications).toHaveLength(0);
  await page.evaluate('window.fixture.configure({noAudio:true})');
  await add(page);
  await expect(page.getByRole('alert')).toContainText('No audio was captured');
  expect((await snapshot(page)).liveTracks).toBe(0);
});

test('stopping while the replacement picker is open cannot resume sharing', async ({ page }) => {
  await add(page);
  await page.evaluate('window.fixture.configure({delayPicker:true})');
  await page.getByRole('button', { name: /^Replace / }).click();
  await page.getByRole('button', { name: /^Stop sharing / }).click();
  await page.evaluate('window.fixture.resolvePicker()');
  await expect.poll(async () => (await snapshot(page)).liveTracks).toBe(0);
  expect((await snapshot(page)).publications).toHaveLength(0);
});

test('failed replacement stops both captures and can be retried explicitly', async ({ page }) => {
  await add(page);
  await page.evaluate('window.fixture.configure({failAudio:true})');
  await page.getByRole('button', { name: /^Replace / }).click();
  await expect(page.getByRole('alert')).toContainText('the previous source has stopped');
  expect((await snapshot(page)).liveTracks).toBe(0);
  expect((await snapshot(page)).publications).toHaveLength(0);
  await page.evaluate('window.fixture.configure({})');
  await add(page);
  await expect(page.getByRole('button', { name: /^Replace / })).toBeEnabled();
  await page.evaluate('window.fixture.state("disconnected")');
  await expect.poll(async () => (await snapshot(page)).liveTracks).toBe(0);
  expect((await snapshot(page)).publications).toHaveLength(0);
});

for (const action of ['stop', 'reconnecting', 'disconnected', 'unmount']) {
  test(`late publication is cleaned after ${action}`, async ({ page }) => {
    await page.evaluate('window.fixture.configure({delayPublish:true})');
    await add(page);
    await expect(page.getByText('· Publishing…', { exact: false })).toBeVisible();
    if (action === 'stop') await page.getByRole('button', { name: /^Stop sharing / }).click();
    else if (action === 'unmount') await page.evaluate('window.fixture.unmount()');
    else await page.evaluate(`window.fixture.state("${action}")`);
    expect((await snapshot(page)).liveTracks).toBe(0);
    await page.evaluate('window.fixture.resolvePublish()');
    await expect.poll(async () => (await snapshot(page)).publications.length).toBe(0);
    expect((await snapshot(page)).captures).toBe(1);
  });
}

for (const action of ['reconnecting', 'disconnected', 'unmount']) {
  test(`picker result is discarded after ${action}`, async ({ page }) => {
    await page.evaluate('window.fixture.configure({delayPicker:true})');
    await add(page);
    await expect.poll(async () => (await snapshot(page)).captures).toBe(1);
    if (action === 'unmount') await page.evaluate('window.fixture.unmount()');
    else {
      await page.evaluate(`window.fixture.state("${action}")`);
      await page.evaluate('window.fixture.state("connected")');
    }
    await page.evaluate('window.fixture.resolvePicker()');
    await expect.poll(async () => (await snapshot(page)).liveTracks).toBe(0);
    expect((await snapshot(page)).publications).toHaveLength(0);
  });
}
