import type { NextRequest } from "next/server";
import { getNeonAuth } from "@/lib/neon-auth";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = getNeonAuth();
  if (!auth) return Response.json({ error: "Not configured" }, { status: 404 });
  return auth.handler().GET(req, context);
}

export async function POST(req: NextRequest, context: Context) {
  const auth = getNeonAuth();
  if (!auth) return Response.json({ error: "Not configured" }, { status: 404 });
  return auth.handler().POST(req, context);
}
