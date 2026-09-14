import React from 'react';
import { createRoot } from 'react-dom/client';
import { RemoteAudioTrack, RemoteVideoTrack, RemoteParticipant, RemoteTrackPublication, Room, RoomEvent, Track } from 'livekit-client';
import { RoomContext } from '@livekit/components-react';
import { SourceViewer } from '../../src/components/SourceViewer';
import { shareTrackName } from '../../src/lib/source-viewing';

let tracks = [];
let revision = 0;
const root = createRoot(document.getElementById('root'));
const room = new Room();
const remote = new RemoteParticipant(undefined, 'remote-sid', 'remote', 'Friend');
room.remoteParticipants.set('remote', remote);
const context = new AudioContext();
const oscillator = context.createOscillator();
const destination = context.createMediaStreamDestination();
oscillator.connect(destination);
oscillator.start();
const canvas = document.createElement('canvas');
canvas.width = 320;
canvas.height = 180;
canvas.getContext('2d').fillRect(0, 0, 320, 180);
const videoStream = canvas.captureStream(1);

// Inject synthetic media into real SDK publications. Signaling/network is the
// only missing layer; useTracks, track attachment and volume are production code.
window.fixture = {
  deafen(value) { root.render(<RoomContext.Provider value={room}><SourceViewer deafened={value} /></RoomContext.Provider>); },
  publish() {
    revision++;
    tracks = [];
    remote.trackPublications.clear();
    room.localParticipant.trackPublications.clear();
    for (const [id, kinds, local] of [['Game', ['video', 'audio'], false], ['Music', ['audio'], false], ['Second game', ['video', 'audio'], false], ['Own audio', ['audio'], true], ['Microphone', ['audio'], false]]) {
      for (const kind of kinds) {
        const pub = new RemoteTrackPublication(kind, { sid: `${id}-${kind}-${revision}`, name: shareTrackName(id, id, kind) }, false);
        pub.source = id === 'Microphone' ? Track.Source.Microphone : kind === 'video' ? Track.Source.ScreenShare : Track.Source.ScreenShareAudio;
        const media = kind === 'audio'
          ? new RemoteAudioTrack(destination.stream.getAudioTracks()[0].clone(), pub.trackSid, undefined)
          : new RemoteVideoTrack(videoStream.getVideoTracks()[0].clone(), pub.trackSid, undefined);
        media.source = pub.source;
        pub.setTrack(media);
        const participant = local ? room.localParticipant : remote;
        participant.trackPublications.set(pub.trackSid, pub);
        tracks.push({ participant, publication: pub, source: pub.source });
      }
    }
    room.emit(RoomEvent.Reconnected);
  },
  stop() {
    for (const ref of tracks) ref.publication.track?.mediaStreamTrack.stop();
    remote.trackPublications.clear();
    room.localParticipant.trackPublications.clear();
    room.emit(RoomEvent.Reconnected);
  },
  desired() { return Object.fromEntries(tracks.map(ref => [ref.publication.trackSid, ref.publication.isDesired])); },
};
root.render(<RoomContext.Provider value={room}><SourceViewer /></RoomContext.Provider>);
