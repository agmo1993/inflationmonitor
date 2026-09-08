import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** ISO country codes (AU, US, …). Multi-country from day one. */
export const country = pgTable("country", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
});

/** Statistical agency / publisher (ABS, BLS, …). */
export const source = pgTable("source", {
  id: text("id").primaryKey(),
  countryCode: text("country_code")
    .notNull()
    .references(() => country.code),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url"),
});

/**
 * A publishable CPI (or related) time series.
 * id is stable platform id; nativeId is the agency series identifier.
 */
export const series = pgTable(
  "series",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id),
    countryCode: text("country_code")
      .notNull()
      .references(() => country.code),
    nativeId: text("native_id").notNull(),
    title: text("title").notNull(),
    frequency: text("frequency").notNull(), // monthly | quarterly
    unit: text("unit").notNull().default("index"),
    seasonallyAdjusted: boolean("seasonally_adjusted").notNull().default(false),
  },
  (t) => [
    uniqueIndex("series_source_native_uidx").on(t.sourceId, t.nativeId),
    index("series_country_idx").on(t.countryCode),
  ],
);

/**
 * A publication event / vintage for a source.
 * Obs are keyed to a release so revisions are preserved.
 */
export const release = pgTable(
  "release",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sourceId: text("source_id")
      .notNull()
      .references(() => source.id),
    label: text("label").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("release_source_label_uidx").on(t.sourceId, t.label)],
);

/** Observation for a series at a period, as of a release/vintage. */
export const obs = pgTable(
  "obs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id),
    releaseId: integer("release_id")
      .notNull()
      .references(() => release.id),
    /** First day of the reference period (month or quarter). */
    period: date("period").notNull(),
    value: numeric("value", { precision: 18, scale: 6 }).notNull(),
  },
  (t) => [
    uniqueIndex("obs_series_period_release_uidx").on(
      t.seriesId,
      t.period,
      t.releaseId,
    ),
    index("obs_series_period_idx").on(t.seriesId, t.period),
  ],
);

export type Country = typeof country.$inferSelect;
export type Source = typeof source.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Release = typeof release.$inferSelect;
export type Obs = typeof obs.$inferSelect;
