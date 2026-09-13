import { sql } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`SELECT 1 FROM users LIMIT 1`.simple().execute();
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
