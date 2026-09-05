import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getMemberChannel, listMessages } from "@/lib/data";
import { handle, HttpError } from "@/lib/api";
import { publish } from "@/lib/realtime";

type Ctx = RouteContext<"/api/channels/[channelId]/messages">;

/** GET ?after=<iso> returns messages newer than that timestamp; the client polls this. */
export const GET = handle<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { channelId } = await ctx.params;
  await getMemberChannel(channelId, user.id);
  const after = new URL(req.url).searchParams.get("after") ?? undefined;
  return NextResponse.json({ messages: await listMessages(channelId, after) });
});

const body = z.object({ content: z.string().trim().min(1).max(4000) });

export const POST = handle<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { channelId } = await ctx.params;
  const channel = await getMemberChannel(channelId, user.id);
  if (channel.kind !== "text") throw new HttpError(400, "Not a text channel");
  const { content } = body.parse(await req.json());
  const [message] = await db
    .insert(schema.messages)
    .values({ channelId, authorId: user.id, content })
    .returning();
  await publish({ type: "message", channelId, messageId: message.id });
  return NextResponse.json({ message }, { status: 201 });
});
