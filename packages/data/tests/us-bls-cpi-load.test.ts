import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { US, US_SERIES_LIST } from "../src/catalog/series-ids.js";
import {
  loadUsBlsCpi,
  loadUsBlsFixture,
} from "../src/loaders/us-bls-cpi.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/us-bls/cpiu-components.json",
);

describe("US BLS CPI-U load", () => {
  it("loads headline + Food, Energy, core, Shelter", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUsBlsFixture(FIXTURE);
      const result = await loadUsBlsCpi(db, fixture);

      expect(result.sourceId).toBe(US.sourceId);
      expect(new Set(result.seriesLoaded)).toEqual(
        new Set(US_SERIES_LIST.map((s) => s.id)),
      );

      const expectedNative = [
        "CUUR0000SA0",
        "CUUR0000SAF1",
        "CUUR0000SA0E",
        "CUUR0000SA0L1E",
        "CUUR0000SAH1",
      ];
      expect(fixture.series.map((s) => s.nativeId).sort()).toEqual(
        expectedNative.sort(),
      );

      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            US_SERIES_LIST.map((s) => s.id),
          ),
        );

      expect(rows.length).toBe(5 * 4);

      const headline = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, US.series.allItems.id));
      const latest = headline
        .map((r) => r.period)
        .sort()
        .at(-1);
      expect(latest).toBe("2025-01-01");
    } finally {
      await client.close();
    }
  });

  it("rejects fixture missing a required major component", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUsBlsFixture(FIXTURE);
      const incomplete = {
        ...fixture,
        series: fixture.series.filter((s) => s.nativeId !== "CUUR0000SAH1"),
      };
      await expect(loadUsBlsCpi(db, incomplete)).rejects.toThrow(
        /CUUR0000SAH1/,
      );
    } finally {
      await client.close();
    }
  });

  it("is idempotent for the same release label + periods", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUsBlsFixture(FIXTURE);
      await loadUsBlsCpi(db, fixture);
      await loadUsBlsCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            US_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows).toHaveLength(5 * 4);
    } finally {
      await client.close();
    }
  });

  it("attaches all observations to a single BLS release vintage", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUsBlsFixture(FIXTURE);
      const result = await loadUsBlsCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            US_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows.every((r) => r.releaseId === result.releaseId)).toBe(true);
      const releases = await db
        .select()
        .from(schema.release)
        .where(eq(schema.release.id, result.releaseId));
      expect(releases[0]?.sourceId).toBe(US.sourceId);
      expect(releases[0]?.label).toBe(fixture.releaseLabel);
    } finally {
      await client.close();
    }
  });

  it("rejects fixture with wrong source id", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadUsBlsFixture(FIXTURE);
      await expect(
        loadUsBlsCpi(db, { ...fixture, source: "abs" }),
      ).rejects.toThrow(/source/);
    } finally {
      await client.close();
    }
  });
});
