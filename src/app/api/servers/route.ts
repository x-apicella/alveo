import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServer, listServersForUser } from "@/lib/data";
import { handle } from "@/lib/api";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ servers: await listServersForUser(user.id) });
});

const createBody = z.object({ name: z.string().trim().min(1).max(64) });

export const POST = handle(async (req) => {
  const user = await requireUser();
  const { name } = createBody.parse(await req.json());
  const server = await createServer(name, user.id);
  return NextResponse.json({ server }, { status: 201 });
});
