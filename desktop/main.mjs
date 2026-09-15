import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, session, shell, Tray } from 'electron';
import { join } from 'node:path';
import { createDesktopUpdates } from './updates.mjs';
import { fileURLToPath } from 'node:url';
import { appOrigin, captureAllowed, sameOrigin, trustedFrame } from './policy.mjs';

app.enableSandbox();
const origin = appOrigin(process.env.ALVEO_DESKTOP_TEST_ORIGIN, app.isPackaged);
const asset = name => fileURLToPath(new URL(name, import.meta.url));
const iconPath = () => app.isPackaged ? join(process.resourcesPath, 'alveo-logo.png') : asset('../public/alveo-logo.png');
let updates;
let main;
let tray;
let picker;
let pending;
let quitting = false;
let permissionPrompt = false;

function cancelCapture() {
  const request = pending;
  pending = undefined;
  if (picker && !picker.isDestroyed()) picker.destroy();
  picker = undefined;
  if (request) { try { request.callback({}); } catch { /* Requesting frame may have exited. */ } }
}

function quit() {
  quitting = true;
  cancelCapture();
  // Destroying the renderer releases every microphone/camera/display track even
  // when a crashed or unresponsive page cannot run its React cleanup handlers.
  if (main && !main.isDestroyed()) main.destroy();
  tray?.destroy();
  app.quit();
}

function pickerSender(event) {
  return Boolean(picker && event.sender === picker.webContents &&
    event.senderFrame === picker.webContents.mainFrame &&
    event.senderFrame.url === new URL('./picker.html', import.meta.url).href);
}

ipcMain.handle('alveo:capture:list', async event => {
  if (!pickerSender(event) || !pending) throw new Error('Capture picker unavailable');
  return pending.sources.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL() }));
});
ipcMain.handle('alveo:capture:select', async (event, id) => {
  if (!pickerSender(event) || !pending || typeof id !== 'string') throw new Error('Invalid capture selection');
  const request = pending;
  const selected = request.sources.find(source => source.id === id);
  if (!selected || !trustedFrame(request.frame, main?.webContents, origin)) {
    cancelCapture();
    throw new Error('Capture source is no longer available');
  }
  pending = undefined;
  picker.destroy(); picker = undefined;
  try { request.callback({ video: selected }); }
  catch { /* A navigation can invalidate the frame before Chromium accepts it. */ }
});
ipcMain.handle('alveo:capture:cancel', event => {
  if (!pickerSender(event)) throw new Error('Invalid capture picker');
  cancelCapture();
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { main?.show(); main?.focus(); });
  app.on('before-quit', () => {
    quitting = true; cancelCapture();
    if (main && !main.isDestroyed()) main.destroy();
    tray?.destroy();
  });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
  app.whenReady().then(async () => {
    // In-memory cookies avoid persisting desktop credentials before #31 supplies
    // an OS-protected browser handoff. A full quit signs this shell out.
    const partition = session.fromPartition('alveo-desktop');
    partition.on('will-download', event => event.preventDefault());
    partition.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
      if (contents !== main?.webContents || !details.isMainFrame || !sameOrigin(requestingOrigin, origin)) return false;
      // Display requests still pass the explicit, gesture-bound picker below.
      return permission === 'display-capture';
    });
    partition.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      if (contents !== main?.webContents || !details.isMainFrame || !sameOrigin(details.requestingUrl, origin)) return callback(false);
      if (permission === 'display-capture') return callback(true);
      if (permission !== 'media' || permissionPrompt) return callback(false);
      permissionPrompt = true;
      const frame = contents.mainFrame;
      try {
        const { response } = await dialog.showMessageBox(main, {
          type: 'question', title: 'Alveo microphone and camera',
          message: 'Allow microphone or camera access for this request?',
          detail: 'Your operating system may also request permission. Stop devices using the call controls.',
          buttons: ['Cancel', 'Allow'], defaultId: 0, cancelId: 0,
        });
        callback(response === 1 && trustedFrame(frame, main?.webContents, origin));
      } catch { callback(false); }
      finally { permissionPrompt = false; }
    });
    partition.setDisplayMediaRequestHandler(async (request, callback) => {
      if (pending || !captureAllowed(request, main?.webContents, origin)) return callback({});
      // Audio isolation requires the platform adapters. Never silently substitute
      // system loopback for selected-application audio.
      if (request.audioRequested) {
        callback({});
        void dialog.showMessageBox(main, { type: 'info', message: 'Choose “Window or screen, video only”.',
          detail: 'Application and system audio sharing are not available in this desktop preview.' });
        return;
      }
      const current = { callback, frame: request.frame, sources: [] };
      pending = current;
      try {
        const ownIds = new Set([main?.getMediaSourceId()].filter(Boolean));
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 240, height: 140 } });
        if (pending !== current) return;
        if (!trustedFrame(current.frame, main?.webContents, origin)) return cancelCapture();
        current.sources = sources.filter(source => !ownIds.has(source.id));
        picker = new BrowserWindow({ width: 760, height: 560, parent: main, modal: true, title: 'Choose what to share',
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
            preload: asset('./picker-preload.cjs') } });
        picker.setMenu(null);
        picker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        picker.webContents.on('will-navigate', event => event.preventDefault());
        picker.on('closed', () => { picker = undefined; if (pending === current) cancelCapture(); });
        await picker.loadFile(asset('./picker.html'));
      } catch { cancelCapture(); }
    });

    main = new BrowserWindow({ width: 1280, height: 850, minWidth: 800, minHeight: 600, title: 'Alveo',
      icon: iconPath(),
      webPreferences: { session: partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
        webviewTag: false, backgroundThrottling: false } });
    main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    main.webContents.on('will-attach-webview', event => event.preventDefault());
    main.webContents.on('will-navigate', (event, url) => {
      cancelCapture();
      if (!sameOrigin(url, origin)) event.preventDefault();
    });
    main.webContents.on('will-redirect', (event, url) => {
      if (!sameOrigin(url, origin)) event.preventDefault();
    });
    main.webContents.on('render-process-gone', cancelCapture);
    main.on('close', event => { if (!quitting) { event.preventDefault(); main.hide(); } });
    tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 24, height: 24 }));
    tray.setToolTip('Alveo — calls continue while the window is hidden');
    const commands = [
      { label: 'Show Alveo', click: () => { main.show(); main.focus(); } },
      { label: 'Open Alveo in browser', click: () => { void shell.openExternal('https://alveo.chat/login'); } },
      { label: 'Check for updates', click: () => {
        if (updates) void updates.check(true);
        else void dialog.showMessageBox(main, { message: 'Install a packaged Alveo release to receive desktop updates.' });
      } },
      { label: 'Stop all capture and reload', click: () => { cancelCapture(); main.webContents.reload(); } },
      { type: 'separator' }, { label: 'Quit and stop all capture', click: quit },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(commands));
    tray.on('double-click', () => { main.show(); main.focus(); });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Alveo', submenu: commands }, { role: 'editMenu' }]));
    if (app.isPackaged && ['win32', 'linux'].includes(process.platform)) {
      const { default: electronUpdater } = await import('electron-updater');
      updates = createDesktopUpdates({
        updater: electronUpdater.autoUpdater,
        prompt: options => dialog.showMessageBox(main, options),
        prepareInstall: () => { quitting = true; cancelCapture(); },
      });
      void updates.check();
      const updateTimer = setInterval(() => { void updates.check(); }, 30 * 60 * 1000);
      updateTimer.unref();
      app.once('before-quit', () => clearInterval(updateTimer));
    }
    await main.loadURL(origin);
  }).catch(() => { dialog.showErrorBox('Alveo could not start', 'Check your connection and restart Alveo.'); quit(); });
}
