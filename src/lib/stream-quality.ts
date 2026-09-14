export const STREAM_PRESETS = {
  low: { label: "Low · 480p15", width: 854, height: 480, fps: 15, bitrate: 800_000 },
  balanced: { label: "Balanced · 720p30", width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
  motion: { label: "Motion · 1080p60 (experimental)", width: 1920, height: 1080, fps: 60, bitrate: 6_000_000 },
} as const;
export type StreamQuality = keyof typeof STREAM_PRESETS;

/** Bound capture before publication; unsupported constraints fall back downward. */
export async function configureShareVideo(track: Pick<MediaStreamTrack, "applyConstraints" | "getSettings">, requested: StreamQuality) {
  const order: StreamQuality[] = requested === "motion" ? ["motion", "balanced", "low"] : requested === "balanced" ? ["balanced", "low"] : ["low"];
  for (const quality of order) {
    const preset = STREAM_PRESETS[quality];
    try {
      await track.applyConstraints({ width: { ideal: preset.width, max: preset.width },
        height: { ideal: preset.height, max: preset.height }, frameRate: { ideal: preset.fps, max: preset.fps } });
      return { quality, settings: track.getSettings(), encoding: { maxBitrate: preset.bitrate, maxFramerate: preset.fps } };
    } catch (error) {
      // Permission loss/source exit needs explicit retry, not a quality downgrade.
      if (typeof error !== "object" || error === null || !("name" in error) || error.name !== "OverconstrainedError" || quality === "low") throw error;
    }
  }
  throw new Error("No supported capture preset");
}
