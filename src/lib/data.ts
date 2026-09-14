import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { HttpError } from "./api";
import type { Channel, Server } from "@/db/schema";

export async function listServersForUser(userId: string): Promise<Server[]> {
  const rows = await db
    .select({ server: schema.servers })
    .from(schema.memberships)
    .innerJoin(schema.servers, eq(schema.servers.id, schema.memberships.serverId))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(asc(schema.servers.createdAt));
  return rows.map((r) => r.server);
}

export async function isMember(serverId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.serverId, serverId), eq(schema.memberships.userId, userId)))
    .limit(1);
  return !!row;
}

/** Server the user belongs to, or a 404. Membership is the only permission model in v1. */
export async function getMemberServer(serverId: string, userId: string): Promise<Server> {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!server || !(await isMember(serverId, userId))) {
    throw new HttpError(404, "Server not found");
  }
  return server;
}

export async function getMemberChannel(channelId: string, userId: string): Promise<Channel> {
  const [channel] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, channelId))
    .limit(1);
  if (!channel || !(await isMember(channel.serverId, userId))) {
    throw new HttpError(404, "Channel not found");
  }
  return channel;
}

export async function listChannels(serverId: string): Promise<Channel[]> {
  return db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.serverId, serverId))
    .orderBy(asc(schema.channels.createdAt));
}

export async function createServer(name: string, ownerId: string): Promise<Server> {
  return db.transaction(async (tx) => {
    const inviteCode = crypto.randomUUID().replaceAll("-", "");
    const [server] = await tx
      .insert(schema.servers)
      .values({ name, ownerId, inviteCode })
      .returning();
    await tx.insert(schema.memberships).values({ serverId: server.id, userId: ownerId });
    await tx.insert(schema.channels).values([
      { serverId: server.id, name: "general", kind: "text" },
      { serverId: server.id, name: "Table", kind: "voice" },
    ]);
    await tx.insert(schema.invites).values({ serverId: server.id, code: inviteCode,
      expiresAt: sql`clock_timestamp() + interval '7 days'`, maxUses: 25 });
    return server;
  });
}

export async function joinByInvite(code: string, userId: string): Promise<Server> {
  return db.transaction(async (tx) => {
    // Serialize redemption and revocation across application instances.
    const [invite] = await tx.select().from(schema.invites)
      .where(eq(schema.invites.code, code)).for("update");
    if (!invite) throw new HttpError(404, "Invite is invalid or no longer available");
    const [valid] = await tx.select({ id: schema.invites.id }).from(schema.invites).where(and(
      eq(schema.invites.id, invite.id),
      sql`${schema.invites.revokedAt} IS NULL AND ${schema.invites.expiresAt} > clock_timestamp()`,
    ));
    if (!valid) throw new HttpError(404, "Invite is invalid or no longer available");
    const joined = await tx.insert(schema.memberships)
      .values({ serverId: invite.serverId, userId }).onConflictDoNothing().returning();
    if (joined.length) {
      if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
        throw new HttpError(404, "Invite is invalid or no longer available");
      }
      await tx.update(schema.invites).set({ uses: invite.uses + 1 }).where(eq(schema.invites.id, invite.id));
    }
    const [server] = await tx.select().from(schema.servers).where(eq(schema.servers.id, invite.serverId));
    return server;
  });
}

export interface MessageView {
  id: string;
  sequence: string;
  content: string;
  createdAt: string;
  author: { id: string; username: string; avatarUrl: string | null };
}

export async function listMessagePage(channelId: string, options: { cursor?: string; before?: string; after?: string } = {}) {
  const forward = options.cursor !== undefined || options.after !== undefined;
  const limit = forward ? 200 : 50;
  const boundary = options.cursor !== undefined ? gt(schema.messages.sequence, BigInt(options.cursor))
    : options.before !== undefined ? lt(schema.messages.sequence, BigInt(options.before))
    : options.after !== undefined ? gt(schema.messages.createdAt, new Date(options.after)) : undefined;
  const base = db
    .select({
      id: schema.messages.id,
      sequence: sql<string>`${schema.messages.sequence}::text`,
      content: schema.messages.content,
      createdAt: schema.messages.createdAt,
      author: {
        id: schema.users.id,
        username: schema.users.username,
        avatarUrl: schema.users.avatarUrl,
      },
    })
    .from(schema.messages)
    .innerJoin(schema.users, eq(schema.users.id, schema.messages.authorId));

  const rows = await base.where(and(eq(schema.messages.channelId, channelId), boundary))
    .orderBy(forward ? asc(schema.messages.sequence) : desc(schema.messages.sequence)).limit(limit + 1);
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  if (!forward) selected.reverse();
  const messages = selected.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  return { messages, hasMore, nextCursor: (forward ? messages.at(-1) : messages[0])?.sequence ?? null };
}

export async function listMessages(channelId: string): Promise<MessageView[]> {
  return (await listMessagePage(channelId)).messages;
}
