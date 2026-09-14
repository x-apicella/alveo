export interface CallPreferences {
  audio: boolean;
  video: boolean;
  audioinput?: string;
  videoinput?: string;
  audiooutput?: string;
}

export function loadCallPreferences(): CallPreferences {
  const defaults: CallPreferences = { audio: true, video: false };
  try {
    const saved = JSON.parse(localStorage.getItem("alveo-call-devices") ?? "{}");
    for (const kind of ["audioinput", "videoinput", "audiooutput"] as const) {
      if (typeof saved[kind] === "string") defaults[kind] = saved[kind];
    }
  } catch { /* Storage can be unavailable. Never persist permission to capture. */ }
  return defaults;
}

export function saveCallDevice(kind: MediaDeviceKind, id: string) {
  try { localStorage.setItem("alveo-call-devices", JSON.stringify({ ...loadCallPreferences(), [kind]: id })); }
  catch { /* Device selection still works in this call. */ }
}

/** Serialize microphone transitions, coalescing rapid PTT keyup/keydown events. */
export function createMicrophoneGate(apply: (enabled: boolean) => Promise<unknown>, onError: () => void) {
  let desired = false;
  let applied: boolean | undefined;
  let running = false;
  let closed = false;
  async function flush() {
    if (running || closed) return;
    running = true;
    try {
      while (!closed && applied !== desired) {
        const next = desired;
        await apply(next);
        applied = next;
      }
    } catch { if (!closed) onError(); }
    finally {
      if (closed) await apply(false).catch(() => {});
      running = false;
    }
  }
  return {
    set(enabled: boolean) { desired = enabled; void flush(); },
    close() { closed = true; if (!running) void apply(false).catch(() => {}); },
  };
}
