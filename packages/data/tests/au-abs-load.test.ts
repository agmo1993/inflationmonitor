import path from "node:path";
import { fileURLToPath } from "node:url";
import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { AU } from "../src/catalog/series-ids.js";
import {
  loadAuAbsCpi,
  loadAuAbsFixture,
} from "../src/loaders/au-abs-cpi.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/au-abs/cpi-headline.json",
);

describe("AU ABS CPI load", () => {
  it("loads headline All groups CPI into obs with release vintage", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadAuAbsFixture(FIXTURE);
      expect(fixture.seriesNativeId).toBe(AU.headline.nativeId);

      const result = await loadAuAbsCpi(db, fixture);
      expect(result.seriesLoaded).toEqual([AU.headline.id]);
      expect(result.observationCount).toBe(fixture.observations.length);
      expect(result.releaseLabel).toBe("2024-12");

      const rows = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, AU.headline.id))
        .orderBy(desc(schema.obs.period));

      expect(rows).toHaveLength(6);
      expect(rows[0]?.period).toBe("2024-12-01");
      expect(Number(rows[0]?.value)).toBeCloseTo(140.5, 5);
      expect(rows[0]?.releaseId).toBe(result.releaseId);
    } finally {
      await client.close();
    }
  });

  it("rejects fixture with wrong native series id", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadAuAbsFixture(FIXTURE);
      await expect(
        loadAuAbsCpi(db, { ...fixture, seriesNativeId: "WRONG" }),
      ).rejects.toThrow(/nativeId/);
    } finally {
      await client.close();
    }
  });

  it("is idempotent for the same release label + periods", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadAuAbsFixture(FIXTURE);
      await loadAuAbsCpi(db, fixture);
      await loadAuAbsCpi(db, fixture);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, AU.headline.id));
      expect(rows).toHaveLength(fixture.observations.length);
    } finally {
      await client.close();
    }
  });

  it("rejects fixture with wrong source id", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadAuAbsFixture(FIXTURE);
      await expect(
        loadAuAbsCpi(db, { ...fixture, source: "bls" }),
      ).rejects.toThrow(/source/);
    } finally {
      await client.close();
    }
  });

  it("persists release vintage metadata for the load", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadAuAbsFixture(FIXTURE);
      const result = await loadAuAbsCpi(db, fixture);
      const releases = await db
        .select()
        .from(schema.release)
        .where(eq(schema.release.id, result.releaseId));
      expect(releases).toHaveLength(1);
      expect(releases[0]?.sourceId).toBe(AU.sourceId);
      expect(releases[0]?.label).toBe("2024-12");
      expect(releases[0]?.releasedAt.toISOString()).toBe(fixture.releasedAt);
    } finally {
      await client.close();
    }
  });

  it("keeps the first observation value on idempotent reload (no silent overwrite)", async () => {
    const { db, client } = await createTestDb();
    try {
      const fixture = await loadAuAbsFixture(FIXTURE);
      await loadAuAbsCpi(db, fixture);
      const mutated = {
        ...fixture,
        observations: fixture.observations.map((o) =>
          o.period === "2024-12-01" ? { ...o, value: 999.999 } : o,
        ),
      };
      await loadAuAbsCpi(db, mutated);
      const rows = await db
        .select()
        .from(schema.obs)
        .where(eq(schema.obs.seriesId, AU.headline.id));
      const dec = rows.find((r) => r.period === "2024-12-01");
      expect(Number(dec?.value)).toBeCloseTo(140.5, 5);
      expect(rows).toHaveLength(fixture.observations.length);
    } finally {
      await client.close();
    }
  });
});
