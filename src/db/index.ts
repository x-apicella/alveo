import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.ALVEO_DATABASE_URL;
if (!url) {
  throw new Error("ALVEO_DATABASE_URL is not set");
}

// A small pool shared across the Next.js server process. Works against the
// bundled Postgres container or a hosted provider such as Neon.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };
export const sql = globalForDb.sql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
