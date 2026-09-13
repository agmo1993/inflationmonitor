import { readFile } from "node:fs/promises";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  EA,
  EU,
  EU_HICP_SERIES_LIST,
} from "../catalog/series-ids.js";
import { seedMeta } from "../db/seed-meta.js";
import * as schema from "../schema/index.js";
import { ensureRelease } from "./release.js";
import type { LoadResult, ObsPoint } from "./types.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type EuHicpSeriesFixture = {
  nativeId: string;
  title: string;
  observations: ObsPoint[];
};

/**
 * Eurostat HICP fixture — loads EU27_2020 + EA20.
 * `source` is the umbrella agency family (`eurostat`); each series maps to
 * its catalog sourceId (eurostat vs eurostat_ea) for release vintages.
 */
export type EuHicpFixture = {
  source: string;
  releaseLabel: string;
  releasedAt: string;
  series: EuHicpSeriesFixture[];
};

const REQUIRED_NATIVE_IDS = new Set(
  EU_HICP_SERIES_LIST.map((s) => s.nativeId),
);

const NATIVE_META = new Map(
  [
    ...EU_HICP_SERIES_LIST.map((s) => {
      const sourceId =
        s.nativeId === EA.series.allItems.nativeId ? EA.sourceId : EU.sourceId;
      return [s.nativeId, { platformId: s.id, sourceId }] as const;
    }),
  ],
);

export async function loadEuHicpFixture(path: string): Promise<EuHicpFixture> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as EuHicpFixture;
}

/**
 * Load Eurostat HICP EU27_2020 + EA20 all-items indexes.
 * Rejects fixtures missing either required native id.
 */
export async function loadEuHicp(
  db: AnyDb,
  fixture: EuHicpFixture,
): Promise<LoadResult> {
  if (fixture.source !== EU.sourceId) {
    throw new Error(`Expected source ${EU.sourceId}, got ${fixture.source}`);
  }
  if (!fixture.series?.length) {
    throw new Error("EU HICP fixture has no series");
  }

  const present = new Set(fixture.series.map((s) => s.nativeId));
  for (const required of REQUIRED_NATIVE_IDS) {
    if (!present.has(required)) {
      throw new Error(`EU HICP fixture missing required series ${required}`);
    }
  }

  await seedMeta(db);

  const releasedAt = new Date(fixture.releasedAt);
  const releaseBySource = new Map<string, number>();
  for (const sourceId of [EU.sourceId, EA.sourceId]) {
    const id = await ensureRelease(
      db,
      sourceId,
      fixture.releaseLabel,
      releasedAt,
    );
    releaseBySource.set(sourceId, id);
  }

  let observationCount = 0;
  const seriesLoaded: string[] = [];
  // Primary release id returned is EU27 eurostat vintage.
  const primaryReleaseId = releaseBySource.get(EU.sourceId)!;

  for (const s of fixture.series) {
    const meta = NATIVE_META.get(s.nativeId);
    if (!meta) {
      throw new Error(`Unknown Eurostat HICP native id ${s.nativeId}`);
    }
    const releaseId = releaseBySource.get(meta.sourceId);
    if (releaseId == null) {
      throw new Error(`Missing release for source ${meta.sourceId}`);
    }
    seriesLoaded.push(meta.platformId);
    for (const o of s.observations) {
      await db
        .insert(schema.obs)
        .values({
          seriesId: meta.platformId,
          releaseId,
          period: o.period,
          value: String(o.value),
        })
        .onConflictDoNothing();
      observationCount += 1;
    }
  }

  return {
    sourceId: EU.sourceId,
    releaseId: primaryReleaseId,
    releaseLabel: fixture.releaseLabel,
    seriesLoaded,
    observationCount,
  };
}
