"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Track, type LocalTrackPublication } from "livekit-client";

type ShareMode = "video+audio" | "video" | "audio";

interface Source {
  id: string;
  label: string;
  mode: ShareMode;
  publications: LocalTrackPublication[];
  stream: MediaStream;
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

  const stopSource = useCallback(
    async (source: Source) => {
      for (const pub of source.publications) {
        if (pub.track) await localParticipant.unpublishTrack(pub.track, true);
      }
      source.stream.getTracks().forEach((t) => t.stop());
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    },
    [localParticipant],
  );

  async function addSource(mode: ShareMode) {
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
      if ((e as DOMException).name !== "NotAllowedError") setError(String(e));
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
    const id = `share-${n}`;
    const label = videoTrack?.label || audioTrack?.label || `Source ${n}`;
    const publications: LocalTrackPublication[] = [];
    try {
      if (mode !== "audio" && videoTrack) {
        publications.push(
          await localParticipant.publishTrack(videoTrack, {
            name: id,
            source: Track.Source.ScreenShare,
            simulcast: true,
          }),
        );
      }
      if (audioTrack) {
        publications.push(
          await localParticipant.publishTrack(audioTrack, {
            name: `${id}-audio`,
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
      stream.getTracks().forEach((t) => t.stop());
      setError(`Could not publish: ${String(e)}`);
      return;
    }

    const source: Source = { id, label, mode, publications, stream };
    setSources((prev) => [...prev, source]);

    // The browser's own "Stop sharing" button ends the tracks; mirror that here.
    const onEnded = () => stopSource(source);
    videoTrack?.addEventListener("ended", onEnded);
    audioTrack?.addEventListener("ended", onEnded);
  }

  // Tear everything down when leaving the room.
  const sourcesRef = useRef(sources);
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach((s) => s.stream.getTracks().forEach((t) => t.stop()));
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
      <AddMenu onPick={addSource} />
      {error && <span className="max-w-xs text-xs text-red-400">{error}</span>}
    </div>
  );
}

function AddMenu({ onPick }: { onPick: (mode: ShareMode) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (m: ShareMode) => {
    setOpen(false);
    onPick(m);
  };
  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md bg-accent px-3 py-1 font-medium"
        onClick={() => setOpen((o) => !o)}
      >
        + Share source
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
