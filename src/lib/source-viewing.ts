/** Versioned publication names pair a share's tracks without relying on track type or order. */
export function shareTrackName(id: string, label: string, kind: "audio" | "video") {
  return JSON.stringify({ alveo: 1, id, label: label.slice(0, 160), kind });
}

export interface PublicationRef {
  participant: { identity: string; name?: string; isLocal: boolean };
  publication: { trackSid: string; trackName: string; kind: string; source: string };
}

function describe(ref: PublicationRef) {
  const pub = ref.publication;
  const share = pub.source === "screen_share" || pub.source === "screen_share_audio";
  if (share) {
    try {
      const data = JSON.parse(pub.trackName);
      if (data?.alveo === 1 && typeof data.id === "string" && data.id.length > 0 &&
          typeof data.label === "string" && data.kind === pub.kind) {
        return { id: `share:${data.id}`, label: data.label || "Shared source" };
      }
    } catch { /* Older clients use plain publication names. */ }
    const legacy = /^share-(\d+)(-audio)?$/.exec(pub.trackName);
    if (legacy && Boolean(legacy[2]) === (pub.kind === "audio")) {
      return { id: `legacy:${legacy[1]}`, label: `Source ${legacy[1]}` };
    }
  }
  // Microphones/cameras have stable preference keys across republishing. Unknown
  // publications use their SID so unrelated same-type tracks never get combined.
  const standard = pub.source === "microphone" || pub.source === "camera";
  return {
    id: standard ? `${pub.source}:${pub.trackName}` : `track:${pub.trackSid}`,
    label: pub.source === "microphone" ? "Microphone" : pub.source === "camera" ? "Camera" : pub.trackName || "Shared source",
  };
}

export function groupSources<T extends PublicationRef>(refs: T[]) {
  const groups = new Map<string, { key: string; label: string; owner: string; local: boolean; voice: boolean; tracks: T[] }>();
  for (const ref of refs) {
    const info = describe(ref);
    const key = JSON.stringify([ref.participant.identity, info.id]);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: info.label, owner: ref.participant.name || ref.participant.identity,
        local: ref.participant.isLocal, voice: ref.publication.source === "microphone", tracks: [] };
      groups.set(key, group);
    }
    group.tracks.push(ref);
  }
  return [...groups.values()];
}

export interface ViewerPreference { selected: boolean; muted: boolean; volume: number }

export function defaultPreference(voice: boolean): ViewerPreference {
  return { selected: voice, muted: false, volume: 1 };
}

export function wantsTrack(kind: string, preference: ViewerPreference) {
  return preference.selected && (kind !== "audio" || (!preference.muted && preference.volume > 0));
}
