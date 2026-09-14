import React from 'react';
import { createRoot } from 'react-dom/client';
import { RoomEvent, ParticipantEvent, ConnectionState, LocalAudioTrack, LocalVideoTrack, LocalTrackPublication, Track } from 'livekit-client';
import { VoiceSessionProvider } from '../../src/components/VoiceSession';
import { VoiceRoom } from '../../src/components/VoiceRoom';
import { navigate, usePathname } from './call-navigation';

const rooms = [];
const captures = [];
let tokenRequests = 0;
let delayToken = false;
let finishToken;
const audioContext = new AudioContext();
const oscillator = audioContext.createOscillator();
const destination = audioContext.createMediaStreamDestination();
oscillator.connect(destination);
oscillator.start();
const canvas = document.createElement('canvas');
canvas.width = 320; canvas.height = 180;
canvas.getContext('2d').fillRect(0, 0, 320, 180);
const video = canvas.captureStream(1).getVideoTracks()[0];
window.fetch = async () => {
  tokenRequests++;
  if (delayToken) await new Promise(resolve => { finishToken = resolve; });
  return Response.json({ token: `fresh-${tokenRequests}`, url: 'ws://fixture' });
};
// Only signaling and capture entry points are replaced. React context, SDK
// tracks/publications, source cleanup and all user controls are production code.
window.mockCallConnect = async room => {
  rooms.push(room);
  room.localParticipant.identity = 'fixture-user';
  room.localParticipant.name = 'You';
  room.localParticipant.publishTrack = async (media, options) => {
    const track = media.kind === 'audio' ? new LocalAudioTrack(media, undefined, true) : new LocalVideoTrack(media, undefined, true);
    track.source = options.source;
    const pub = new LocalTrackPublication(media.kind, { sid: media.id, name: options.name }, track);
    pub.source = options.source;
    room.localParticipant.trackPublications.set(pub.trackSid, pub);
    room.localParticipant.emit(ParticipantEvent.LocalTrackPublished, pub);
    room.emit(RoomEvent.LocalTrackPublished, pub, room.localParticipant);
    return pub;
  };
  room.localParticipant.unpublishTrack = async track => {
    const pub = [...room.localParticipant.trackPublications.values()].find(item => item.track === track);
    track.stop();
    if (pub) {
      room.localParticipant.trackPublications.delete(pub.trackSid);
      room.localParticipant.emit(ParticipantEvent.LocalTrackUnpublished, pub);
      room.emit(RoomEvent.LocalTrackUnpublished, pub, room.localParticipant);
    }
  };
  const toggle = async (source, enabled) => {
    const pub = [...room.localParticipant.trackPublications.values()].find(item => item.source === source);
    if (enabled && !pub) {
      const media = source === Track.Source.Microphone ? destination.stream.getAudioTracks()[0].clone() : video.clone();
      captures.push(media);
      return room.localParticipant.publishTrack(media, { source, name: source });
    }
    if (!enabled && pub) await room.localParticipant.unpublishTrack(pub.track);
    return pub;
  };
  room.localParticipant.setMicrophoneEnabled = enabled => toggle(Track.Source.Microphone, enabled);
  room.localParticipant.setCameraEnabled = enabled => toggle(Track.Source.Camera, enabled);
  room.state = ConnectionState.Connected;
  room.emit(RoomEvent.ConnectionStateChanged, room.state);
  room.emit(RoomEvent.Connected);
};
window.mockCallDisconnect = async room => {
  for (const pub of room.localParticipant.trackPublications.values()) pub.track?.stop();
  room.localParticipant.trackPublications.clear();
  room.state = ConnectionState.Disconnected;
  room.emit(RoomEvent.ConnectionStateChanged, room.state);
  room.emit(RoomEvent.Disconnected);
};
Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: async () => {
  const tracks = [video.clone(), destination.stream.getAudioTracks()[0].clone()];
  captures.push(...tracks);
  return new MediaStream(tracks);
} });

function App() {
  const path = usePathname();
  return <VoiceSessionProvider><nav>
    <button onClick={() => navigate('/s/server/c/voice')}>Voice page</button>
    <button onClick={() => navigate('/s/server/c/text')}>Text page</button>
    <button onClick={() => navigate('/s/other/c/other')}>Other server</button>
    <button onClick={() => navigate('/login')}>Log out</button>
  </nav>{path.endsWith('/text') ? <input aria-label="Chat draft" /> : path === '/login' ? <p>Login page</p> :
    <VoiceRoom key={path} channel={{ id: path.endsWith('/other') ? 'other' : 'voice', name: path.endsWith('/other') ? 'Other room' : 'Table', serverId: 'server', kind: 'voice' }} />}
  </VoiceSessionProvider>;
}
window.fixture = {
  unplug() { rooms.at(-1).getActiveDevice = () => 'unplugged-device'; navigator.mediaDevices.dispatchEvent(new Event('devicechange')); },
  delay() { delayToken = true; },
  resolve() { delayToken = false; finishToken?.(); },
  reconnect() {
    const room = rooms.at(-1);
    room.state = ConnectionState.Reconnecting; room.emit(RoomEvent.Reconnecting); room.emit(RoomEvent.ConnectionStateChanged, room.state);
    room.state = ConnectionState.Connected; room.emit(RoomEvent.Reconnected); room.emit(RoomEvent.ConnectionStateChanged, room.state);
  },
  snapshot() { return { tokenRequests, rooms: rooms.length, live: captures.filter(track => track.readyState === 'live').length,
    microphone: rooms.at(-1)?.localParticipant.isMicrophoneEnabled,
    sources: [...(rooms.at(-1)?.localParticipant.trackPublications.values() ?? [])].map(pub => pub.source) }; },
};
createRoot(document.getElementById('root')).render(<App />);
