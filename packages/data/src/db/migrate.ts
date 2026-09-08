import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS country (
  code text PRIMARY KEY,
  name text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS source (
  id text PRIMARY KEY,
  country_code text NOT NULL REFERENCES country(code),
  name text NOT NULL,
  homepage_url text
)`,
  `CREATE TABLE IF NOT EXISTS series (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES source(id),
  country_code text NOT NULL REFERENCES country(code),
  native_id text NOT NULL,
  title text NOT NULL,
  frequency text NOT NULL,
  unit text NOT NULL DEFAULT 'index',
  seasonally_adjusted boolean NOT NULL DEFAULT false
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS series_source_native_uidx
  ON series (source_id, native_id)`,
  `CREATE INDEX IF NOT EXISTS series_country_idx ON series (country_code)`,
  `CREATE TABLE IF NOT EXISTS release (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL REFERENCES source(id),
  label text NOT NULL,
  released_at timestamptz NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS release_source_label_uidx
  ON release (source_id, label)`,
  `CREATE TABLE IF NOT EXISTS obs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id text NOT NULL REFERENCES series(id),
  release_id integer NOT NULL REFERENCES release(id),
  period date NOT NULL,
  value numeric(18, 6) NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS obs_series_period_release_uidx
  ON obs (series_id, period, release_id)`,
  `CREATE INDEX IF NOT EXISTS obs_series_period_idx ON obs (series_id, period)`,
];

/** Apply schema via explicit Postgres DDL (PGlite + Neon compatible). */
export async function applySchema(db: AnyDb): Promise<void> {
  for (const statement of STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
}
