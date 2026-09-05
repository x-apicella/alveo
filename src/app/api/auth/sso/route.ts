import { NextResponse } from "next/server";
import { createSession, upsertUser, verifyExternalToken } from "@/lib/auth";

/**
 * Single sign-on entry point for the D&D app.
 * The D&D app redirects the browser here with a short-lived signed token:
 *   GET /api/auth/sso?token=<jwt>&next=/s/<serverId>
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const next = url.searchParams.get("next") || "/";
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  try {
    const identity = await verifyExternalToken(token);
    const user = await upsertUser(identity);
    await createSession(user.id);
  } catch (err) {
    console.error("SSO failed", err);
    return NextResponse.redirect(new URL("/login?error=sso", url.origin));
  }
  // Only allow same-origin relative redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
