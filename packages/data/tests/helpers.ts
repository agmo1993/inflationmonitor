import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { applySchema } from "../src/db/migrate.js";
import * as schema from "../src/schema/index.js";

/**
 * Real Postgres SQL semantics via PGlite (WASM).
 * Chosen because the box has no Docker socket / local Postgres and no DATABASE_URL.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await applySchema(db);
  return { db, client };
}
