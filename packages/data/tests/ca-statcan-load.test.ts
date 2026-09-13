import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { CA, CA_SERIES_LIST } from "../src/catalog/series-ids.js";
import {
  loadCaStatcanCpi,
  loadCaStatcanFixture,
} from "../src/loaders/ca-statcan-cpi.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/ca-statcan/cpi-components.json",
);

describe("Canada StatCan CPI load", () => {
  it("loads all-items + food, shelter, energy into obs with release vintage", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadCaStatcanFixture(FIXTURE);
      const result = await loadCaStatcanCpi(db, fixture);

      expect(result.sourceId).toBe(CA.sourceId);
      expect(new Set(result.seriesLoaded)).toEqual(
        new Set(CA_SERIES_LIST.map((s) => s.id)),
      );
      expect(result.releaseLabel).toBe("2024-12");
      expect(fixture.series.map((s) => s.nativeId).sort()).toEqual(
        ["v41690973", "v41690974", "v41691050", "v41691239"].sort(),
      );

      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            CA_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows.length).toBe(4 * 6);

      const headline = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, CA.series.allItems.id));
      expect(headline.map((r) => r.period).sort().at(-1)).toBe("2024-12-01");
      expect(
        Number(headline.find((r) => r.period === "2024-12-01")?.value),
      ).toBeCloseTo(162.0, 5);
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
      const fixture = await loadCaStatcanFixture(FIXTURE);
      const incomplete = {
        ...fixture,
        series: fixture.series.filter((s) => s.nativeId !== "v41691050"),
      };
      await expect(loadCaStatcanCpi(db, incomplete)).rejects.toThrow(
        /v41691050/,
      );
    } finally {
      await client.close();
    }
  });

  it("is idempotent for the same release label + periods", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadCaStatcanFixture(FIXTURE);
      await loadCaStatcanCpi(db, fixture);
      await loadCaStatcanCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            CA_SERIES_LIST.map((s) => s.id),
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
      const fixture = await loadCaStatcanFixture(FIXTURE);
      await expect(
        loadCaStatcanCpi(db, { ...fixture, source: "abs" }),
      ).rejects.toThrow(/source/);
    } finally {
      await client.close();
    }
  });

  it("persists release vintage metadata for the load", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadCaStatcanFixture(FIXTURE);
      const result = await loadCaStatcanCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            CA_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows.every((r) => r.releaseId === result.releaseId)).toBe(true);
      const releases = await db
        .select()
        .from(schema.release)
        .where(eq(schema.release.id, result.releaseId));
      expect(releases).toHaveLength(1);
      expect(releases[0]?.sourceId).toBe(CA.sourceId);
      expect(releases[0]?.label).toBe("2024-12");
      expect(releases[0]?.releasedAt.toISOString()).toBe(fixture.releasedAt);
    } finally {
      await client.close();
    }
  });

  it("keeps the first observation value on idempotent reload (no silent overwrite)", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadCaStatcanFixture(FIXTURE);
      await loadCaStatcanCpi(db, fixture);
      const mutated = {
        ...fixture,
        series: fixture.series.map((s) =>
          s.nativeId === "v41690973"
            ? {
                ...s,
                observations: s.observations.map((o) =>
                  o.period === "2024-12-01" ? { ...o, value: 999.999 } : o,
                ),
              }
            : s,
        ),
      };
      await loadCaStatcanCpi(db, mutated);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, CA.series.allItems.id));
      const dec = rows.find((r) => r.period === "2024-12-01");
      expect(Number(dec?.value)).toBeCloseTo(162.0, 5);
      expect(rows).toHaveLength(6);
    } finally {
      await client.close();
    }
  });
});
