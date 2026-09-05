import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { joinByInvite } from "@/lib/data";
import { handle } from "@/lib/api";

export const POST = handle<RouteContext<"/api/invites/[code]">>(async (_req, ctx) => {
  const user = await requireUser();
  const { code } = await ctx.params;
  const server = await joinByInvite(code, user.id);
  return NextResponse.json({ server });
});
