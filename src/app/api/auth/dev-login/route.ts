import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, upsertUser } from "@/lib/auth";
import { isDevLoginAllowed } from "@/lib/env";
import { handle } from "@/lib/api";

const body = z.object({ username: z.string().trim().min(2).max(32) });

/** Local-development login that skips the D&D app. Disabled in production. */
export const POST = handle(async (req) => {
  if (!isDevLoginAllowed()) {
    return NextResponse.json({ error: "Dev login is disabled" }, { status: 403 });
  }
  const { username } = body.parse(await req.json());
  const user = await upsertUser({ externalId: `dev:${username.toLowerCase()}`, username });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
});
