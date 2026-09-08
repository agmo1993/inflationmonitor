import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { US, US_SERIES_LIST } from "../catalog/series-ids.js";
import { seedMeta } from "../db/seed-meta.js";
import * as schema from "../schema/index.js";
import type { LoadResult, ObsPoint } from "./types.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type UsBlsSeriesFixture = {
  nativeId: string;
  title: string;
  observations: ObsPoint[];
};

export type UsBlsFixture = {
  source: string;
  releaseLabel: string;
  releasedAt: string;
  series: UsBlsSeriesFixture[];
};

const REQUIRED_NATIVE_IDS = new Set(US_SERIES_LIST.map((s) => s.nativeId));

export async function loadUsBlsFixture(path: string): Promise<UsBlsFixture> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as UsBlsFixture;
}

/**
 * Load US BLS CPI-U headline + major components from fixture/payload.
 */
export async function loadUsBlsCpi(
  db: AnyDb,
  fixture: UsBlsFixture,
): Promise<LoadResult> {
  if (fixture.source !== US.sourceId) {
    throw new Error(`Expected source ${US.sourceId}, got ${fixture.source}`);
  }
  if (!fixture.series?.length) {
    throw new Error("US BLS fixture has no series");
  }

  const present = new Set(fixture.series.map((s) => s.nativeId));
  for (const required of REQUIRED_NATIVE_IDS) {
    if (!present.has(required)) {
      throw new Error(`US BLS fixture missing required series ${required}`);
    }
  }

  await seedMeta(db);

  const [rel] = await db
    .insert(schema.release)
    .values({
      sourceId: US.sourceId,
      label: fixture.releaseLabel,
      releasedAt: new Date(fixture.releasedAt),
    })
    .onConflictDoNothing()
    .returning({ id: schema.release.id });

  let releaseId = rel?.id;
  if (releaseId == null) {
    const existing = await db
      .select({ id: schema.release.id })
      .from(schema.release)
      .where(
        and(
          eq(schema.release.sourceId, US.sourceId),
          eq(schema.release.label, fixture.releaseLabel),
        ),
      )
      .limit(1);
    releaseId = existing[0]?.id;
  }
  if (releaseId == null) {
    throw new Error("Failed to resolve US BLS release id");
  }

  const nativeToPlatform = new Map(
    US_SERIES_LIST.map((s) => [s.nativeId, s.id] as const),
  );

  let observationCount = 0;
  const seriesLoaded: string[] = [];

  for (const s of fixture.series) {
    const seriesId = nativeToPlatform.get(s.nativeId);
    if (!seriesId) {
      throw new Error(`Unknown BLS native id ${s.nativeId}`);
    }
    seriesLoaded.push(seriesId);
    for (const o of s.observations) {
      await db
        .insert(schema.obs)
        .values({
          seriesId,
          releaseId,
          period: o.period,
          value: String(o.value),
        })
        .onConflictDoNothing();
      observationCount += 1;
    }
  }

  return {
    sourceId: US.sourceId,
    releaseId,
    releaseLabel: fixture.releaseLabel,
    seriesLoaded,
    observationCount,
  };
}
