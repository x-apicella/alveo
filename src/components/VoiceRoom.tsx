"use client";

import { useEffect, useState } from "react";
import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { Channel } from "@/db/schema";
import { SourcePanel } from "./SourcePanel";

interface Credentials {
  token: string;
  url: string;
}

export function VoiceRoom({ channel }: { channel: Channel }) {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The page keys this component by channel id, so a fresh token is fetched per channel.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Could not get token");
        const data: Credentials = await r.json();
        if (!cancelled) setCreds(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [channel.id]);

  if (error) return <Centered>{error}</Centered>;
  if (!creds) return <Centered>Connecting…</Centered>;

  if (!joined) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-xl font-semibold">🔊 {channel.name}</h2>
          <button
            className="rounded-md bg-accent px-5 py-2 font-medium"
            onClick={() => setJoined(true)}
          >
            Join voice
          </button>
        </div>
      </Centered>
    );
  }

  return (
    <LiveKitRoom
      token={creds.token}
      serverUrl={creds.url}
      connect
      audio
      video={false}
      onDisconnected={() => setJoined(false)}
      className="flex h-full min-h-0 flex-col"
      data-lk-theme="default"
    >
      <header className="flex items-center justify-between border-b border-black/30 px-4 py-2">
        <span className="font-semibold">🔊 {channel.name}</span>
        <SourcePanel />
      </header>
      <Stage />
      <RoomAudioRenderer />
      {/* Screen sharing is handled by SourcePanel so several shares can coexist. */}
      <ControlBar variation="minimal" controls={{ screenShare: false }} />
    </LiveKitRoom>
  );
}

/**
 * Every published camera and screen-share track gets its own tile, so a
 * participant sharing a webcam plus two application windows shows three tiles.
 */
function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  return (
    <GridLayout tracks={tracks} className="flex-1 min-h-0">
      <ParticipantTile />
    </GridLayout>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="voice-lobby grid flex-1 place-items-center p-8 text-center">{children}</div>;
}
