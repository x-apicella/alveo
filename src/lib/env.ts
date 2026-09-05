/** Read a required env var, failing loudly at call time rather than import time. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const isDevLoginAllowed = () =>
  process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
