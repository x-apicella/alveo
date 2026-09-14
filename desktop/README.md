# Desktop preview

Electron 44.3.0 hosts the existing Alveo UI and LiveKit transport. Run with Node
22.12+ and pnpm 10.33:

```bash
pnpm install --frozen-lockfile
pnpm desktop:install
pnpm desktop
```

This is a developer preview, not a signed installer (#24). Email sign-in can use
the existing web flow. Google login must use the system-browser handoff in #31,
which is not implemented here: embedded external OAuth navigation is blocked.
The menu can open Alveo in the system browser; that does not transfer a session.
Cookies are in memory and disappear on full quit. No server credentials are
bundled with the shell.

Closing the window hides it in the tray and keeps the call running. The menu and
tray offer **Show Alveo**, **Stop all capture and reload**, and **Quit and stop all
capture**. Quit destroys the renderer, releasing devices even if the UI is stuck.
The web call provider continues to own logout, navigation and room cleanup.

## Capture boundary

Select **Window or screen, video only** in the existing share menu. The main
process validates the requesting origin, main frame and user gesture, enumerates
sources and opens a local modal picker. Only that picker receives a bridge with
`list`, `select(id)` and `cancel`; the remote page has no Node or IPC access. It
cannot supply an arbitrary capture ID. Frame changes, picker cancellation and
quit invalidate the pending request. Titles render as text, never HTML.

The resulting MediaStream uses the existing source IDs, pairing, replacement,
publication rollback and stop lifecycle. Native audio-only adapters will require
a separate transport contract; the browser display request is not that adapter.

| Capability | Desktop preview | Browser |
| --- | --- | --- |
| View remote streams, mic/camera | Existing web UI; device permission prompt | Existing behavior |
| Window/screen video | Explicit local picker; OS support varies | Browser picker |
| Selected-application audio | Unavailable; #11/#12/#13 | Browser-dependent, never guaranteed |
| True audio-only capture | Unavailable; #11/#12/#13 | Display picker workaround |
| Whole-system audio | Unavailable | Browser/picker-dependent |
| Google browser handoff | Pending #31 | Existing web sign-in |

The desktop shell rejects audio display requests, rather than silently selecting
system loopback. Alveo's own window is excluded from window enumeration; selecting
an entire screen can still include Alveo. Protected content may not be captured.
Platform audio, GPU/fullscreen behavior and real-device performance remain open.

## Verification

`pnpm test` covers origin, frame, gesture and capability policy. `pnpm test:desktop`
launches the actual Electron binary against an isolated loopback fixture and tests
sandbox settings, absence of remote Node/IPC access, blocked external navigation,
picker cancellation, hostile source titles, tray hiding/restoring and explicit quit.
Enumeration is synthetic: these tests do not prove native capture or real login.
Linux CI uses `xvfb-run -a`; Windows CI runs the same shell checks.

Only unpackaged development runs accept `ALVEO_DESKTOP_TEST_ORIGIN`, and only for
HTTP `127.0.0.1`. Packaged builds always load `https://alveo.chat`. All other
navigation and popup destinations are denied. Remote downloads and webviews are
blocked. The shell never disables TLS validation or sandboxing.

References: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security),
[session permissions and display capture](https://www.electronjs.org/docs/latest/api/session).
