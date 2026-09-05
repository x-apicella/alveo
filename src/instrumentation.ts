/**
 * Runs once when the Next.js server starts. Applies pending database
 * migrations so a fresh deployment comes up with the right schema.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SKIP_MIGRATIONS === "true") return;
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { db } = await import("@/db");
  await migrate(db, { migrationsFolder: "./drizzle" });
}
