import { NextResponse } from "next/server";
import { z } from "zod";
import { AccessToken } from "livekit-server-sdk";
import { requireUser } from "@/lib/auth";
import { getMemberChannel } from "@/lib/data";
import { handle, HttpError } from "@/lib/api";
import { requireEnv } from "@/lib/env";

const body = z.object({ channelId: z.string().uuid() });

/**
 * Mint a LiveKit room token for a voice channel. The room name is the channel
 * id, and the participant identity is the Alveo user id. The grant allows
 * publishing any number of tracks, which is what enables multi-source sharing.
 */
export const POST = handle(async (req) => {
  const user = await requireUser();
  const { channelId } = body.parse(await req.json());
  const channel = await getMemberChannel(channelId, user.id);
  if (channel.kind !== "voice") throw new HttpError(400, "Not a voice channel");
  if (!["LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "NEXT_PUBLIC_LIVEKIT_URL"].every((name) => process.env[name])) {
    throw new HttpError(503, "Voice service is not configured yet");
  }

  const at = new AccessToken(requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"), {
    identity: user.id,
    name: user.username,
    ttl: "6h",
  });
  at.addGrant({
    room: channel.id,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({
    token: await at.toJwt(),
    url: requireEnv("NEXT_PUBLIC_LIVEKIT_URL"),
  });
});
