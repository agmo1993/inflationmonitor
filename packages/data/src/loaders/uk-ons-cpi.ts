import { readFile } from "node:fs/promises";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { GB, GB_SERIES_LIST } from "../catalog/series-ids.js";
import { seedMeta } from "../db/seed-meta.js";
import * as schema from "../schema/index.js";
import { ensureRelease } from "./release.js";
import type { LoadResult, ObsPoint } from "./types.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type UkOnsSeriesFixture = {
  nativeId: string;
  title: string;
  observations: ObsPoint[];
};

export type UkOnsFixture = {
  source: string;
  releaseLabel: string;
  releasedAt: string;
  series: UkOnsSeriesFixture[];
};

const REQUIRED_NATIVE_IDS = new Set(GB_SERIES_LIST.map((s) => s.nativeId));

export async function loadUkOnsFixture(path: string): Promise<UkOnsFixture> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as UkOnsFixture;
}

/**
 * Load UK ONS CPI headline + food/energy/core from fixture/payload.
 * Shape mirrors US BLS: { source, releaseLabel, releasedAt, series[] }.
 */
export async function loadUkOnsCpi(
  db: AnyDb,
  fixture: UkOnsFixture,
): Promise<LoadResult> {
  if (fixture.source !== GB.sourceId) {
    throw new Error(`Expected source ${GB.sourceId}, got ${fixture.source}`);
  }
  if (!fixture.series?.length) {
    throw new Error("UK ONS fixture has no series");
  }

  const present = new Set(fixture.series.map((s) => s.nativeId));
  for (const required of REQUIRED_NATIVE_IDS) {
    if (!present.has(required)) {
      throw new Error(`UK ONS fixture missing required series ${required}`);
    }
  }

  await seedMeta(db);

  const releaseId = await ensureRelease(
    db,
    GB.sourceId,
    fixture.releaseLabel,
    new Date(fixture.releasedAt),
  );

  const nativeToPlatform = new Map(
    GB_SERIES_LIST.map((s) => [s.nativeId, s.id] as const),
  );

  let observationCount = 0;
  const seriesLoaded: string[] = [];

  for (const s of fixture.series) {
    const seriesId = nativeToPlatform.get(s.nativeId);
    if (!seriesId) {
      throw new Error(`Unknown ONS native id ${s.nativeId}`);
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
    sourceId: GB.sourceId,
    releaseId,
    releaseLabel: fixture.releaseLabel,
    seriesLoaded,
    observationCount,
  };
}
