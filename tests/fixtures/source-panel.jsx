import React from 'react';
import { createRoot } from 'react-dom/client';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import { RoomContext } from '@livekit/components-react';
import { SourcePanel } from '../../src/components/SourcePanel';

const room = new Room();
room.state = ConnectionState.Connected;
const streams = [];
const publications = new Map();
let pending;
let picker;
let failAudio = false;
let delayPublish = false;
let delayPicker = false;
let cancelled = false;
let noAudio = false;
let rejectMotion = false;
let delayConstraints = false;
let finishConstraints;
const context = new AudioContext();
const oscillator = context.createOscillator();
const destination = context.createMediaStreamDestination();
oscillator.connect(destination);
oscillator.start();
const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 180;
canvas.getContext('2d').fillRect(0, 0, 320, 180);
const video = canvas.captureStream(1).getVideoTracks()[0];
Object.defineProperty(navigator, 'mediaDevices', { value: {
  async getDisplayMedia(options) {
    if (cancelled) throw new DOMException('Cancelled', 'NotAllowedError');
    const stream = new MediaStream([video.clone(), ...(options.audio && !noAudio ? [destination.stream.getAudioTracks()[0].clone()] : [])]);
    const track = stream.getVideoTracks()[0];
    const apply = track.applyConstraints.bind(track);
    track.applyConstraints = async constraints => {
      if (delayConstraints) await new Promise(resolve => { finishConstraints = resolve; });
      if (rejectMotion && constraints.height.max === 1080) throw new DOMException('unsupported', 'OverconstrainedError');
      return apply(constraints);
    };
    streams.push(stream);
    if (delayPicker) await new Promise(resolve => { picker = resolve; });
    return stream;
  },
}, configurable: true });
room.localParticipant.publishTrack = async (track, options) => {
  if (track.kind === 'audio' && failAudio) throw new Error('Audio publish failed');
  if (delayPublish) await new Promise(resolve => { pending = resolve; });
  const pub = { track, options };
  publications.set(track.id, pub);
  return pub;
};
room.localParticipant.unpublishTrack = async track => { publications.delete(track.id); };
const root = createRoot(document.getElementById('root'));
window.fixture = {
  configure(options) {
    failAudio = options.failAudio ?? false;
    delayPublish = options.delayPublish ?? false;
    delayPicker = options.delayPicker ?? false;
    cancelled = options.cancelled ?? false;
    noAudio = options.noAudio ?? false;
    rejectMotion = options.rejectMotion ?? false;
    delayConstraints = options.delayConstraints ?? false;
  },
  resolvePublish() { delayPublish = false; pending?.(); },
  resolvePicker() { picker?.(); },
  resolveConstraints() { delayConstraints = false; finishConstraints?.(); },
  state(value) {
    room.state = value;
    room.emit(RoomEvent.ConnectionStateChanged, value);
    room.emit(value === 'disconnected' ? RoomEvent.Disconnected : value === 'reconnecting' ? RoomEvent.Reconnecting : RoomEvent.Reconnected);
  },
  stopCapture() { streams.at(-1).getTracks()[0].dispatchEvent(new Event('ended')); },
  unmount() { root.unmount(); },
  snapshot() { return {
    publications: [...publications.values()].map(pub => JSON.parse(pub.options.name)),
    encodings: [...publications.values()].filter(pub => pub.track.kind === 'video').map(pub => ({ codec: pub.options.videoCodec, ...pub.options.screenShareEncoding })),
    liveTracks: streams.flatMap(stream => stream.getTracks()).filter(track => track.readyState === 'live').length,
    captures: streams.length,
  }; },
};
root.render(<RoomContext.Provider value={room}><SourcePanel /></RoomContext.Provider>);
