/**
 * Apply sql/app_usage_monthly.sql against DATABASE_URL.
 * Safe to re-run (IF NOT EXISTS).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sqlText = readFileSync(
  join(__dirname, "..", "sql", "app_usage_monthly.sql"),
  "utf8",
);

const sql = postgres(url, { max: 1 });
try {
  await sql.unsafe(sqlText);
  console.log("app_usage_monthly + app_usage_ledger ensured");
} finally {
  await sql.end({ timeout: 5 });
}
