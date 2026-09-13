import { test } from "node:test";
import assert from "node:assert/strict";
import { directDatabaseUrl } from "../src/lib/database-url.ts";

test("Neon listener bypasses the pooler without losing credentials or TLS settings", () => {
  const result = new URL(directDatabaseUrl({ ALVEO_DATABASE_URL: "postgres://user:p%40ss@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require" }));
  assert.equal(result.hostname, "ep-example.us-east-2.aws.neon.tech");
  assert.equal(result.password, "p%40ss");
  assert.equal(result.searchParams.get("sslmode"), "require");
});
test("explicit direct URL wins and non-Neon hosts are unchanged", () => {
  assert.equal(directDatabaseUrl({ ALVEO_DATABASE_DIRECT_URL: "postgres://user:pass@postgres:5432/alveo" }), "postgres://user:pass@postgres:5432/alveo");
  assert.equal(directDatabaseUrl({ ALVEO_DATABASE_URL: "postgres://user:pass@other-pooler.example/alveo" }), "postgres://user:pass@other-pooler.example/alveo");
});
test("explicit pooled listener URL and missing configuration fail without exposing values", () => {
  assert.throws(() => directDatabaseUrl({}), /ALVEO_DATABASE_URL/);
  assert.throws(() => directDatabaseUrl({ ALVEO_DATABASE_DIRECT_URL: "postgres://user:secret@ep-test-pooler.aws.neon.tech/db" }), /direct Neon endpoint/);
});
