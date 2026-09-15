import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron } from '@playwright/test';

test('packaged client loads its updater and presents a native update offer', {
  skip: process.env.TEST_PACKAGED_DESKTOP !== '1', timeout: 45000,
}, async () => {
  const profile = await mkdtemp(join(tmpdir(), 'alveo-packaged-test-'));
  const executablePath = resolve('desktop/dist', process.platform === 'win32'
    ? 'win-unpacked/Alveo.exe' : 'linux-unpacked/alveo-desktop');
  let client;
  try {
    client = await _electron.launch({ executablePath, args: ['--user-data-dir=' + profile] });
    const result = await client.evaluate(async ({ app, dialog }) => {
      const { createRequire } = await import('node:module');
      const { readFileSync } = await import('node:fs');
      const requireApp = createRequire(app.getAppPath() + '/package.json');
      const { autoUpdater } = requireApp('electron-updater');
      for (let attempt = 0; attempt < 200 && autoUpdater.listenerCount('update-available') === 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const prompts = [];
      dialog.showMessageBox = async (_parent, options) => {
        prompts.push(options);
        return { response: 0 };
      };
      autoUpdater.emit('update-available', { version: '0.1.9999' });
      await new Promise(resolve => setImmediate(resolve));
      return {
        packaged: app.isPackaged, version: app.getVersion(),
        autoDownload: autoUpdater.autoDownload,
        autoInstall: autoUpdater.autoInstallOnAppQuit,
        prompts, feed: readFileSync(process.resourcesPath + '/app-update.yml', 'utf8'),
      };
    });
    assert.equal(result.packaged, true);
    assert.match(result.version, /^0\.1\.\d+$/);
    assert.equal(result.autoDownload, false);
    assert.equal(result.autoInstall, false);
    assert.equal(result.prompts[0].message, 'An Alveo update is available.');
    assert.deepEqual(result.prompts[0].buttons, ['Later', 'Download update']);
    assert.match(result.feed, /owner: x-apicella/);
    assert.match(result.feed, /repo: alveo/);
  } finally {
    await client?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
