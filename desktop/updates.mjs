// Runs only in the trusted main process. The hosted page has no updater IPC.
export function createDesktopUpdates({ updater, prompt, prepareInstall }) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  let checking = false;
  let downloading = false;
  let showing = false;
  let downloaded = false;
  let offered;
  let manual = false;

  async function offerInstall() {
    if (showing) return;
    showing = true;
    try {
      const { response } = await prompt({
        type: 'info', title: 'Alveo update ready',
        message: 'Your Alveo update is ready.',
        detail: 'Restarting ends your current call and screen share. You will need to sign in again.',
        buttons: ['Later', 'Restart and install'], defaultId: 0, cancelId: 0,
      });
      if (response === 1) {
        prepareInstall();
        updater.quitAndInstall(false, true);
      }
    } finally { showing = false; }
  }

  async function available(info) {
    if (showing || (!manual && offered === info.version)) return;
    offered = info.version;
    showing = true;
    let response;
    try {
      ({ response } = await prompt({
        type: 'info', title: 'Alveo update available',
        message: 'An Alveo update is available.',
        detail: 'Version ' + info.version + '. Download now and choose when to restart. Your call can continue during the download.',
        buttons: ['Later', 'Download update'], defaultId: 0, cancelId: 0,
      }));
    } finally { showing = false; }
    if (response !== 1) return;
    manual = true; // Download is now a user-requested operation, even after a background check.
    downloading = true;
    try { await updater.downloadUpdate(); }
    finally { downloading = false; }
  }

  async function failed() {
    if (!manual || showing) return;
    showing = true;
    try {
      await prompt({ type: 'info', title: 'Alveo updates',
        message: 'Could not check or download the update. Try again from the Alveo menu.',
        buttons: ['OK'] });
    } finally { showing = false; }
  }
  updater.on('error', () => { void failed().catch(() => {}); });
  updater.on('update-available', info => { void available(info).catch(() => {}); });
  updater.on('update-downloaded', () => {
    downloaded = true;
    void offerInstall().catch(() => {});
  });
  updater.on('update-not-available', () => {
    if (manual) void prompt({ type: 'info', title: 'Alveo updates',
      message: 'Alveo is up to date.', buttons: ['OK'] }).catch(() => {});
  });

  return {
    async check(userInitiated = false) {
      if (checking || downloading || showing) return;
      manual = userInitiated;
      if (downloaded) { if (manual) await offerInstall(); return; }
      checking = true;
      try { await updater.checkForUpdates(); }
      catch { /* The updater error event supplies a sanitized message. */ }
      finally { checking = false; }
    },
  };
}
