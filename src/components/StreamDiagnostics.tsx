"use client";

import { useEffect, useState } from "react";
import type { TrackReference } from "@livekit/components-react";
import { groupSources } from "@/lib/source-viewing";
import { summarizeStreamStats, type StreamStat } from "@/lib/stream-stats";

type Summary = NonNullable<ReturnType<typeof summarizeStreamStats>>;
const number = (value: number | undefined, unit: string) => value === undefined ? "Unavailable" : `${Math.round(value * 10) / 10} ${unit}`;

export function StreamDiagnostics({ tracks }: { tracks: TrackReference[] }) {
  const [open, setOpen] = useState(false);
  return <div className="mb-4 rounded-lg border border-white/10 p-3">
    <button type="button" aria-expanded={open} className="text-sm" onClick={() => setOpen(value => !value)}>Stream diagnostics</button>
    {open && <Measurements tracks={tracks} />}
  </div>;
}

function Measurements({ tracks }: { tracks: TrackReference[] }) {
  const [results, setResults] = useState<Record<string, Summary | null>>({});
  useEffect(() => {
    let cancelled = false;
    let running = false;
    const previous = new Map<string, Summary["sample"]>();
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const samples = await Promise.all(tracks.map(async ref => {
          const id = ref.publication.trackSid;
          try {
            const report = await ref.publication.track?.getRTCStatsReport();
            const entries: StreamStat[] = [];
            report?.forEach(entry => entries.push(entry));
            const result = summarizeStreamStats(entries, ref.participant.isLocal, previous.get(id));
            if (result) previous.set(id, result.sample);
            return [id, result] as const;
          } catch { return [id, null] as const; }
        }));
        if (!cancelled) setResults(Object.fromEntries(samples));
      } finally { running = false; }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 2_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [tracks]);
  return <div className="mt-3 overflow-x-auto text-xs">
    <p className="mb-2 text-muted">Local browser measurements, sampled every two seconds. Unselected sources have no receive statistics. Nothing is uploaded or stored.</p>
    {tracks.length === 0 ? <p>No active tracks to measure.</p> : <table className="w-full text-left">
      <thead><tr>{["Source / direction", "Video / codec", "Traffic", "Network", "Encode / decode", "Browser limitation"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead>
      <tbody>{groupSources(tracks).flatMap(source => source.tracks.map(ref => {
        const sample = results[ref.publication.trackSid];
        return <tr key={ref.publication.trackSid} className="border-t border-white/10">
          <th className="p-2 font-normal">{source.owner} — {source.label} ({ref.publication.kind})<br />{source.local ? "Sending" : "Receiving"}</th>
          <td className="p-2">{sample?.width && sample.height ? `${sample.width}×${sample.height}` : "Unavailable"}<br />{number(sample?.fps, "fps")}<br />{sample?.codec ?? "Codec unavailable"}{source.local && <><br />Capture: {number(sample?.captureFps, "fps")}</>}</td>
          <td className="p-2">{number(sample?.bitrate === undefined ? undefined : sample.bitrate / 1_000_000, "Mb/s")}</td>
          <td className="p-2">{source.local ? <>RTT: {number(sample?.rttMs, "ms")}</> : <>Jitter: {number(sample?.jitterMs, "ms")}<br />Lost: {number(sample?.packetsLost, "packets (total)")}</>}</td>
          <td className="p-2">{number(sample?.processingMs, `ms/${source.local ? "encoded" : "decoded"} frame`)}{!source.local && <><br />Dropped: {number(sample?.dropped, "frames (total)")}</>}</td>
          <td className="p-2">{sample?.limitation ?? "None reported"}</td>
        </tr>;
      }))}</tbody>
    </table>}
    <p className="mt-2 text-muted">CPU/bandwidth limitation is reported by the encoder. Capture FPS, network RTT/jitter and decoder time describe different stages; these do not measure end-to-end latency or A/V sync.</p>
  </div>;
}
