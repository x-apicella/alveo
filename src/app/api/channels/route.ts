import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getMemberServer } from "@/lib/data";
import { handle } from "@/lib/api";

const body = z.object({
  serverId: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  kind: z.enum(["text", "voice"]),
});

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { serverId, name, kind } = body.parse(await req.json());
  await getMemberServer(serverId, user.id);
  const [channel] = await db
    .insert(schema.channels)
    .values({ serverId, name, kind })
    .returning();
  return NextResponse.json({ channel }, { status: 201 });
});
