import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { AU } from "../catalog/series-ids.js";
import { seedMeta } from "../db/seed-meta.js";
import * as schema from "../schema/index.js";
import type { LoadResult, ObsPoint } from "./types.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type AuAbsFixture = {
  source: string;
  seriesNativeId: string;
  seriesTitle: string;
  releaseLabel: string;
  releasedAt: string;
  observations: ObsPoint[];
};

export async function loadAuAbsFixture(
  path: string,
): Promise<AuAbsFixture> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as AuAbsFixture;
}

/**
 * Load AU ABS CPI headline (All groups) from a fixture or parsed payload.
 * Ensures country/source/series meta, creates a release vintage, upserts obs.
 */
export async function loadAuAbsCpi(
  db: AnyDb,
  fixture: AuAbsFixture,
): Promise<LoadResult> {
  if (fixture.source !== AU.sourceId) {
    throw new Error(`Expected source ${AU.sourceId}, got ${fixture.source}`);
  }
  if (fixture.seriesNativeId !== AU.headline.nativeId) {
    throw new Error(
      `Expected nativeId ${AU.headline.nativeId}, got ${fixture.seriesNativeId}`,
    );
  }
  if (!fixture.observations?.length) {
    throw new Error("AU ABS fixture has no observations");
  }

  await seedMeta(db);

  const [rel] = await db
    .insert(schema.release)
    .values({
      sourceId: AU.sourceId,
      label: fixture.releaseLabel,
      releasedAt: new Date(fixture.releasedAt),
    })
    .onConflictDoNothing()
    .returning({ id: schema.release.id, label: schema.release.label });

  let releaseId = rel?.id;
  if (releaseId == null) {
    const existing = await db
      .select({ id: schema.release.id, label: schema.release.label })
      .from(schema.release)
      .where(
        and(
          eq(schema.release.sourceId, AU.sourceId),
          eq(schema.release.label, fixture.releaseLabel),
        ),
      )
      .limit(1);
    releaseId = existing[0]?.id;
  }
  if (releaseId == null) {
    throw new Error("Failed to resolve AU ABS release id");
  }

  let observationCount = 0;
  for (const o of fixture.observations) {
    await db
      .insert(schema.obs)
      .values({
        seriesId: AU.headline.id,
        releaseId,
        period: o.period,
        value: String(o.value),
      })
      .onConflictDoNothing();
    observationCount += 1;
  }

  return {
    sourceId: AU.sourceId,
    releaseId,
    releaseLabel: fixture.releaseLabel,
    seriesLoaded: [AU.headline.id],
    observationCount,
  };
}
