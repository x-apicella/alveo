"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Track, type LocalTrackPublication } from "livekit-client";
import { createShareLifecycle } from "@/lib/share-lifecycle";
import { shareTrackName } from "@/lib/source-viewing";

type ShareMode = "video+audio" | "video" | "audio";

interface Source {
  id: string;
  label: string;
  mode: ShareMode;
  lifecycle: ReturnType<typeof createShareLifecycle<LocalTrackPublication>>;
}

/**
 * Lets one participant publish any number of extra sources on top of their
 * camera and microphone: a window or screen with or without its audio, or the
 * audio of an application on its own. Each source becomes one or two extra
 * LiveKit tracks that other participants see and hear as separate tiles.
 */
export function SourcePanel() {
  const { localParticipant } = useLocalParticipant();
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const active = useRef(new Map<string, Source>());
  const lifetime = useRef({ mounted: true });
  const busy = useRef(false);
  const [adding, setAdding] = useState(false);

  const stopSource = useCallback(
    async (source: Source) => {
      active.current.delete(source.id);
      const closing = source.lifecycle.close();
      if (lifetime.current.mounted) setSources((prev) => prev.filter((s) => s.id !== source.id));
      await closing;
    },
    [],
  );

  async function addSource(mode: ShareMode) {
    if (busy.current) return;
    busy.current = true;
    setAdding(true);
    const currentLifetime = lifetime.current;
    try {
      await captureSource(mode, currentLifetime);
    } finally {
      busy.current = false;
      if (currentLifetime.mounted) setAdding(false);
    }
  }

  async function captureSource(mode: ShareMode, currentLifetime: { mounted: boolean }) {
    setError(null);
    let stream: MediaStream;
    try {
      // Browsers require video in the request even when only audio is wanted.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
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

    if (!currentLifetime.mounted) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (mode !== "video" && !audioTrack) {
      stream.getTracks().forEach((t) => t.stop());
      setError(
        "No audio was captured. Tick “Share audio” in the picker, or share a tab or the whole screen: most browsers only capture audio for those.",
      );
      return;
    }
    if (mode === "audio" && videoTrack) {
      // Audio-only share: drop the video the browser insisted on capturing.
      videoTrack.stop();
      stream.removeTrack(videoTrack);
    }

    const n = ++counter.current;
    const id = crypto.randomUUID();
    const label = videoTrack?.label || audioTrack?.label || `Source ${n}`;
    const lifecycle = createShareLifecycle<LocalTrackPublication>(stream, async (pub) => {
      if (pub.track) await localParticipant.unpublishTrack(pub.track, true);
    });
    const source: Source = { id, label, mode, lifecycle };
    active.current.set(id, source);
    const onEnded = () => { void stopSource(source); };
    stream.getTracks().forEach((track) => track.addEventListener("ended", onEnded, { once: true }));
    try {
      if (mode !== "audio" && videoTrack) {
        await lifecycle.add(
          await localParticipant.publishTrack(videoTrack, {
            name: shareTrackName(id, label, "video"),
            source: Track.Source.ScreenShare,
            simulcast: true,
          }),
        );
      }
      if (audioTrack && !lifecycle.closed) {
        await lifecycle.add(
          await localParticipant.publishTrack(audioTrack, {
            name: shareTrackName(id, label, "audio"),
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
      if (currentLifetime.mounted) setError(`Could not publish: ${String(e)}`);
      return;
    }

    if (currentLifetime.mounted && !lifecycle.closed) setSources((prev) => [...prev, source]);
  }

  // Tear everything down when leaving the room.
  useEffect(() => {
    const currentLifetime = { mounted: true };
    lifetime.current = currentLifetime;
    const currentSources = active.current;
    return () => {
      currentLifetime.mounted = false;
      currentSources.forEach((source) => { void source.lifecycle.close(); });
      currentSources.clear();
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm">
      {sources.map((s) => (
        <span key={s.id} className="flex items-center gap-1 rounded-full bg-panel-2 px-3 py-1">
          <span title={s.label}>
            {s.mode === "audio" ? "🎵" : s.mode === "video" ? "🖥️" : "🖥️🎵"}{" "}
            {s.label.length > 24 ? s.label.slice(0, 22) + "…" : s.label}
          </span>
          <button
            type="button"
            className="ml-1 opacity-60 hover:opacity-100"
            title="Stop sharing"
            onClick={() => stopSource(s)}
          >
            ✕
          </button>
        </span>
      ))}
      <AddMenu onPick={addSource} disabled={adding} />
      {error && <span role="alert" className="max-w-xs text-xs text-red-400">{error}</span>}
    </div>
  );
}

function AddMenu({ onPick, disabled }: { onPick: (mode: ShareMode) => void; disabled: boolean }) {
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
        {disabled ? "Adding source…" : "+ Share source"}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col overflow-hidden rounded-md bg-panel-2 shadow-lg">
          <MenuItem onClick={() => pick("video+audio")}>Window or screen with audio</MenuItem>
          <MenuItem onClick={() => pick("video")}>Window or screen, video only</MenuItem>
          <MenuItem onClick={() => pick("audio")}>Audio only from an app or tab</MenuItem>
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
