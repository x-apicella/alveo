import { requireUser } from "@/lib/auth";
import { getMemberChannel, listMessages } from "@/lib/data";
import { handle } from "@/lib/api";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of new messages for a channel. Each event carries
 * the full message rows created since the last one the client saw.
 */
export const GET = handle<RouteContext<"/api/channels/[channelId]/events">>(async (req, ctx) => {
  const user = await requireUser();
  const { channelId } = await ctx.params;
  await getMemberChannel(channelId, user.id);

  let cursor = new URL(req.url).searchParams.get("after") ?? new Date().toISOString();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let flushing = Promise.resolve();
      const flush = () => {
        flushing = flushing.then(async () => {
          const messages = await listMessages(channelId, cursor);
          if (messages.length === 0) return;
          cursor = messages[messages.length - 1].createdAt;
          send({ messages });
        });
      };

      const unsubscribe = await subscribe((event) => {
        if (event.channelId === channelId) flush();
      });
      // Catch anything posted between the initial page load and the subscription.
      flush();

      const keepalive = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 25_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
