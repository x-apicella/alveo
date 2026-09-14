"use client";

import { useEffect, useRef, useState } from "react";
import { AudioTrack, StartAudio, VideoTrack, useConnectionState, useTracks, type TrackReference } from "@livekit/components-react";
import { RemoteTrackPublication, RoomEvent, Track } from "livekit-client";
import { defaultPreference, groupSources, wantsTrack, type ViewerPreference } from "@/lib/source-viewing";
import { StreamDiagnostics } from "./StreamDiagnostics";

type Source = ReturnType<typeof groupSources<TrackReference>>[number];

export function SourceViewer({ deafened = false }: { deafened?: boolean }) {
  const tracks = useTracks(
    [Track.Source.Microphone, Track.Source.Camera, Track.Source.ScreenShare, Track.Source.ScreenShareAudio, Track.Source.Unknown],
    { onlySubscribed: false, updateOnlyOn: [RoomEvent.Reconnected, RoomEvent.ParticipantNameChanged,
      RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed] },
  );
  // Keep preferences above individual cards: temporary unpublish/reconnect must
  // not reset a source's selection, mute or volume. Cleared when the call ends.
  const [preferences, setPreferences] = useState<Record<string, ViewerPreference>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const sources = groupSources(tracks);
  return (
    <section aria-label="Available sources" className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Sources and audio</h2>
          <p className="text-sm text-muted">Voices play automatically. Choose which shares to watch or hear.</p>
        </div>
        <StartAudio label="Enable audio playback" />
      </div>
      <StreamDiagnostics tracks={tracks} />
      {sources.length === 0 && <p className="text-muted">No sources yet. Turn on your microphone or share a source.</p>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sources.map(source => (
          <SourceCard key={source.key} source={source}
            deafened={deafened}
            preference={preferences[source.key] ?? defaultPreference(source.voice)}
            focused={focused === source.key}
            onFocus={() => setFocused(focused === source.key ? null : source.key)}
            onChange={patch => setPreferences(previous => ({ ...previous,
              [source.key]: { ...(previous[source.key] ?? defaultPreference(source.voice)), ...patch },
            }))} />
        ))}
      </div>
    </section>
  );
}

function SourceCard({ source, preference, focused, onFocus, onChange, deafened }: {
  source: Source; preference: ViewerPreference; focused: boolean;
  onFocus: () => void; onChange: (patch: Partial<ViewerPreference>) => void;
  deafened: boolean;
}) {
  const connection = useConnectionState();
  const container = useRef<HTMLElement>(null);
  const videoElement = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const video = source.tracks.find(ref => ref.publication.kind === Track.Kind.Video);
  const audio = source.tracks.filter(ref => ref.publication.kind === Track.Kind.Audio);
  const hasAudio = audio.length > 0;
  const paused = source.tracks.every(ref => ref.publication.isMuted);

  useEffect(() => {
    for (const { publication } of source.tracks) {
      if (publication instanceof RemoteTrackPublication) {
        const desired = wantsTrack(publication.kind, preference) && !(deafened && publication.kind === Track.Kind.Audio);
        if (publication.isDesired !== desired) publication.setSubscribed(desired);
      }
    }
  }, [source.tracks, preference, connection, deafened]);

  async function expand(kind: "fullscreen" | "pip") {
    setError(null);
    try {
      if (kind === "fullscreen") await container.current?.requestFullscreen();
      else await videoElement.current?.requestPictureInPicture();
    } catch {
      setError("Your browser could not open this view. Try again once the video is playing.");
    }
  }

  const title = `${source.owner} — ${source.label}`;
  return (
    <article ref={container} aria-label={title}
      className={`rounded-xl border border-white/10 bg-panel p-4 ${focused && video && preference.selected ? "lg:col-span-2" : ""}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{source.label}</h3>
          <p className="break-words text-sm text-muted">{source.owner}{source.local ? " (you)" : ""}</p>
          <p className="text-xs text-muted">{video ? hasAudio ? "Video + audio" : "Video only" : "Audio only"} · {paused ? "Paused" : "Live"}</p>
        </div>
        <button type="button" className="rounded-md bg-panel-2 px-3 py-2 text-sm"
          aria-pressed={preference.selected} onClick={() => onChange({ selected: !preference.selected })}>
          {source.local ? preference.selected ? "Hide preview" : "Preview" : video ? preference.selected ? "Stop watching" : "Watch" : preference.selected ? "Stop listening" : "Listen"}
        </button>
      </div>
      {video && preference.selected && (
        <>
          <VideoTrack ref={videoElement} trackRef={video} manageSubscription={false}
            className={`w-full rounded-lg bg-black object-contain ${focused ? "max-h-[70vh]" : "max-h-72"}`} />
          {!source.local && !video.publication.isSubscribed && <p role="status" className="text-sm text-muted">Waiting for video…</p>}
          <div className="my-2 flex flex-wrap gap-3 text-sm">
            <button type="button" aria-pressed={focused} onClick={onFocus}>{focused ? "Unfocus" : "Focus"}</button>
            {typeof document !== "undefined" && document.fullscreenEnabled && <button type="button" onClick={() => void expand("fullscreen")}>Fullscreen</button>}
            {typeof document !== "undefined" && document.pictureInPictureEnabled && <button type="button" onClick={() => void expand("pip")}>Pop out video</button>}
          </div>
        </>
      )}
      {hasAudio && !source.local && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-md bg-panel-2 px-3 py-1 text-sm"
            aria-pressed={preference.muted} onClick={() => onChange({ muted: !preference.muted })}>
            {preference.muted ? "Unmute" : "Mute"}
          </button>
          <label className="flex items-center gap-2 text-sm">Volume
            <input aria-label={`${title} volume`} type="range" min="0" max="100" step="1"
              value={Math.round(preference.volume * 100)} onChange={event => onChange({ volume: Number(event.target.value) / 100 })} />
            <span>{Math.round(preference.volume * 100)}%</span>
          </label>
        </div>
      )}
      {source.local && hasAudio && <p className="mt-2 text-xs text-muted">Your own audio is never played back.</p>}
      {!deafened && !source.local && wantsTrack("audio", preference) && audio.map(ref => (
        <AudioTrack key={ref.publication.trackSid} trackRef={ref} volume={preference.volume} />
      ))}
      {error && <p role="alert" className="mt-2 text-sm text-red-400">{error}</p>}
    </article>
  );
}
