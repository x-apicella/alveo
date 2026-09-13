/**
 * Runs once when the Next.js server starts. Applies pending database
 * migrations so a fresh deployment comes up with the right schema.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.SKIP_MIGRATIONS === "true") return;
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const { directDatabaseUrl } = await import("@/lib/database-url");
  const sql = postgres(directDatabaseUrl(), { max: 1 });
  try {
    // Serialize startup migrations across replicas on the same direct session.
    await sql`SELECT pg_advisory_lock(61478201)`;
    try {
      await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    } finally {
      await sql`SELECT pg_advisory_unlock(61478201)`;
    }
  } finally {
    await sql.end();
  }
}
