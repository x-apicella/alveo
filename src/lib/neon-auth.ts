import { createNeonAuth } from "@neondatabase/auth/next/server";
import { requireEnv } from "./env";

let auth: ReturnType<typeof createNeonAuth> | undefined;

export function getNeonAuth() {
  if (!process.env.NEON_AUTH_URL) return null;
  return auth ??= createNeonAuth({
    baseUrl: requireEnv("NEON_AUTH_URL"),
    cookies: { secret: requireEnv("NEON_AUTH_COOKIE_SECRET"), sessionDataTtl: 60 },
  });
}
