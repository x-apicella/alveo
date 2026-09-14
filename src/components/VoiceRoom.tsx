"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MediaDeviceSelect, usePreviewTracks, useTrackVolume } from "@livekit/components-react";
import { LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import type { Channel } from "@/db/schema";
import { loadCallPreferences, saveCallDevice, type CallPreferences } from "@/lib/call-preferences";
import { useVoiceSession } from "./VoiceSession";

export function VoiceRoom({ channel }: { channel: Channel }) {
  const call = useVoiceSession();
  const [checking, setChecking] = useState(false);
  const here = call.channel?.id === channel.id;
  return <div className="voice-lobby grid flex-1 place-items-center overflow-y-auto p-6 text-center">
    <div className="flex max-w-xl flex-col items-center gap-3">
      <h2 className="text-xl font-semibold">♬ {channel.name}</h2>
      {here ? <>
        <p>Your call stays connected while you browse text channels and other servers.</p>
        <button type="button" onClick={call.show}>Show call</button>
      </> : <>
        {call.channel && <p>You are in {call.channel.name}. Moving here ends that call and its shares.</p>}
        {checking ? <DeviceCheck onCancel={() => setChecking(false)} onJoin={choices => {
          setChecking(false);
          void call.join(channel, choices);
        }} /> : <>
          <button type="button" disabled={call.joining} className="rounded-md bg-accent px-5 py-2 font-medium"
            onClick={() => void call.join(channel)}>{call.joining ? "Joining…" : call.channel ? "Move voice here" : "Join voice"}</button>
          <button type="button" disabled={call.joining} onClick={() => setChecking(true)}>Check microphone and camera</button>
        </>}
      </>}
      <p className="text-xs text-muted">One call per tab. Joining the same room elsewhere with your account may disconnect this session. No call resumes automatically after reload.</p>
    </div>
  </div>;
}

function DeviceCheck({ onJoin, onCancel }: { onJoin: (choices: CallPreferences) => void; onCancel: () => void }) {
  const [choices, setChoices] = useState(loadCallPreferences);
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback(() => setError("Device preview failed. Check browser permissions or disable the unavailable device."), []);
  const tracks = usePreviewTracks({
    audio: choices.audio ? { deviceId: choices.audioinput } : false,
    video: choices.video ? { deviceId: choices.videoinput } : false,
  }, reportError);
  const audio = tracks?.find(track => track instanceof LocalAudioTrack) as LocalAudioTrack | undefined;
  const video = tracks?.find(track => track instanceof LocalVideoTrack) as LocalVideoTrack | undefined;
  const level = useTrackVolume(choices.audio ? audio : undefined);
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const target = element.current;
    if (!target || !video || !choices.video) return;
    video.attach(target);
    return () => { video.detach(target); };
  }, [video, choices.video]);
  return <div className="flex w-full flex-col gap-3" data-lk-theme="default">
    <p className="text-sm">Preview stays on this device. Nothing is published until you join.</p>
    <label><input type="checkbox" checked={choices.audio} onChange={event => setChoices(value => ({ ...value, audio: event.target.checked }))} /> Microphone on join</label>
    <meter aria-label="Microphone level" className="w-full" min={0} max={1} value={level} />
    <label><input type="checkbox" checked={choices.video} onChange={event => setChoices(value => ({ ...value, video: event.target.checked }))} /> Camera on join</label>
    <video ref={element} autoPlay muted playsInline hidden={!choices.video} className="max-h-48 rounded-lg bg-black" />
    {(["audioinput", "videoinput"] as const).map(kind => <div key={kind}>
      <p>{kind === "audioinput" ? "Microphone" : "Camera"}</p>
      <MediaDeviceSelect kind={kind} track={kind === "audioinput" ? audio : video} requestPermissions={false}
        initialSelection={choices[kind]} onDeviceSelectError={reportError}
        onActiveDeviceChange={id => { saveCallDevice(kind, id); setChoices(value => ({ ...value, [kind]: id })); }} />
    </div>)}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <button type="button" className="rounded-md bg-accent px-5 py-2" onClick={() => onJoin(choices)}>Join with these devices</button>
    <button type="button" onClick={onCancel}>Cancel device check</button>
  </div>;
}