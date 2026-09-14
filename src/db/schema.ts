import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
  bigserial,
} from "drizzle-orm/pg-core";

export const channelKind = pgEnum("channel_kind", ["text", "voice"]);

/**
 * Users are created on first sign-in. `externalId` is the stable subject id
 * from the D&D app's auth (the JWT `sub` claim) so accounts line up across
 * both platforms.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull().unique(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serverId, t.userId] })],
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: channelKind("kind").notNull().default("text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("channels_server_idx").on(t.serverId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    sequence: bigserial("sequence", { mode: "bigint" }).notNull(),
    clientId: uuid("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_channel_created_idx").on(t.channelId, t.createdAt),
    uniqueIndex("messages_channel_sequence_idx").on(t.channelId, t.sequence),
    uniqueIndex("messages_author_client_idx").on(t.authorId, t.clientId),
  ],
);

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;
