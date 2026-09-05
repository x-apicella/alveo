import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function POST(req: Request) {
  await clearSession();
  return NextResponse.redirect(new URL("/login", new URL(req.url).origin), { status: 303 });
}
