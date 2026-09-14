export interface StreamStat {
  id: string; type: string; timestamp: number; isRemote?: boolean;
  bytesSent?: number; bytesReceived?: number; packetsReceived?: number; packetsLost?: number;
  framesEncoded?: number; framesDecoded?: number; framesDropped?: number;
  totalEncodeTime?: number; totalDecodeTime?: number; framesPerSecond?: number;
  frameWidth?: number; frameHeight?: number; jitter?: number; roundTripTime?: number;
  qualityLimitationReason?: string; codecId?: string; mimeType?: string;
}
interface Counters { ids: string; timestamp: number; bytes?: number; frames?: number; processing?: number }
const sum = (rows: StreamStat[], key: keyof StreamStat) => {
  const values = rows.map(row => row[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
};
const max = (rows: StreamStat[], key: keyof StreamStat) => {
  const values = rows.map(row => row[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.max(...values) : undefined;
};

/** Counter deltas are valid only for the same RTP streams and increasing time. */
export function summarizeStreamStats(reports: StreamStat[], local: boolean, previous?: Counters) {
  const rows = reports.filter(row => row.type === (local ? "outbound-rtp" : "inbound-rtp") && !row.isRemote);
  if (!rows.length) return null;
  const sample: Counters = {
    ids: rows.map(row => row.id).sort().join(","), timestamp: max(rows, "timestamp")!,
    bytes: sum(rows, local ? "bytesSent" : "bytesReceived"),
    frames: sum(rows, local ? "framesEncoded" : "framesDecoded"),
    processing: sum(rows, local ? "totalEncodeTime" : "totalDecodeTime"),
  };
  const comparable = previous && previous.ids === sample.ids && sample.timestamp > previous.timestamp;
  const bitrate = comparable && sample.bytes !== undefined && previous.bytes !== undefined && sample.bytes >= previous.bytes
    ? (sample.bytes - previous.bytes) * 8_000 / (sample.timestamp - previous.timestamp) : undefined;
  const processingMs = comparable && sample.frames !== undefined && previous.frames !== undefined && sample.frames > previous.frames &&
    sample.processing !== undefined && previous.processing !== undefined && sample.processing >= previous.processing
    ? (sample.processing - previous.processing) * 1000 / (sample.frames - previous.frames) : undefined;
  const codec = reports.find(report => report.type === "codec" && report.id === rows[0].codecId)?.mimeType;
  const limitations = [...new Set(rows.map(row => row.qualityLimitationReason).filter(reason => reason && reason !== "none"))];
  return {
    sample, bitrate, processingMs, codec,
    fps: max(rows, "framesPerSecond"), width: max(rows, "frameWidth"), height: max(rows, "frameHeight"),
    captureFps: max(reports.filter(report => report.type === "media-source"), "framesPerSecond"),
    dropped: sum(rows, "framesDropped"), packetsLost: sum(rows, "packetsLost"),
    jitterMs: max(rows, "jitter") === undefined ? undefined : max(rows, "jitter")! * 1000,
    rttMs: max(reports.filter(report => report.type === "remote-inbound-rtp"), "roundTripTime") === undefined ? undefined
      : max(reports.filter(report => report.type === "remote-inbound-rtp"), "roundTripTime")! * 1000,
    limitation: limitations.join(", ") || undefined,
  };
}
