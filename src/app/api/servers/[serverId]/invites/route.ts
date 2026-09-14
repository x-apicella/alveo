import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getMemberServer } from "@/lib/data";
import { handle, HttpError } from "@/lib/api";

async function owner(serverId: string) {
  const user = await requireUser();
  z.uuid().parse(serverId);
  const server = await getMemberServer(serverId, user.id);
  if (server.ownerId !== user.id) throw new HttpError(403, "Only the server owner can manage invites");
}

export const GET = handle<RouteContext<"/api/servers/[serverId]/invites">>(async (req, ctx) => {
  const { serverId } = await ctx.params;
  await owner(serverId);
  const offset = z.coerce.number().int().min(0).max(1000000).parse(new URL(req.url).searchParams.get("offset") ?? 0);
  const invites = await db.select().from(schema.invites).where(eq(schema.invites.serverId, serverId))
    .orderBy(desc(schema.invites.createdAt), desc(schema.invites.id)).limit(101).offset(offset);
  return NextResponse.json({ invites: invites.slice(0, 100), hasMore: invites.length > 100 });
});

export const POST = handle<RouteContext<"/api/servers/[serverId]/invites">>(async (req, ctx) => {
  const { serverId } = await ctx.params;
  await owner(serverId);
  const { expiresInHours, maxUses } = z.object({
    expiresInHours: z.number().int().min(1).max(168),
    maxUses: z.number().int().min(1).max(100),
  }).parse(await req.json());
  const [invite] = await db.insert(schema.invites).values({
    serverId, code: crypto.randomUUID().replaceAll("-", ""), maxUses,
    expiresAt: sql`clock_timestamp() + ${expiresInHours} * interval '1 hour'`,
  }).returning();
  return NextResponse.json({ invite }, { status: 201 });
});

export const DELETE = handle<RouteContext<"/api/servers/[serverId]/invites">>(async (req, ctx) => {
  const { serverId } = await ctx.params;
  await owner(serverId);
  const { inviteId } = z.object({ inviteId: z.uuid() }).parse(await req.json());
  const [invite] = await db.update(schema.invites)
    .set({ revokedAt: sql`coalesce(${schema.invites.revokedAt}, clock_timestamp())` })
    .where(and(eq(schema.invites.serverId, serverId), eq(schema.invites.id, inviteId))).returning();
  if (!invite) throw new HttpError(404, "Invite not found");
  return NextResponse.json({ invite });
});
