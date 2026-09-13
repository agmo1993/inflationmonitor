import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { GB, GB_SERIES_LIST } from "../src/catalog/series-ids.js";
import {
  loadUkOnsCpi,
  loadUkOnsFixture,
} from "../src/loaders/uk-ons-cpi.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/uk-ons/cpi-components.json",
);

describe("UK ONS CPI load", () => {
  it("loads headline + food, energy, core into obs with release vintage", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUkOnsFixture(FIXTURE);
      const result = await loadUkOnsCpi(db, fixture);

      expect(result.sourceId).toBe(GB.sourceId);
      expect(new Set(result.seriesLoaded)).toEqual(
        new Set(GB_SERIES_LIST.map((s) => s.id)),
      );
      expect(result.releaseLabel).toBe("2024-12");
      expect(fixture.series.map((s) => s.nativeId).sort()).toEqual(
        ["D7BT", "D7BU", "D7CH", "DKC6"].sort(),
      );

      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            GB_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows.length).toBe(4 * 6);

      const headline = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, GB.series.allItems.id));
      const latest = headline
        .map((r) => r.period)
        .sort()
        .at(-1);
      expect(latest).toBe("2024-12-01");
      expect(
        Number(headline.find((r) => r.period === "2024-12-01")?.value),
      ).toBeCloseTo(134.7, 5);
      expect(
        headline.find((r) => r.period === "2024-12-01")?.releaseId,
      ).toBe(result.releaseId);
    } finally {
      await client.close();
    }
  });

  it("rejects fixture missing a required component", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUkOnsFixture(FIXTURE);
      const incomplete = {
        ...fixture,
        series: fixture.series.filter((s) => s.nativeId !== "DKC6"),
      };
      await expect(loadUkOnsCpi(db, incomplete)).rejects.toThrow(/DKC6/);
    } finally {
      await client.close();
    }
  });

  it("is idempotent for the same release label + periods", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUkOnsFixture(FIXTURE);
      await loadUkOnsCpi(db, fixture);
      await loadUkOnsCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            GB_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows).toHaveLength(4 * 6);
    } finally {
      await client.close();
    }
  });

  it("rejects fixture with wrong source id", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUkOnsFixture(FIXTURE);
      await expect(
        loadUkOnsCpi(db, { ...fixture, source: "abs" }),
      ).rejects.toThrow(/source/);
    } finally {
      await client.close();
    }
  });

  it("persists release vintage metadata for the load", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUkOnsFixture(FIXTURE);
      const result = await loadUkOnsCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            GB_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows.every((r) => r.releaseId === result.releaseId)).toBe(true);
      const releases = await db
        .select()
        .from(schema.release)
        .where(eq(schema.release.id, result.releaseId));
      expect(releases).toHaveLength(1);
      expect(releases[0]?.sourceId).toBe(GB.sourceId);
      expect(releases[0]?.label).toBe("2024-12");
      expect(releases[0]?.releasedAt.toISOString()).toBe(fixture.releasedAt);
    } finally {
      await client.close();
    }
  });

  it("keeps the first observation value on idempotent reload (no silent overwrite)", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUkOnsFixture(FIXTURE);
      await loadUkOnsCpi(db, fixture);
      const mutated = {
        ...fixture,
        series: fixture.series.map((s) =>
          s.nativeId === "D7BT"
            ? {
                ...s,
                observations: s.observations.map((o) =>
                  o.period === "2024-12-01" ? { ...o, value: 999.999 } : o,
                ),
              }
            : s,
        ),
      };
      await loadUkOnsCpi(db, mutated);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, GB.series.allItems.id));
      const dec = rows.find((r) => r.period === "2024-12-01");
      expect(Number(dec?.value)).toBeCloseTo(134.7, 5);
      expect(rows).toHaveLength(6);
    } finally {
      await client.close();
    }
  });
});
