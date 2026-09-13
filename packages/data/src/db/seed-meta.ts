import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  AU,
  US,
  US_SERIES_LIST,
  GB,
  GB_SERIES_LIST,
  CA,
  CA_SERIES_LIST,
  EU,
  EU_SERIES_LIST,
  EA,
  EA_SERIES_LIST,
} from "../catalog/series-ids.js";
import * as schema from "../schema/index.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

/** Upsert countries, sources, and known AU/US/GB/CA/EU/EA series metadata. */
export async function seedMeta(db: AnyDb): Promise<void> {
  await db
    .insert(schema.country)
    .values([
      { code: "AU", name: "Australia" },
      { code: "US", name: "United States" },
      { code: "GB", name: "United Kingdom" },
      { code: "CA", name: "Canada" },
      { code: "EU", name: "European Union (EU27_2020)" },
      { code: "EA", name: "Euro area (EA20)" },
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
      {
        id: GB.sourceId,
        countryCode: GB.country,
        name: "Office for National Statistics",
        homepageUrl: "https://www.ons.gov.uk/",
      },
      {
        id: CA.sourceId,
        countryCode: CA.country,
        name: "Statistics Canada",
        homepageUrl: "https://www.statcan.gc.ca/",
      },
      {
        id: EU.sourceId,
        countryCode: EU.country,
        name: "Eurostat (EU aggregates)",
        homepageUrl: "https://ec.europa.eu/eurostat",
      },
      {
        id: EA.sourceId,
        countryCode: EA.country,
        name: "Eurostat (euro area aggregates)",
        homepageUrl: "https://ec.europa.eu/eurostat",
      },
    ])
    .onConflictDoNothing();

  const allSeries = [
    {
      id: AU.headline.id,
      sourceId: AU.sourceId,
      countryCode: AU.country,
      nativeId: AU.headline.nativeId,
      title: AU.headline.title,
      frequency: AU.headline.frequency,
    },
    ...US_SERIES_LIST.map((s) => ({
      id: s.id,
      sourceId: US.sourceId,
      countryCode: US.country,
      nativeId: s.nativeId,
      title: s.title,
      frequency: s.frequency,
    })),
    ...GB_SERIES_LIST.map((s) => ({
      id: s.id,
      sourceId: GB.sourceId,
      countryCode: GB.country,
      nativeId: s.nativeId,
      title: s.title,
      frequency: s.frequency,
    })),
    ...CA_SERIES_LIST.map((s) => ({
      id: s.id,
      sourceId: CA.sourceId,
      countryCode: CA.country,
      nativeId: s.nativeId,
      title: s.title,
      frequency: s.frequency,
    })),
    ...EU_SERIES_LIST.map((s) => ({
      id: s.id,
      sourceId: EU.sourceId,
      countryCode: EU.country,
      nativeId: s.nativeId,
      title: s.title,
      frequency: s.frequency,
    })),
    ...EA_SERIES_LIST.map((s) => ({
      id: s.id,
      sourceId: EA.sourceId,
      countryCode: EA.country,
      nativeId: s.nativeId,
      title: s.title,
      frequency: s.frequency,
    })),
  ];

  await db
    .insert(schema.series)
    .values(
      allSeries.map((s) => ({
        ...s,
        unit: "index",
        seasonallyAdjusted: false,
      })),
    )
    .onConflictDoNothing();

  for (const s of allSeries) {
    await db
      .update(schema.series)
      .set({ nativeId: s.nativeId, title: s.title })
      .where(eq(schema.series.id, s.id));
  }
}
