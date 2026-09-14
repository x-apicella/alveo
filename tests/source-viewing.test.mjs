import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreference, groupSources, shareTrackName, wantsTrack } from '../src/lib/source-viewing.ts';

function ref(owner, id, kind, label = 'Game', sid = `${id}-${kind}`) {
  return { participant: { identity: owner, isLocal: false }, publication: {
    trackSid: sid, trackName: shareTrackName(id, label, kind), kind,
    source: kind === 'video' ? 'screen_share' : 'screen_share_audio',
  } };
}

test('late join pairs multiple same-type sources independently of publication order and owner', () => {
  const sources = groupSources([ref('a', '2', 'audio'), ref('b', '1', 'video'),
    ref('a', '1', 'video'), ref('a', '2', 'video'), ref('a', '1', 'audio')]);
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.map(source => source.tracks.length), [2, 1, 2]);
});

test('audio-only sources stay visible; stop removes only that source', () => {
  const audio = ref('a', 'music', 'audio');
  assert.equal(groupSources([audio])[0].tracks[0].publication.kind, 'audio');
  assert.deepEqual(groupSources([]), []);
});

test('republication and changed labels preserve a source preference key', () => {
  const before = groupSources([ref('a', '1', 'video')])[0];
  const after = groupSources([ref('a', '1', 'video', 'Renamed', 'new-sid')])[0];
  assert.equal(before.key, after.key);
  assert.equal(after.label, 'Renamed');
  assert.notEqual(after.key, groupSources([ref('a', '2', 'video')])[0].key);
});

test('legacy share names pair while unknown or malformed names stay separate', () => {
  const video = ref('a', '1', 'video');
  const audio = ref('a', '1', 'audio');
  video.publication.trackName = 'share-1';
  audio.publication.trackName = 'share-1-audio';
  assert.equal(groupSources([video, audio]).length, 1);
  video.publication.trackName = '{bad json';
  audio.publication.trackName = '{bad json';
  assert.equal(groupSources([video, audio]).length, 2);
});

test('only voices default on; mute and zero volume suppress audio without stopping video', () => {
  assert.equal(wantsTrack('audio', defaultPreference(true)), true);
  assert.equal(wantsTrack('video', defaultPreference(false)), false);
  const selected = { selected: true, muted: true, volume: 0.5 };
  assert.equal(wantsTrack('video', selected), true);
  assert.equal(wantsTrack('audio', selected), false);
  assert.equal(wantsTrack('audio', { ...selected, muted: false, volume: 0 }), false);
  assert.equal(wantsTrack('audio', { ...selected, muted: false }), true);
  assert.equal(wantsTrack('video', { ...selected, selected: false }), false);
});
