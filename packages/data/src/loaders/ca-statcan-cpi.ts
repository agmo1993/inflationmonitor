import { readFile } from "node:fs/promises";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { CA, CA_SERIES_LIST } from "../catalog/series-ids.js";
import { seedMeta } from "../db/seed-meta.js";
import * as schema from "../schema/index.js";
import { ensureRelease } from "./release.js";
import type { LoadResult, ObsPoint } from "./types.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type CaStatcanSeriesFixture = {
  nativeId: string;
  title: string;
  observations: ObsPoint[];
};

export type CaStatcanFixture = {
  source: string;
  releaseLabel: string;
  releasedAt: string;
  series: CaStatcanSeriesFixture[];
};

const REQUIRED_NATIVE_IDS = new Set(CA_SERIES_LIST.map((s) => s.nativeId));

export async function loadCaStatcanFixture(
  path: string,
): Promise<CaStatcanFixture> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as CaStatcanFixture;
}

/**
 * Load Canada StatCan CPI all-items + food/shelter/energy.
 * Table 18-10-0004-01 vectors; fixture shape mirrors US BLS.
 */
export async function loadCaStatcanCpi(
  db: AnyDb,
  fixture: CaStatcanFixture,
): Promise<LoadResult> {
  if (fixture.source !== CA.sourceId) {
    throw new Error(`Expected source ${CA.sourceId}, got ${fixture.source}`);
  }
  if (!fixture.series?.length) {
    throw new Error("CA StatCan fixture has no series");
  }

  const present = new Set(fixture.series.map((s) => s.nativeId));
  for (const required of REQUIRED_NATIVE_IDS) {
    if (!present.has(required)) {
      throw new Error(`CA StatCan fixture missing required series ${required}`);
    }
  }

  await seedMeta(db);

  const releaseId = await ensureRelease(
    db,
    CA.sourceId,
    fixture.releaseLabel,
    new Date(fixture.releasedAt),
  );

  const nativeToPlatform = new Map(
    CA_SERIES_LIST.map((s) => [s.nativeId, s.id] as const),
  );

  let observationCount = 0;
  const seriesLoaded: string[] = [];

  for (const s of fixture.series) {
    const seriesId = nativeToPlatform.get(s.nativeId);
    if (!seriesId) {
      throw new Error(`Unknown StatCan native id ${s.nativeId}`);
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
    sourceId: CA.sourceId,
    releaseId,
    releaseLabel: fixture.releaseLabel,
    seriesLoaded,
    observationCount,
  };
}
