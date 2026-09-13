import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  EA,
  EU,
  EU_HICP_SERIES_LIST,
} from "../src/catalog/series-ids.js";
import { loadEuHicp, loadEuHicpFixture } from "../src/loaders/eu-hicp.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/eu-hicp/hicp-components.json",
);

describe("EU / EA Eurostat HICP load", () => {
  it("loads EU27_2020 + EA20 all-items into obs with release vintages", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      const result = await loadEuHicp(db, fixture);

      expect(new Set(result.seriesLoaded)).toEqual(
        new Set(EU_HICP_SERIES_LIST.map((s) => s.id)),
      );
      expect(result.releaseLabel).toBe("2024-12");
      expect(fixture.series.map((s) => s.nativeId).sort()).toEqual(
        [
          "prc_hicp_midx.M.I15.CP00.EA20",
          "prc_hicp_midx.M.I15.CP00.EU27_2020",
        ].sort(),
      );
      expect(
        fixture.series.some((s) => s.nativeId.includes("EA19")),
      ).toBe(false);

      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            EU_HICP_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows.length).toBe(2 * 6);

      const eu = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, EU.headline.id));
      expect(Number(eu.find((r) => r.period === "2024-12-01")?.value)).toBeCloseTo(
        127.9,
        5,
      );

      const ea = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, EA.headline.id));
      expect(Number(ea.find((r) => r.period === "2024-12-01")?.value)).toBeCloseTo(
        126.3,
        5,
      );
    } finally {
      await client.close();
    }
  });

  it("rejects fixture missing EA20", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      const incomplete = {
        ...fixture,
        series: fixture.series.filter(
          (s) => s.nativeId !== "prc_hicp_midx.M.I15.CP00.EA20",
        ),
      };
      await expect(loadEuHicp(db, incomplete)).rejects.toThrow(/EA20/);
    } finally {
      await client.close();
    }
  });

  it("rejects EA19 native id when used as the EA series", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      const withEa19 = {
        ...fixture,
        series: fixture.series.map((s) =>
          s.nativeId === "prc_hicp_midx.M.I15.CP00.EA20"
            ? { ...s, nativeId: "prc_hicp_midx.M.I15.CP00.EA19" }
            : s,
        ),
      };
      await expect(loadEuHicp(db, withEa19)).rejects.toThrow(
        /EA20|EA19|nativeId/,
      );
    } finally {
      await client.close();
    }
  });

  it("is idempotent for the same release label + periods", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      await loadEuHicp(db, fixture);
      await loadEuHicp(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          inArray(
            schema.obs.seriesId,
            EU_HICP_SERIES_LIST.map((s) => s.id),
          ),
        );
      expect(rows).toHaveLength(2 * 6);
    } finally {
      await client.close();
    }
  });

  it("rejects fixture with wrong source id", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      await expect(
        loadEuHicp(db, { ...fixture, source: "abs" }),
      ).rejects.toThrow(/source/);
    } finally {
      await client.close();
    }
  });

  it("creates distinct eurostat and eurostat_ea release vintages", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      await loadEuHicp(db, fixture);
      const releases = await db.select().from(schema.release);
      const bySource = Object.fromEntries(
        releases.map((r) => [r.sourceId, r]),
      );
      expect(bySource.eurostat?.label).toBe(fixture.releaseLabel);
      expect(bySource.eurostat_ea?.label).toBe(fixture.releaseLabel);
      expect(bySource.eurostat?.releasedAt.toISOString()).toBe(
        fixture.releasedAt,
      );
      expect(bySource.eurostat_ea?.releasedAt.toISOString()).toBe(
        fixture.releasedAt,
      );

      const euObs = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, EU.headline.id));
      const eaObs = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, EA.headline.id));
      expect(euObs.every((r) => r.releaseId === bySource.eurostat?.id)).toBe(
        true,
      );
      expect(
        eaObs.every((r) => r.releaseId === bySource.eurostat_ea?.id),
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("keeps the first observation value on idempotent reload (no silent overwrite)", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadEuHicpFixture(FIXTURE);
      await loadEuHicp(db, fixture);
      const mutated = {
        ...fixture,
        series: fixture.series.map((s) =>
          s.nativeId === "prc_hicp_midx.M.I15.CP00.EU27_2020"
            ? {
                ...s,
                observations: s.observations.map((o) =>
                  o.period === "2024-12-01" ? { ...o, value: 999.999 } : o,
                ),
              }
            : s,
        ),
      };
      await loadEuHicp(db, mutated);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, EU.headline.id));
      const dec = rows.find((r) => r.period === "2024-12-01");
      expect(Number(dec?.value)).toBeCloseTo(127.9, 5);
      expect(rows).toHaveLength(6);
    } finally {
      await client.close();
    }
  });
});
