import postgres from "postgres";

let sql: ReturnType<typeof postgres> | null = null;

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!sql) {
    sql = postgres(url, { max: 5 });
  }
  return sql;
}

export async function closeSql() {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
