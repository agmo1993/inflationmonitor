import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  AU,
  US,
  GB,
  GB_SERIES_LIST,
  CA,
  CA_SERIES_LIST,
  EU,
  EA,
  EU_HICP_SERIES_LIST,
} from "../src/catalog/series-ids.js";
import { seedMeta } from "../src/db/seed-meta.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

describe("UK / EU / EA / CA catalog seed", () => {
  it("seeds countries GB, EU, EA, CA (and still AU, US)", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const countries = await db.select().from(schema.country);
      const codes = countries.map((c) => c.code);
      expect(codes).toEqual(
        expect.arrayContaining(["AU", "US", "GB", "EU", "EA", "CA"]),
      );
    } finally {
      await client.close();
    }
  });

  it("seeds sources ons→GB, eurostat→EU, eurostat_ea→EA, statcan→CA", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const sources = await db.select().from(schema.source);
      const byId = Object.fromEntries(sources.map((s) => [s.id, s]));
      expect(byId.ons?.countryCode).toBe("GB");
      expect(byId.eurostat?.countryCode).toBe("EU");
      expect(byId.eurostat_ea?.countryCode).toBe("EA");
      expect(byId.statcan?.countryCode).toBe("CA");
      expect(byId.abs?.countryCode).toBe(AU.country);
      expect(byId.bls?.countryCode).toBe(US.country);
    } finally {
      await client.close();
    }
  });

  it("seeds locked native/platform ids for ONS, StatCan, Eurostat HICP", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);

      expect(GB.series.allItems.nativeId).toBe("D7BT");
      expect(GB.series.food.nativeId).toBe("D7BU");
      expect(GB.series.energy.nativeId).toBe("D7CH");
      expect(GB.series.allItemsLessFoodEnergyAlcoholTobacco.nativeId).toBe(
        "DKC6",
      );
      expect(GB_SERIES_LIST.map((s) => s.nativeId)).not.toContain("D7CD");
      expect(GB_SERIES_LIST.map((s) => s.nativeId)).not.toContain("DKO8");

      const gb = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.sourceId, GB.sourceId));
      expect(gb.map((s) => s.nativeId).sort()).toEqual(
        ["D7BT", "D7BU", "D7CH", "DKC6"].sort(),
      );
      expect(gb.map((s) => s.id).sort()).toEqual(
        GB_SERIES_LIST.map((s) => s.id).sort(),
      );

      expect(CA.series.allItems.nativeId).toBe("v41690973");
      expect(CA.series.food.nativeId).toBe("v41690974");
      expect(CA.series.shelter.nativeId).toBe("v41691050");
      expect(CA.series.energy.nativeId).toBe("v41691239");

      const ca = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.sourceId, CA.sourceId));
      expect(ca.map((s) => s.nativeId).sort()).toEqual(
        ["v41690973", "v41690974", "v41691050", "v41691239"].sort(),
      );
      expect(ca.map((s) => s.id).sort()).toEqual(
        CA_SERIES_LIST.map((s) => s.id).sort(),
      );

      expect(EU.headline.nativeId).toBe(
        "prc_hicp_minr.M.I15.TOTAL.EU27_2020",
      );
      expect(EA.headline.nativeId).toBe("prc_hicp_minr.M.I15.TOTAL.EA20");
      expect(EU.headline.nativeId).not.toContain("EA19");
      expect(EA.headline.nativeId).not.toContain("EA19");
      expect(EU.headline.nativeId).not.toMatch(/\.EU$/);
      expect(EA.headline.nativeId).not.toMatch(/\.EU$/);
      expect(EU.headline.nativeId).not.toBe("EU");
      expect(EA.headline.nativeId).not.toBe("EU");

      const eu = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.id, EU.headline.id));
      expect(eu[0]?.nativeId).toBe("prc_hicp_minr.M.I15.TOTAL.EU27_2020");
      expect(eu[0]?.countryCode).toBe("EU");
      expect(eu[0]?.sourceId).toBe("eurostat");

      const ea = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.id, EA.headline.id));
      expect(ea[0]?.nativeId).toBe("prc_hicp_minr.M.I15.TOTAL.EA20");
      expect(ea[0]?.sourceId).toBe("eurostat_ea");
      expect(ea[0]?.countryCode).toBe("EA");

      expect(EU_HICP_SERIES_LIST.map((s) => s.nativeId).sort()).toEqual(
        [
          "prc_hicp_minr.M.I15.TOTAL.EA20",
          "prc_hicp_minr.M.I15.TOTAL.EU27_2020",
        ].sort(),
      );
    } finally {
      await client.close();
    }
  });

  it("seeds platform ids, monthly frequency, NSA, unit index", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);

      expect(GB.headline.id).toBe("gb.ons.cpi.all_items");
      expect(GB.series.food.id).toBe("gb.ons.cpi.food");
      expect(GB.series.energy.id).toBe("gb.ons.cpi.energy");
      expect(GB.series.allItemsLessFoodEnergyAlcoholTobacco.id).toBe(
        "gb.ons.cpi.all_items_less_food_energy_alcohol_tobacco",
      );
      expect(CA.headline.id).toBe("ca.statcan.cpi.all_items");
      expect(CA.series.food.id).toBe("ca.statcan.cpi.food");
      expect(CA.series.shelter.id).toBe("ca.statcan.cpi.shelter");
      expect(CA.series.energy.id).toBe("ca.statcan.cpi.energy");
      expect(EU.headline.id).toBe("eu.eurostat.hicp.all_items");
      expect(EA.headline.id).toBe("ea.eurostat.hicp.all_items");

      for (const s of [
        ...GB_SERIES_LIST,
        ...CA_SERIES_LIST,
        ...EU_HICP_SERIES_LIST,
      ]) {
        const rows = await db
          .select()
          .from(schema.series)
          .where(eq(schema.series.id, s.id));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.frequency).toBe("monthly");
        expect(rows[0]?.seasonallyAdjusted).toBe(false);
        expect(rows[0]?.unit).toBe("index");
      }
    } finally {
      await client.close();
    }
  });

  it("binds source↔country for ons, eurostat, eurostat_ea, statcan", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const sources = await db.select().from(schema.source);
      const byId = Object.fromEntries(sources.map((s) => [s.id, s]));
      expect(byId[GB.sourceId]?.countryCode).toBe(GB.country);
      expect(byId[EU.sourceId]?.countryCode).toBe(EU.country);
      expect(byId[EA.sourceId]?.countryCode).toBe(EA.country);
      expect(byId[CA.sourceId]?.countryCode).toBe(CA.country);
    } finally {
      await client.close();
    }
  });
});
