import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { getNeonAuth } from "@/lib/neon-auth";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  if (req.headers.get("origin") && req.headers.get("origin") !== origin) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const auth = getNeonAuth();
  if (auth) {
    const result = await auth.signOut();
    if (result.error) return NextResponse.json({ error: "Could not sign out. Please retry." }, { status: 503 });
  }
  await clearSession();
  return NextResponse.redirect(new URL("/login", new URL(req.url).origin), { status: 303 });
}
