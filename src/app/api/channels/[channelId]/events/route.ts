import { requireUser } from "@/lib/auth";
import { getMemberChannel, listMessagePage } from "@/lib/data";
import { handle, HttpError } from "@/lib/api";
import { subscribe } from "@/lib/realtime";
import { parseMessageCursor } from "@/lib/message-cursor";
import { createMessageStream } from "@/lib/message-stream";

export const dynamic = "force-dynamic";

export const GET = handle<RouteContext<"/api/channels/[channelId]/events">>(async (req, ctx) => {
  const user = await requireUser();
  const { channelId } = await ctx.params;
  await getMemberChannel(channelId, user.id);
  let cursor: string;
  try {
    cursor = parseMessageCursor(req.headers.get("Last-Event-ID") ?? new URL(req.url).searchParams.get("cursor") ?? "0");
  } catch { throw new HttpError(400, "Invalid message cursor"); }
  const stream = createMessageStream({
    cursor, signal: req.signal,
    read: async position => {
      // Do not retain access after membership removal.
      await getMemberChannel(channelId, user.id);
      return listMessagePage(channelId, { cursor: position });
    },
    subscribe: wake => subscribe(event => { if (event.channelId === channelId) wake(); }),
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive",
  } });
});
