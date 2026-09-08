import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { AU, US, US_SERIES_LIST } from "../catalog/series-ids.js";
import * as schema from "../schema/index.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

/** Upsert countries, sources, and known AU/US series metadata. */
export async function seedMeta(db: AnyDb): Promise<void> {
  await db
    .insert(schema.country)
    .values([
      { code: "AU", name: "Australia" },
      { code: "US", name: "United States" },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.source)
    .values([
      {
        id: AU.sourceId,
        countryCode: AU.country,
        name: "Australian Bureau of Statistics",
        homepageUrl: "https://www.abs.gov.au/",
      },
      {
        id: US.sourceId,
        countryCode: US.country,
        name: "U.S. Bureau of Labor Statistics",
        homepageUrl: "https://www.bls.gov/",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.series)
    .values([
      {
        id: AU.headline.id,
        sourceId: AU.sourceId,
        countryCode: AU.country,
        nativeId: AU.headline.nativeId,
        title: AU.headline.title,
        frequency: AU.headline.frequency,
        unit: "index",
        seasonallyAdjusted: false,
      },
      ...US_SERIES_LIST.map((s) => ({
        id: s.id,
        sourceId: US.sourceId,
        countryCode: US.country,
        nativeId: s.nativeId,
        title: s.title,
        frequency: s.frequency,
        unit: "index",
        seasonallyAdjusted: false,
      })),
    ])
    .onConflictDoNothing();

  // Ensure native ids stay aligned if rows already existed with different titles.
  for (const s of [
    {
      id: AU.headline.id,
      nativeId: AU.headline.nativeId,
      title: AU.headline.title,
    },
    ...US_SERIES_LIST,
  ]) {
    await db
      .update(schema.series)
      .set({ nativeId: s.nativeId, title: s.title })
      .where(eq(schema.series.id, s.id));
  }
}
