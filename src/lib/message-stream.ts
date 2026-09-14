/** Resumable, bounded SSE delivery. NOTIFY only wakes the database-backed cursor. */
export function createMessageStream<T extends { sequence: string }>(options: {
  cursor: string;
  signal: AbortSignal;
  read: (cursor: string) => Promise<{ messages: T[]; hasMore: boolean }>;
  subscribe: (wake: () => void) => Promise<() => void>;
  pollMs?: number;
}) {
  const encoder = new TextEncoder();
  let cursor = options.cursor;
  let stopped = false;
  let running = false;
  let dirty = true;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    unsubscribe?.();
    options.signal.removeEventListener("abort", abort);
  };
  const abort = () => { stop(); controller.close(); };
  const flush = async () => {
    if (running || stopped || !dirty || (controller.desiredSize ?? 0) <= 0) return;
    running = true;
    try {
      while (dirty && !stopped && (controller.desiredSize ?? 0) > 0) {
        dirty = false;
        const page = await options.read(cursor);
        if (stopped) return;
        if (page.messages.length) {
          const next = page.messages.at(-1)!.sequence;
          controller.enqueue(encoder.encode(`id: ${next}\ndata: ${JSON.stringify({ messages: page.messages })}\n\n`));
          cursor = next;
        }
        dirty ||= page.hasMore;
      }
    } catch {
      stop();
      controller.error(new Error("Chat stream interrupted"));
    } finally { running = false; }
  };
  const wake = () => { dirty = true; void flush(); };
  return new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      if (options.signal.aborted) { abort(); return; }
      options.signal.addEventListener("abort", abort, { once: true });
      controller.enqueue(encoder.encode(": connected\nretry: 2000\n\n"));
      timer = setInterval(() => {
        if (!stopped && (controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(": ping\n\n"));
        wake();
      }, options.pollMs ?? 5_000);
      void options.subscribe(wake).then(remove => {
        if (stopped) remove();
        else { unsubscribe = remove; wake(); }
      }).catch(() => { /* Periodic database replay remains available. */ });
    },
    pull() { return flush(); },
    cancel() { stop(); },
  });
}
