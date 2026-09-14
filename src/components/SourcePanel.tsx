"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectionState, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent, Track, type LocalTrackPublication } from "livekit-client";
import { createShareLifecycle } from "@/lib/share-lifecycle";
import { shareTrackName } from "@/lib/source-viewing";
import { configureShareVideo, STREAM_PRESETS, type StreamQuality } from "@/lib/stream-quality";

type ShareMode = "video+audio" | "video" | "audio";

interface Source {
  id: string;
  label: string;
  mode: ShareMode;
  state: "publishing" | "live";
  detail?: string;
  lifecycle: ReturnType<typeof createShareLifecycle<LocalTrackPublication>>;
}

// Conservative product limit; real-device capacity is tracked in #36.
const MAX_SOURCES = 3;

export function SourcePanel() {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const active = useRef(new Map<string, Source>());
  const lifetime = useRef({ mounted: true });
  const busy = useRef(false);
  const [adding, setAdding] = useState(false);
  const generation = useRef(0);
  const [quality, setQuality] = useState<StreamQuality>("balanced");

  const stopSource = useCallback(
    async (source: Source) => {
      active.current.delete(source.id);
      const closing = source.lifecycle.close();
      if (lifetime.current.mounted) setSources((prev) => prev.filter((s) => s.id !== source.id));
      await closing;
    },
    [],
  );

  async function addSource(mode: ShareMode, replacing?: Source) {
    if (busy.current || room.state !== ConnectionState.Connected ||
        (!replacing && active.current.size >= MAX_SOURCES)) return;
    busy.current = true;
    setAdding(true);
    const currentLifetime = lifetime.current;
    try {
      await captureSource(mode, currentLifetime, replacing);
    } finally {
      busy.current = false;
      if (currentLifetime.mounted) setAdding(false);
    }
  }

  async function captureSource(mode: ShareMode, currentLifetime: { mounted: boolean }, replacing?: Source) {
    const requestGeneration = generation.current;
    const isCurrent = () => currentLifetime.mounted && generation.current === requestGeneration &&
      room.state === ConnectionState.Connected;
    setError(null);
    let stream: MediaStream;
    try {
      // Browsers require video in the request even when only audio is wanted.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: STREAM_PRESETS[quality].fps },
        audio:
          mode === "video"
            ? false
            : {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
      });
    } catch (e) {
      // User cancelled the picker or the browser refused.
      if (currentLifetime.mounted && (e as DOMException).name !== "NotAllowedError") setError(String(e));
      return;
    }

    if (!isCurrent() || replacing?.lifecycle.closed) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if ((mode !== "audio" && (!videoTrack || videoTrack.readyState === "ended")) ||
        (mode !== "video" && audioTrack?.readyState === "ended")) {
      stream.getTracks().forEach((track) => track.stop());
      setError("The selected source has ended. Choose a source again.");
      return;
    }

    if (mode !== "video" && !audioTrack) {
      stream.getTracks().forEach((t) => t.stop());
      setError(
        "No audio was captured. Choose a source that offers Share audio in your browser, or use video only. Availability depends on your browser and operating system.",
      );
      return;
    }
    if (mode === "audio" && videoTrack) {
      // Audio-only share: drop the video the browser insisted on capturing.
      videoTrack.stop();
      stream.removeTrack(videoTrack);
    }

    const n = ++counter.current;
    const id = replacing?.id ?? crypto.randomUUID();
    const label = videoTrack?.label || audioTrack?.label || `Source ${n}`;
    // Validate the picker result before ending the old source. Stop before
    // publishing the replacement so two captures never share a source ID.
    const previousClosing = replacing ? stopSource(replacing) : undefined;
    const lifecycle = createShareLifecycle<LocalTrackPublication>(stream, async (pub) => {
      if (pub.track) await localParticipant.unpublishTrack(pub.track, true);
    }, () => { void stopSource(source); });
    const source: Source = { id, label, mode, lifecycle, state: "publishing" };
    active.current.set(id, source);
    setSources((prev) => [...prev, source]);
    try {
      // Register the new capture before waiting on network cleanup, so leave or
      // browser stop can release it even if the previous unpublish is slow.
      await previousClosing;
      if (!isCurrent() || lifecycle.closed) {
        await stopSource(source);
        return;
      }
      if (mode !== "audio" && videoTrack) {
        const configured = await configureShareVideo(videoTrack, quality);
        if (!isCurrent() || lifecycle.closed) { await stopSource(source); return; }
        const { width, height, frameRate } = configured.settings;
        source.detail = `${width ?? "?"}×${height ?? "?"} · ${frameRate ? Math.round(frameRate) : "?"} fps · ${STREAM_PRESETS[configured.quality].bitrate / 1_000_000} Mb/s cap${configured.quality !== quality ? " · reduced quality" : ""}`;
        await lifecycle.add(
          await localParticipant.publishTrack(videoTrack, {
            name: shareTrackName(id, label, "video", mode),
            source: Track.Source.ScreenShare,
            simulcast: true,
            videoCodec: "vp8",
            screenShareEncoding: configured.encoding,
            degradationPreference: "balanced",
          }),
        );
      }
      if (audioTrack && !lifecycle.closed) {
        await lifecycle.add(
          await localParticipant.publishTrack(audioTrack, {
            name: shareTrackName(id, label, "audio", mode),
            source: Track.Source.ScreenShareAudio,
            // Music and game audio: keep it stereo and skip voice processing.
            forceStereo: true,
            dtx: false,
            red: false,
            audioPreset: { maxBitrate: 128_000 },
          }),
        );
      }
    } catch (e) {
      await stopSource(source);
      if (isCurrent()) setError(`Could not publish${replacing ? " replacement; the previous source has stopped" : ""}: ${String(e)}`);
      return;
    }

    if (isCurrent() && !lifecycle.closed) {
      source.state = "live";
      setSources((prev) => [...prev]);
    }
  }

  // Tear everything down when leaving the room.
  useEffect(() => {
    const currentLifetime = { mounted: true };
    lifetime.current = currentLifetime;
    const currentSources = active.current;
    const interrupted = () => {
      generation.current++;
      // Let LiveKit recover already-live tracks. Never restart a capture picker
      // or finish an interrupted partial publication automatically.
      currentSources.forEach((source) => {
        if (room.state === ConnectionState.Disconnected || source.state === "publishing") void stopSource(source);
      });
    };
    room.on(RoomEvent.Reconnecting, interrupted);
    room.on(RoomEvent.SignalReconnecting, interrupted);
    room.on(RoomEvent.Disconnected, interrupted);
    return () => {
      currentLifetime.mounted = false;
      room.off(RoomEvent.Reconnecting, interrupted);
      room.off(RoomEvent.SignalReconnecting, interrupted);
      room.off(RoomEvent.Disconnected, interrupted);
      currentSources.forEach((source) => { void source.lifecycle.close(); });
      currentSources.clear();
    };
  }, [room, stopSource]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {sources.map((s) => (
        <span key={s.id} className="flex items-center gap-1 rounded-full bg-panel-2 px-3 py-1">
          <span title={s.label}>
            {s.mode === "audio" ? "🎵" : s.mode === "video" ? "🖥️" : "🖥️🎵"}{" "}
            {s.label.length > 24 ? s.label.slice(0, 22) + "…" : s.label}
            {s.state === "publishing" ? " · Publishing…" : " · Live"}
            {s.detail && <span className="block text-xs opacity-70">{s.detail}</span>}
          </span>
          <button type="button" disabled={adding || s.state !== "live" || connection !== ConnectionState.Connected}
            className="ml-1 disabled:opacity-40" aria-label={`Replace ${s.label}`}
            onClick={() => addSource(s.mode, s)}>Replace</button>
          <button
            type="button"
            className="ml-1 opacity-60 hover:opacity-100"
            title="Stop sharing"
            aria-label={`Stop sharing ${s.label}`}
            onClick={() => stopSource(s)}
          >
            ✕
          </button>
        </span>
      ))}
      <AddMenu onPick={addSource} disabled={adding || sources.length >= MAX_SOURCES || connection !== ConnectionState.Connected} adding={adding} />
      <label className="text-xs">Share quality <select className="rounded bg-panel-2 p-1" aria-label="Share quality" value={quality} disabled={adding}
        onChange={event => setQuality(event.target.value as StreamQuality)}>
        {Object.entries(STREAM_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
      </select></label>
      <span className="text-xs opacity-70">{sources.length}/{MAX_SOURCES} sources · Audio depends on browser/picker support</span>
      {connection !== ConnectionState.Connected && <span role="status">Sharing unavailable while {connection}</span>}
      {error && <span role="alert" className="max-w-xs text-xs text-red-400">{error}</span>}
    </div>
  );
}

function AddMenu({ onPick, disabled, adding }: { onPick: (mode: ShareMode) => void; disabled: boolean; adding: boolean }) {
  const [open, setOpen] = useState(false);
  const pick = (m: ShareMode) => {
    setOpen(false);
    onPick(m);
  };
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        className="rounded-md bg-accent px-3 py-1 font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        {adding ? "Adding source…" : "+ Share source"}
      </button>
      {open && !disabled && (
        <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col overflow-hidden rounded-md bg-panel-2 shadow-lg">
          <MenuItem onClick={() => pick("video+audio")}>Window or screen with audio</MenuItem>
          <MenuItem onClick={() => pick("video")}>Window or screen, video only</MenuItem>
          <MenuItem onClick={() => pick("audio")}>Audio only (uses display picker)</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="px-3 py-2 text-left hover:bg-white/10">
      {children}
    </button>
  );
}
