/** Session-scoped Postgres operations must bypass transaction poolers. */
export function directDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.ALVEO_DATABASE_DIRECT_URL || env.ALVEO_DATABASE_URL;
  if (!value) throw new Error("ALVEO_DATABASE_URL is not set");
  const url = new URL(value);
  if (url.hostname.endsWith(".neon.tech") && url.hostname.includes("-pooler.")) {
    if (env.ALVEO_DATABASE_DIRECT_URL) {
      throw new Error("ALVEO_DATABASE_DIRECT_URL must use a direct Neon endpoint");
    }
    url.hostname = url.hostname.replace("-pooler.", ".");
  }
  return url.toString();
}
