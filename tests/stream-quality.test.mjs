import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureShareVideo } from '../src/lib/stream-quality.ts';
import { summarizeStreamStats } from '../src/lib/stream-stats.ts';

test('unsupported 1080p60 constraints fall back to bounded 720p30 encoding', async () => {
  const attempts = [];
  const result = await configureShareVideo({
    applyConstraints: async constraints => {
      attempts.push(constraints);
      if (constraints.height.max === 1080) throw new DOMException('unsupported', 'OverconstrainedError');
    }, getSettings: () => ({ width: 1280, height: 720, frameRate: 30 }),
  }, 'motion');
  assert.equal(result.quality, 'balanced');
  assert.deepEqual(result.encoding, { maxBitrate: 2500000, maxFramerate: 30 });
  assert.equal(attempts.length, 2);
});

test('permission loss is not disguised as a quality fallback', async () => {
  let attempts = 0;
  await assert.rejects(configureShareVideo({ applyConstraints: async () => {
    attempts++; throw new DOMException('ended', 'NotAllowedError');
  }, getSettings: () => ({}) }, 'motion'), { name: 'NotAllowedError' });
  assert.equal(attempts, 1);
});

test('stats sum simulcast traffic and distinguish encoder, network and capture measurements', () => {
  const reports = [
    { id: 'hi', type: 'outbound-rtp', timestamp: 1000, bytesSent: 1000, framesEncoded: 30, totalEncodeTime: 0.15, framesPerSecond: 30, codecId: 'codec', qualityLimitationReason: 'cpu' },
    { id: 'lo', type: 'outbound-rtp', timestamp: 1000, bytesSent: 100, framesEncoded: 15, totalEncodeTime: 0.15 },
    { id: 'codec', type: 'codec', timestamp: 1000, mimeType: 'video/VP8' },
    { id: 'capture', type: 'media-source', timestamp: 1000, framesPerSecond: 60 },
    { id: 'remote', type: 'remote-inbound-rtp', timestamp: 1000, roundTripTime: 0.05 },
  ];
  const first = summarizeStreamStats(reports, true);
  assert.equal(first.bitrate, undefined);
  const second = summarizeStreamStats(reports.map(report => ({ ...report, timestamp: 2000,
    ...(report.bytesSent === undefined ? {} : { bytesSent: report.bytesSent * 2, framesEncoded: report.framesEncoded * 2, totalEncodeTime: report.totalEncodeTime * 2 }),
  })), true, first.sample);
  assert.equal(second.bitrate, 8800);
  assert.equal(second.codec, 'video/VP8');
  assert.equal(second.captureFps, 60);
  assert.equal(second.rttMs, 50);
  assert.equal(second.limitation, 'cpu');
  assert.equal(Math.round(second.processingMs), 7);
});

test('receiver metrics leave unavailable values unknown and reset rates on republication', () => {
  const first = summarizeStreamStats([{ id: 'one', type: 'inbound-rtp', timestamp: 1000, bytesReceived: 500, jitter: 0.002, packetsLost: 3, framesDropped: 2 }], false);
  assert.equal(first.jitterMs, 2);
  assert.equal(first.packetsLost, 3);
  assert.equal(first.dropped, 2);
  assert.equal(first.processingMs, undefined);
  const next = summarizeStreamStats([{ id: 'two', type: 'inbound-rtp', timestamp: 2000, bytesReceived: 1 }], false, first.sample);
  assert.equal(next.bitrate, undefined);
  assert.equal(summarizeStreamStats([], false), null);
});
