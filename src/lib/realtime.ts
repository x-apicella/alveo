import postgres from "postgres";
import { requireEnv } from "./env";
import { directDatabaseUrl } from "./database-url";

/**
 * Lightweight pub/sub over Postgres LISTEN/NOTIFY. Every message insert
 * publishes to the `channel_events` topic, and the SSE route fans it out to
 * connected browsers. This keeps realtime chat inside the single Next.js
 * process with no extra service, and still works if you run several replicas.
 */
export const TOPIC = "channel_events";

export interface ChannelEvent {
  type: "message";
  channelId: string;
  messageId: string;
}

type Listener = (event: ChannelEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  publisher: ReturnType<typeof postgres>;
  ready: Promise<void>;
}

const g = globalThis as unknown as { alveoHub?: Hub };

function getHub(): Hub {
  if (g.alveoHub) return g.alveoHub;
  const url = requireEnv("ALVEO_DATABASE_URL");
  // A dedicated connection for LISTEN, separate from the query pool.
  const listenerConn = postgres(directDatabaseUrl(), { max: 1 });
  const publisher = postgres(url, { max: 2 });
  const listeners = new Set<Listener>();
  const ready = listenerConn
    .listen(TOPIC, (payload) => {
      let event: ChannelEvent;
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }
      for (const l of listeners) l(event);
    })
    .then(() => undefined);
  g.alveoHub = { listeners, publisher, ready };
  return g.alveoHub;
}

export async function publish(event: ChannelEvent) {
  const hub = getHub();
  await hub.publisher.notify(TOPIC, JSON.stringify(event));
}

export async function subscribe(listener: Listener): Promise<() => void> {
  const hub = getHub();
  await hub.ready;
  hub.listeners.add(listener);
  return () => hub.listeners.delete(listener);
}
