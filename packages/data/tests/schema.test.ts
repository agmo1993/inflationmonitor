import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { AU, US, US_SERIES_LIST } from "../src/catalog/series-ids.js";
import { seedMeta } from "../src/db/seed-meta.js";
import * as schema from "../src/schema/index.js";
import { createTestDb } from "./helpers.js";

describe("schema invariants", () => {
  it("creates country, source, series, release, obs tables", async () => {
    const { db, client } = await createTestDb();
    try {
      const tables = await db.execute<{ tablename: string }>(sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      const names = (tables.rows ?? tables).map(
        (r: { tablename: string }) => r.tablename,
      );
      expect(names).toEqual(
        expect.arrayContaining([
          "country",
          "source",
          "series",
          "release",
          "obs",
        ]),
      );
    } finally {
      await client.close();
    }
  });

  it("enforces FK: source requires existing country", async () => {
    const { db, client } = await createTestDb();
    try {
      await expect(
        db.insert(schema.source).values({
          id: "orphan",
          countryCode: "ZZ",
          name: "Orphan",
        }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it("enforces unique (source_id, native_id) on series", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      await expect(
        db.insert(schema.series).values({
          id: "duplicate.native",
          sourceId: AU.sourceId,
          countryCode: AU.country,
          nativeId: AU.headline.nativeId,
          title: "dup",
          frequency: "monthly",
        }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it("enforces unique (series_id, period, release_id) on obs (vintage-safe)", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [rel] = await db
        .insert(schema.release)
        .values({
          sourceId: AU.sourceId,
          label: "2024-12",
          releasedAt: new Date("2025-01-29T00:00:00Z"),
        })
        .returning({ id: schema.release.id });

      await db.insert(schema.obs).values({
        seriesId: AU.headline.id,
        releaseId: rel.id,
        period: "2024-12-01",
        value: "140.5",
      });

      await expect(
        db.insert(schema.obs).values({
          seriesId: AU.headline.id,
          releaseId: rel.id,
          period: "2024-12-01",
          value: "140.6",
        }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it("allows two vintages for the same series period", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [r1] = await db
        .insert(schema.release)
        .values({
          sourceId: AU.sourceId,
          label: "2024-12-prelim",
          releasedAt: new Date("2025-01-29T00:00:00Z"),
        })
        .returning({ id: schema.release.id });
      const [r2] = await db
        .insert(schema.release)
        .values({
          sourceId: AU.sourceId,
          label: "2024-12-final",
          releasedAt: new Date("2025-02-01T00:00:00Z"),
        })
        .returning({ id: schema.release.id });

      await db.insert(schema.obs).values([
        {
          seriesId: AU.headline.id,
          releaseId: r1.id,
          period: "2024-12-01",
          value: "140.5",
        },
        {
          seriesId: AU.headline.id,
          releaseId: r2.id,
          period: "2024-12-01",
          value: "140.6",
        },
      ]);

      const rows = await db
        .select()
        .from(schema.obs)
        .where(
          and(
            eq(schema.obs.seriesId, AU.headline.id),
            eq(schema.obs.period, "2024-12-01"),
          ),
        );
      expect(rows).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it("seeds AU + US catalog with expected native ids", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const countries = await db.select().from(schema.country);
      expect(countries.map((c) => c.code).sort()).toEqual(["AU", "US"]);

      const au = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.id, AU.headline.id));
      expect(au[0]?.nativeId).toBe("A2325846C");

      const us = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.sourceId, US.sourceId));
      const native = us.map((s) => s.nativeId).sort();
      expect(native).toEqual(
        US_SERIES_LIST.map((s) => s.nativeId).sort(),
      );
    } finally {
      await client.close();
    }
  });

  it("enforces unique (source_id, label) on release", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      await db.insert(schema.release).values({
        sourceId: AU.sourceId,
        label: "2024-12",
        releasedAt: new Date("2025-01-29T00:00:00Z"),
      });
      await expect(
        db.insert(schema.release).values({
          sourceId: AU.sourceId,
          label: "2024-12",
          releasedAt: new Date("2025-01-30T00:00:00Z"),
        }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it("enforces FK: obs requires existing series", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const [rel] = await db
        .insert(schema.release)
        .values({
          sourceId: AU.sourceId,
          label: "fk-check",
          releasedAt: new Date("2025-01-01T00:00:00Z"),
        })
        .returning({ id: schema.release.id });
      await expect(
        db.insert(schema.obs).values({
          seriesId: "does.not.exist",
          releaseId: rel.id,
          period: "2024-12-01",
          value: "1",
        }),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it("seeds US series platform ids, NSA flag, and monthly frequency", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const expectedIds = [
        "us.bls.cpiu.all_items",
        "us.bls.cpiu.food",
        "us.bls.cpiu.energy",
        "us.bls.cpiu.all_items_less_food_energy",
        "us.bls.cpiu.shelter",
      ];
      const us = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.sourceId, US.sourceId));
      expect(us.map((s) => s.id).sort()).toEqual([...expectedIds].sort());
      for (const row of us) {
        expect(row.countryCode).toBe("US");
        expect(row.seasonallyAdjusted).toBe(false);
        expect(row.frequency).toBe("monthly");
        expect(row.unit).toBe("index");
      }
      const au = await db
        .select()
        .from(schema.series)
        .where(eq(schema.series.id, AU.headline.id));
      expect(au[0]?.countryCode).toBe("AU");
      expect(au[0]?.sourceId).toBe("abs");
      expect(au[0]?.frequency).toBe("monthly");
      expect(au[0]?.seasonallyAdjusted).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("seeds abs/bls sources bound to AU and US countries", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const sources = await db.select().from(schema.source);
      const byId = Object.fromEntries(sources.map((s) => [s.id, s]));
      expect(byId.abs?.countryCode).toBe("AU");
      expect(byId.bls?.countryCode).toBe("US");
    } finally {
      await client.close();
    }
  });
});
