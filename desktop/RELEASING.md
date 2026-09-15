# Production desktop releases

The CI workflow builds Windows NSIS and Linux AppImage installers (x64) before
it permits the VPS deployment. Once that exact commit passes VPS deployment and
public health checks, CI publishes both installers and electron-updater metadata
to one GitHub Release. Failed, rolled-back, skipped and superseded deployments
do not publish desktop updates. A packaging failure also prevents deployment.

Each CI run uses version 0.1.RUN_NUMBER; reruns keep the same version and a
published release is never overwritten. Keep the CI workflow identity and its
run counter when reorganizing workflows. Check the latest published version
before intentionally resetting the counter or changing the version scheme.

Packaged clients check GitHub Releases at launch and every 30 minutes. A native
dialog offers Download update. After download, a separate Restart and install
choice explicitly ends capture and the call. Later leaves the current session
running; Check for updates in the menu reopens the offer. Downloads are not
automatically installed on quit. Background network failures are quiet; manual
checks report a sanitized error. The hosted page receives no updater bridge.

Every production deployment currently produces a desktop version, even when
only the hosted UI changed. A desktop restart loads the deployed web UI.
Stop all capture and reload can refresh the hosted UI without replacing the
desktop binary. Existing source-run previews do not update themselves: users
must install their first packaged release once.

## Packaging locally

Run npm ci in desktop, then npm run dist -- --x64. The app contains only the
desktop shell, updater dependency and logo, not the web server or deployment
credentials. Linux runs must use the AppImage for in-place updates.

The initial Windows and Linux installers are unsigned previews. Windows may
display publisher/reputation warnings. No signature checks are disabled in the
updater. Configure signing before claiming a verified publisher. macOS releases
are not produced: they require Apple signing/notarization setup. This release
does not complete browser-to-desktop Google sign-in or native application audio.

## Activation and verification

Production VPS enrollment and the private smoke fixture described in
[automatic deployment](../deploy/vps/AUTOMATIC-DEPLOYMENT.md) remain prerequisites.
No installer is published while deployment is blocked. The first release
bootstraps installation; the second release exercises the real upgrade path.

CI builds real installers on Windows and Linux and runs the existing native
shell tests. Unit tests cover consent, deferral, error handling and concurrent
checks. Before promoting beyond preview, install version A on real Windows and
Linux machines, publish deployed version B, decline download/restart during a
call, then accept and verify version B, sign-in and device release. Mocked tests
do not prove the OS installer replacement path.

References:
- [electron-builder updates](https://www.electron.build/docs/features/auto-update/)
- [Electron updating applications](https://www.electronjs.org/docs/latest/tutorial/updates)
