import { desc, eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../schema/index.js";

type AnyDb =
  | PostgresJsDatabase<typeof schema>
  | PgliteDatabase<typeof schema>;

export type FreshnessStatus = "ok" | "stale" | "missing";

export type FreshnessIssue = {
  seriesId: string;
  status: FreshnessStatus;
  latestPeriod: string | null;
  expectedLatestPeriod: string;
  monthsBehind: number | null;
};

export type FreshnessReport = {
  asOf: string;
  expectedLatestPeriod: string;
  issues: FreshnessIssue[];
  ok: boolean;
};

/** First day of calendar month for a Date (UTC). */
export function monthStartUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * CPI monthly series typically lag ~1 month after period end.
 * As-of mid-month M, expected latest published period is usually M-2
 * (conservative) or M-1 once the release is out.
 *
 * We use: expected = first day of (asOf UTC month minus `lagMonths`).
 * Default lagMonths=1 means if today is 2025-02-15, expected latest is 2025-01-01.
 */
export function expectedLatestPeriod(
  asOf: Date,
  lagMonths = 1,
): string {
  const d = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - lagMonths, 1),
  );
  return monthStartUtc(d);
}

function monthsBetween(earlier: string, later: string): number {
  const [ey, em] = earlier.split("-").map(Number);
  const [ly, lm] = later.split("-").map(Number);
  return (ly - ey) * 12 + (lm - em);
}

/**
 * Check freshness for the given series ids.
 * - missing: no obs at all
 * - stale: latest period older than expectedLatestPeriod
 * - ok: latest period >= expected
 */
export async function checkFreshness(
  db: AnyDb,
  seriesIds: string[],
  options?: { asOf?: Date; lagMonths?: number },
): Promise<FreshnessReport> {
  const asOf = options?.asOf ?? new Date();
  const lagMonths = options?.lagMonths ?? 1;
  const expected = expectedLatestPeriod(asOf, lagMonths);
  const issues: FreshnessIssue[] = [];

  for (const seriesId of seriesIds) {
    const rows = await db
      .select({
        period: schema.obs.period,
      })
      .from(schema.obs)
      .where(eq(schema.obs.seriesId, seriesId))
      .orderBy(desc(schema.obs.period))
      .limit(1);

    const latestPeriod = rows[0]?.period ?? null;

    if (latestPeriod == null) {
      issues.push({
        seriesId,
        status: "missing",
        latestPeriod: null,
        expectedLatestPeriod: expected,
        monthsBehind: null,
      });
      continue;
    }

    const behind = monthsBetween(latestPeriod, expected);
    if (behind > 0) {
      issues.push({
        seriesId,
        status: "stale",
        latestPeriod,
        expectedLatestPeriod: expected,
        monthsBehind: behind,
      });
    } else {
      issues.push({
        seriesId,
        status: "ok",
        latestPeriod,
        expectedLatestPeriod: expected,
        monthsBehind: 0,
      });
    }
  }

  return {
    asOf: asOf.toISOString(),
    expectedLatestPeriod: expected,
    issues,
    ok: issues.every((i) => i.status === "ok"),
  };
}

