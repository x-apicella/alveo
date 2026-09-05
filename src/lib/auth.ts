import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireEnv } from "./env";
import type { User } from "@/db/schema";

const SESSION_COOKIE = "alveo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const sessionKey = () => new TextEncoder().encode(requireEnv("SESSION_SECRET"));

/**
 * Identity handed to Alveo by an external identity provider. For the D&D app
 * this comes from a short-lived HS256 JWT signed with DND_AUTH_SHARED_SECRET
 * carrying `sub`, `name` and optionally `picture`.
 */
export interface ExternalIdentity {
  externalId: string;
  username: string;
  avatarUrl?: string | null;
}

/** Verify a single-sign-on token minted by the D&D app. */
export async function verifyExternalToken(token: string): Promise<ExternalIdentity> {
  const key = new TextEncoder().encode(requireEnv("DND_AUTH_SHARED_SECRET"));
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    issuer: process.env.DND_AUTH_ISSUER || undefined,
    audience: "alveo",
  });
  if (!payload.sub || typeof payload.name !== "string") {
    throw new Error("SSO token is missing sub or name");
  }
  return {
    externalId: payload.sub,
    username: payload.name,
    avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/** Find or create the local user row for an external identity. */
export async function upsertUser(identity: ExternalIdentity): Promise<User> {
  const [user] = await db
    .insert(schema.users)
    .values({
      externalId: identity.externalId,
      username: identity.username,
      avatarUrl: identity.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: schema.users.externalId,
      set: { username: identity.username, avatarUrl: identity.avatarUrl ?? null },
    })
    .returning();
  return user;
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionKey());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the signed-in user, or null. Never throws on a bad cookie. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
