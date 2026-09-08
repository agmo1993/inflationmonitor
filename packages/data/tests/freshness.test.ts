import { describe, expect, it } from "vitest";
import { AU, US } from "../src/catalog/series-ids.js";
import { seedMeta } from "../src/db/seed-meta.js";
import {
  checkFreshness,
  expectedLatestPeriod,
} from "../src/freshness/check.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

describe("freshness check", () => {
  it("computes expected latest period with lag", () => {
    expect(expectedLatestPeriod(new Date("2025-02-15T00:00:00Z"), 1)).toBe(
      "2025-01-01",
    );
    expect(expectedLatestPeriod(new Date("2025-01-05T00:00:00Z"), 1)).toBe(
      "2024-12-01",
    );
  });

  it("flags missing when series has no observations", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const report = await checkFreshness(db, [AU.headline.id], {
        asOf: new Date("2025-02-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.ok).toBe(false);
      expect(report.issues[0]?.status).toBe("missing");
      expect(report.expectedLatestPeriod).toBe("2025-01-01");
    } finally {
      await client.close();
    }
  });

  it("flags stale when latest period is behind expected", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [rel] = await db
        .insert(schema.release)
        .values({
          sourceId: AU.sourceId,
          label: "old",
          releasedAt: new Date("2024-10-01T00:00:00Z"),
        })
        .returning({ id: schema.release.id });

      await db.insert(schema.obs).values({
        seriesId: AU.headline.id,
        releaseId: rel.id,
        period: "2024-09-01",
        value: "139.7",
      });

      const report = await checkFreshness(db, [AU.headline.id], {
        asOf: new Date("2025-02-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.issues[0]?.status).toBe("stale");
      expect(report.issues[0]?.latestPeriod).toBe("2024-09-01");
      expect(report.issues[0]?.monthsBehind).toBeGreaterThan(0);
      expect(report.ok).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("returns ok when latest period meets expected", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [rel] = await db
        .insert(schema.release)
        .values({
          sourceId: US.sourceId,
          label: "2025-01",
          releasedAt: new Date("2025-02-12T13:30:00Z"),
        })
        .returning({ id: schema.release.id });

      await db.insert(schema.obs).values({
        seriesId: US.series.allItems.id,
        releaseId: rel.id,
        period: "2025-01-01",
        value: "317.671",
      });

      const report = await checkFreshness(db, [US.series.allItems.id], {
        asOf: new Date("2025-02-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.issues[0]?.status).toBe("ok");
      expect(report.ok).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("marks report not ok when any of multiple series is stale or missing", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [rel] = await db
        .insert(schema.release)
        .values({
          sourceId: US.sourceId,
          label: "mixed",
          releasedAt: new Date("2025-02-12T13:30:00Z"),
        })
        .returning({ id: schema.release.id });

      await db.insert(schema.obs).values({
        seriesId: US.series.allItems.id,
        releaseId: rel.id,
        period: "2025-01-01",
        value: "317.671",
      });
      // food left missing; energy intentionally stale
      await db.insert(schema.obs).values({
        seriesId: US.series.energy.id,
        releaseId: rel.id,
        period: "2024-06-01",
        value: "250",
      });

      const report = await checkFreshness(
        db,
        [
          US.series.allItems.id,
          US.series.food.id,
          US.series.energy.id,
        ],
        {
          asOf: new Date("2025-02-15T00:00:00Z"),
          lagMonths: 1,
        },
      );
      expect(report.ok).toBe(false);
      const byId = Object.fromEntries(
        report.issues.map((i) => [i.seriesId, i.status]),
      );
      expect(byId[US.series.allItems.id]).toBe("ok");
      expect(byId[US.series.food.id]).toBe("missing");
      expect(byId[US.series.energy.id]).toBe("stale");
    } finally {
      await client.close();
    }
  });

  it("treats a newer-than-expected latest period as ok", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [rel] = await db
        .insert(schema.release)
        .values({
          sourceId: AU.sourceId,
          label: "ahead",
          releasedAt: new Date("2025-03-01T00:00:00Z"),
        })
        .returning({ id: schema.release.id });
      await db.insert(schema.obs).values({
        seriesId: AU.headline.id,
        releaseId: rel.id,
        period: "2025-02-01",
        value: "141.0",
      });
      const report = await checkFreshness(db, [AU.headline.id], {
        asOf: new Date("2025-02-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.expectedLatestPeriod).toBe("2025-01-01");
      expect(report.issues[0]?.status).toBe("ok");
      expect(report.issues[0]?.monthsBehind).toBe(0);
      expect(report.ok).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("honors lagMonths when computing expected latest period", async () => {
    expect(expectedLatestPeriod(new Date("2025-03-10T00:00:00Z"), 2)).toBe(
      "2025-01-01",
    );
    expect(expectedLatestPeriod(new Date("2025-01-15T00:00:00Z"), 2)).toBe(
      "2024-11-01",
    );
  });
});
