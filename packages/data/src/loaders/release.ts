import { and, eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

/** Insert or fetch release vintage for (sourceId, label). */
export async function ensureRelease(
  db: AnyDb,
  sourceId: string,
  label: string,
  releasedAt: Date,
): Promise<number> {
  const [rel] = await db
    .insert(schema.release)
    .values({
      sourceId,
      label,
      releasedAt,
    })
    .onConflictDoNothing()
    .returning({ id: schema.release.id });

  if (rel?.id != null) return rel.id;

  const existing = await db
    .select({ id: schema.release.id })
    .from(schema.release)
    .where(
      and(
        eq(schema.release.sourceId, sourceId),
        eq(schema.release.label, label),
      ),
    )
    .limit(1);
  const id = existing[0]?.id;
  if (id == null) {
    throw new Error(`Failed to resolve release id for ${sourceId}/${label}`);
  }
  return id;
}
