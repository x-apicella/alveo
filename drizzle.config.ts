import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { directDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: directDatabaseUrl() },
});
