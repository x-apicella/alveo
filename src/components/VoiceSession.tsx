"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { RoomContext, useConnectionState, useLocalParticipant, useParticipants, MediaDeviceSelect } from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import type { Channel } from "@/db/schema";
import { createMicrophoneGate, loadCallPreferences, saveCallDevice, type CallPreferences } from "@/lib/call-preferences";
import { SourcePanel } from "./SourcePanel";
import { SourceViewer } from "./SourceViewer";

type Target = Pick<Channel, "id" | "name" | "serverId">;
interface Session { channel: Target; room: Room; choices: CallPreferences }
interface VoiceContextValue {
  channel?: Target;
  joining: boolean;
  error: string | null;
  join: (channel: Target, choices?: CallPreferences) => Promise<void>;
  leave: () => void;
  show: () => void;
}
const VoiceContext = createContext<VoiceContextValue | null>(null);
export function useVoiceSession() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("Voice session provider is missing");
  return value;
}

function stopRoom(room: Room) {
  // Release devices immediately, before waiting for signaling cleanup.
  room.localParticipant.trackPublications.forEach(publication => publication.track?.stop());
  void room.disconnect().catch(() => {});
}

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const active = useRef<Session | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const leave = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    const previous = active.current;
    active.current = null;
    setSession(null);
    setJoining(false);
    if (previous) stopRoom(previous.room);
  }, []);

  const join = useCallback(async (channel: Target, choices = loadCallPreferences()) => {
    if (active.current?.channel.id === channel.id) { setExpanded(true); return; }
    const attempt = ++generation.current;
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    setJoining(true);
    setError(null);
    let room: Room | undefined;
    try {
      // Fetch on each explicit join/rejoin, never on page navigation or prejoin.
      const response = await fetch("/api/livekit/token", { method: "POST", signal: abort.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: channel.id }) });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not join voice");
      const credentials = await response.json();
      if (generation.current !== attempt) return;
      const previous = active.current;
      active.current = null;
      if (previous) stopRoom(previous.room);
      room = new Room({ adaptiveStream: true, dynacast: true,
        audioCaptureDefaults: { deviceId: choices.audioinput },
        videoCaptureDefaults: { deviceId: choices.videoinput },
        audioOutput: { deviceId: choices.audiooutput },
      });
      const next = { channel, room, choices };
      active.current = next;
      room.on(RoomEvent.Disconnected, () => {
        if (active.current !== next) return;
        leave();
        setError("Voice disconnected. Join again when you are ready.");
      });
      setSession(next);
      setExpanded(true);
      await room.connect(credentials.url, credentials.token, { autoSubscribe: false });
      if (generation.current !== attempt) stopRoom(room);
    } catch (failure) {
      if (room) stopRoom(room);
      if (generation.current === attempt && !abort.signal.aborted) {
        if (active.current?.room === room) { active.current = null; setSession(null); }
        setError(failure instanceof Error ? failure.message : "Could not join voice");
      }
    } finally {
      if (generation.current === attempt) { request.current = null; setJoining(false); }
    }
  }, [leave]);

  useEffect(() => {
    // Synchronize the external media session with an authentication redirect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pathname === "/login") leave();
  }, [pathname, leave]);
  useEffect(() => {
    const onPageHide = () => leave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      leave();
    };
  }, [leave]);

  return <VoiceContext.Provider value={{ channel: session?.channel, joining, error, join, leave, show: () => setExpanded(true) }}>
    <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    {session && <RoomContext.Provider value={session.room}>
      <CallDock key={session.channel.id} session={session} expanded={expanded}
        toggle={() => setExpanded(value => !value)} leave={leave} />
    </RoomContext.Provider>}
    {joining && !session && <div role="status" className="border-t border-white/10 bg-panel p-3">Joining voice… <button onClick={leave}>Cancel join</button></div>}
    {error && <p role="alert" className="bg-panel px-3 py-2 text-sm text-red-300">{error}</p>}
  </VoiceContext.Provider>;
}

function CallDock({ session, expanded, toggle, leave }: { session: Session; expanded: boolean; toggle: () => void; leave: () => void }) {
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const participants = useParticipants({ updateOnlyOn: [RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackPublished,
    RoomEvent.TrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.ParticipantNameChanged] });
  const [microphone, setMicrophone] = useState(session.choices.audio);
  const [camera, setCamera] = useState(session.choices.video);
  const [deafened, setDeafened] = useState(false);
  const [ptt, setPtt] = useState(false);
  const [held, setHeld] = useState(false);
  const [devices, setDevices] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gate = useRef<ReturnType<typeof createMicrophoneGate> | null>(null);
  const cameraGate = useRef<ReturnType<typeof createMicrophoneGate> | null>(null);

  useEffect(() => {
    const current = createMicrophoneGate(enabled => localParticipant.setMicrophoneEnabled(enabled), () => {
      setMicrophone(false);
      setError("Microphone unavailable. Check permissions or choose another device, then retry.");
    });
    gate.current = current;
    const currentCamera = createMicrophoneGate(enabled => localParticipant.setCameraEnabled(enabled), () => {
      setCamera(false);
      setError("Camera unavailable. Check permissions or choose another device, then retry.");
    });
    cameraGate.current = currentCamera;
    return () => { current.close(); currentCamera.close(); };
  }, [localParticipant]);
  useEffect(() => {
    if (connection === ConnectionState.Connected) gate.current?.set(!deafened && (ptt ? held : microphone));
  }, [connection, deafened, ptt, held, microphone]);
  useEffect(() => {
    if (connection === ConnectionState.Connected) cameraGate.current?.set(camera);
  }, [connection, camera]);

  useEffect(() => {
    if (!ptt) return;
    const release = () => setHeld(false);
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
          target.closest("input, textarea, select, button, a, [contenteditable=true]")) return;
      event.preventDefault();
      setHeld(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") release(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [ptt]);

  useEffect(() => {
    let cancelled = false;
    const changed = async () => {
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        for (const kind of ["audioinput", "videoinput"] as const) {
          const id = session.room.getActiveDevice(kind);
          if (id && id !== "default" && !available.some(device => device.kind === kind && device.deviceId === id)) {
            if (kind === "audioinput") { setMicrophone(false); setHeld(false); }
            else setCamera(false);
            setError("A selected device was disconnected. Choose a device in Devices, then enable it again.");
          }
        }
      } catch { if (!cancelled) setError("Could not refresh devices. Reopen Devices to try again."); }
    };
    navigator.mediaDevices?.addEventListener("devicechange", changed);
    return () => { cancelled = true; navigator.mediaDevices?.removeEventListener("devicechange", changed); };
  }, [session.room]);

  return <aside aria-label="Active voice call" data-lk-theme="default" className="z-30 shrink-0 border-t border-accent/40 bg-panel shadow-2xl">
    <div className="flex flex-wrap items-center gap-3 p-3 text-sm">
      <Link href={`/s/${session.channel.serverId}/c/${session.channel.id}`} className="font-semibold">♬ {session.channel.name}</Link>
      <span role="status">{connection}</span>
      <button type="button" aria-pressed={!microphone} disabled={ptt || deafened} onClick={() => setMicrophone(value => !value)}>{isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}</button>
      <button type="button" aria-pressed={deafened} onClick={() => { setHeld(false); setDeafened(value => !value); }}>{deafened ? "Undeafen" : "Deafen"}</button>
      <button type="button" aria-pressed={ptt} onClick={() => { setHeld(false); setMicrophone(false); setPtt(value => !value); }}>Push to talk</button>
      {ptt && <button type="button" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setHeld(true); }}
        onPointerUp={() => setHeld(false)} onPointerCancel={() => setHeld(false)} onLostPointerCapture={() => setHeld(false)}
        onKeyDown={event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); setHeld(true); } }}
        onKeyUp={() => setHeld(false)} onBlur={() => setHeld(false)}>Hold to talk (Space)</button>}
      <button type="button" aria-pressed={camera} onClick={() => setCamera(value => !value)}>{isCameraEnabled ? "Stop camera" : "Start camera"}</button>
      <button type="button" aria-expanded={devices} onClick={() => setDevices(value => !value)}>Devices</button>
      <button type="button" aria-expanded={expanded} onClick={toggle}>{expanded ? "Hide call" : "Show call"}</button>
      <button type="button" onClick={leave} className="ml-auto text-red-300">Leave voice</button>
    </div>
    {error && <p role="alert" className="px-3 pb-2 text-sm text-red-300">{error}</p>}
    {devices && <div className="flex max-h-48 flex-wrap gap-6 overflow-auto px-3 pb-3">
      {(["audioinput", "videoinput", "audiooutput"] as const).map(kind => <div key={kind}>
        <p>{kind === "audioinput" ? "Microphone" : kind === "videoinput" ? "Camera" : "Speaker"}</p>
        {kind === "audiooutput" && !("setSinkId" in HTMLMediaElement.prototype)
          ? <p className="text-xs">Use your system sound settings in this browser.</p>
          : <MediaDeviceSelect kind={kind} requestPermissions={false}
            onActiveDeviceChange={id => saveCallDevice(kind, id)} onDeviceSelectError={() => setError("Could not switch device. Try another device.")} />}
      </div>)}
    </div>}
    {/* Keep this subtree mounted when collapsed or browsing text: it owns audio,
        source preferences and active display captures. */}
    <div hidden={!expanded} className="max-h-[55vh] overflow-y-auto border-t border-white/10">
      <div className="flex flex-wrap items-center gap-3 p-3"><SourcePanel /></div>
      <p className="px-3 text-xs text-muted">{participants.map(participant => {
        const sharing = [...participant.trackPublications.values()].some(publication => publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio);
        return `${participant.name || participant.identity || "You"}${participant.isSpeaking ? " · speaking" : ""}${sharing ? " · sharing" : ""}`;
      }).join(" · ")}</p>
      <SourceViewer deafened={deafened} />
    </div>
  </aside>;
}
