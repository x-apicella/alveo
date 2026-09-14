import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getMemberChannel, listMessagePage } from "@/lib/data";
import { parseMessageCursor } from "@/lib/message-cursor";
import { and, eq } from "drizzle-orm";
import { handle, HttpError } from "@/lib/api";
import { publish } from "@/lib/realtime";

type Ctx = RouteContext<"/api/channels/[channelId]/messages">;

/** Sequence cursors support complete forward replay and older-history pagination. */
export const GET = handle<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { channelId } = await ctx.params;
  await getMemberChannel(channelId, user.id);
  const params = new URL(req.url).searchParams;
  const options = { cursor: params.get("cursor") ?? undefined, before: params.get("before") ?? undefined, after: params.get("after") ?? undefined };
  if (Object.values(options).filter(value => value !== undefined).length > 1) throw new HttpError(400, "Use one message cursor");
  try {
    if (options.cursor !== undefined) parseMessageCursor(options.cursor);
    if (options.before !== undefined) parseMessageCursor(options.before);
    if (options.after !== undefined && !z.iso.datetime({ offset: true }).safeParse(options.after).success) throw new Error();
  } catch { throw new HttpError(400, "Invalid message cursor"); }
  return NextResponse.json(await listMessagePage(channelId, options));
});

const body = z.object({ content: z.string().trim().min(1).max(4000), clientId: z.uuid().optional() });

export const POST = handle<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { channelId } = await ctx.params;
  const channel = await getMemberChannel(channelId, user.id);
  if (channel.kind !== "text") throw new HttpError(400, "Not a text channel");
  const { content, clientId } = body.parse(await req.json());
  const [message] = await db
    .insert(schema.messages)
    .values({ channelId, authorId: user.id, content, clientId })
    .onConflictDoNothing({ target: [schema.messages.authorId, schema.messages.clientId] })
    .returning();
  let result = message;
  if (!result && clientId) {
    [result] = await db.select().from(schema.messages)
      .where(and(eq(schema.messages.authorId, user.id), eq(schema.messages.clientId, clientId))).limit(1);
    if (!result || result.channelId !== channelId || result.content !== content) throw new HttpError(409, "Retry ID already used for a different message");
  }
  // NOTIFY is a latency hint. A committed send succeeds even when the listener
  // connection is unavailable; SSE's periodic database catch-up finds it.
  void publish({ type: "message", channelId, messageId: result.id }).catch(() => {});
  return NextResponse.json({ message: { ...result, sequence: result.sequence.toString(),
    author: { id: user.id, username: user.username, avatarUrl: user.avatarUrl },
  } }, { status: message ? 201 : 200 });
});
