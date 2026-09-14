import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from '@playwright/test';

test('desktop isolates the remote page, requires source selection and closes capture on quit', { timeout: 60000 }, async () => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<!doctype html><title>Alveo test</title><button id="share">Share video</button>
      <a id="outside" href="https://example.invalid">Outside</a><p id="result"></p>
      <script>document.querySelector('#share').onclick = async () => {
        try { window.stream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false}); }
        catch (e) { document.querySelector('#result').textContent = e.name; }
      };</script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let app;
  const profile = await mkdtemp(join(tmpdir(), 'alveo-desktop-test-'));
  try {
    app = await _electron.launch({ args: ['desktop/main.mjs', `--user-data-dir=${profile}`],
      env: { ...process.env, ALVEO_DESKTOP_TEST_ORIGIN: origin } });
    const page = await app.firstWindow();
    await page.waitForSelector('#share');
    assert.deepEqual(await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process,
      bridge: typeof window.capturePicker })), { require: 'undefined', process: 'undefined', bridge: 'undefined' });
    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
    });
    assert.deepEqual(preferences, { sandbox: true, contextIsolation: true, nodeIntegration: false });
    // Enumeration is synthetic; this checks the real Electron picker/IPC boundary,
    // not native video correctness or OS capture permission acceptance.
    await app.evaluate(({ desktopCapturer, nativeImage, dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
      desktopCapturer.getSources = async () => [{ id: 'screen:fixture', name: '<script>untrusted title</script>', thumbnail: nativeImage.createEmpty() }];
    });
    const [picker] = await Promise.all([app.waitForEvent('window'), page.click('#share')]);
    await picker.waitForSelector('#sources button');
    assert.equal(await picker.locator('#sources button').innerText(), '<script>untrusted title</script>');
    assert.equal(await picker.locator('#sources script').count(), 0);
    await picker.click('#cancel');
    await page.waitForFunction(() => document.querySelector('#result').textContent.length > 0);
    assert.equal(await page.evaluate(() => Boolean(window.stream)), false);
    await page.click('#outside', { noWaitAfter: true });
    assert.equal(page.url(), origin + '/');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
    await app.evaluate(({ Menu }) => {
      const commands = Menu.getApplicationMenu().items[0].submenu.items;
      commands.find(item => item.label === 'Show Alveo').click();
    });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
    const closed = app.waitForEvent('close');
    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu().items[0].submenu.items.find(item => item.label === 'Quit and stop all capture').click();
    }).catch(() => {}); // Renderer shutdown may close the evaluation channel first.
    await closed;
    app = undefined;
  } finally {
    await app?.close();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  }
});
