/**
 * Live UK ONS CPI fetch via timeseries JSON API (dataset MM23).
 *
 * Endpoint (no API key):
 *   GET https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/{cdid}/mm23/data
 *
 * CDIDs: D7BT all items, D7BU food, D7CH energy (04.5), DKC6 core index.
 * Legacy api.ons.gov.uk timeseries routes return 404 as of 2026-09.
 */
import { GB, GB_SERIES_LIST } from "../catalog/series-ids.js";
import type { UkOnsFixture, UkOnsSeriesFixture } from "./uk-ons-cpi.js";
import type { ObsPoint } from "./types.js";

export const ONS_TIMESERIES_BASE =
  "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries";
export const ONS_DATASET = "mm23";

const MONTH_NAME_TO_NUM: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

export type FetchUkOnsOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Keep observations on/after this YYYY-MM-01 (default ~10y lookback). */
  startPeriod?: string;
};

type OnsMonthRow = {
  date?: string;
  value?: string;
  year?: string;
  month?: string;
};

type OnsTimeseriesJson = {
  months?: OnsMonthRow[];
  description?: { cdid?: string; title?: string };
};

export function buildOnsTimeseriesUrl(cdid: string): string {
  return `${ONS_TIMESERIES_BASE}/${cdid.toLowerCase()}/${ONS_DATASET}/data`;
}

/** Map ONS month row → YYYY-MM-01. */
export function onsMonthToPeriod(row: OnsMonthRow): string | null {
  const year = row.year?.trim();
  const monthRaw = row.month?.trim();
  if (!year || !monthRaw) return null;
  const mm = MONTH_NAME_TO_NUM[monthRaw.toLowerCase()];
  if (!mm) return null;
  return `${year}-${mm}-01`;
}

export function parseOnsTimeseriesMonths(
  months: OnsMonthRow[],
  options?: { startPeriod?: string },
): ObsPoint[] {
  const byPeriod = new Map<string, number>();
  for (const row of months) {
    const period = onsMonthToPeriod(row);
    if (!period) continue;
    if (options?.startPeriod && period < options.startPeriod) continue;
    const raw = row.value?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    byPeriod.set(period, value);
  }
  const observations = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }));
  if (!observations.length) {
    throw new Error("ONS timeseries contained no monthly observations");
  }
  return observations;
}

function defaultStartPeriod(now: Date): string {
  return `${now.getUTCFullYear() - 10}-01-01`;
}

export async function fetchUkOnsCpiLive(
  options: FetchUkOnsOptions = {},
): Promise<
  UkOnsFixture & {
    fetchMeta: { endpointUsed: string; observationCount: number };
  }
> {
  const now = options.now ?? new Date();
  const startPeriod = options.startPeriod ?? defaultStartPeriod(now);
  const fetchImpl = options.fetchImpl ?? fetch;
  const series: UkOnsSeriesFixture[] = [];
  let observationCount = 0;
  let latestYm = "1970-01";

  for (const cat of GB_SERIES_LIST) {
    const url = buildOnsTimeseriesUrl(cat.nativeId);
    const res = await fetchImpl(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`ONS timeseries HTTP ${res.status} for ${cat.nativeId}`);
    }
    const json = (await res.json()) as OnsTimeseriesJson;
    const observations = parseOnsTimeseriesMonths(json.months ?? [], {
      startPeriod,
    });
    observationCount += observations.length;
    for (const o of observations) {
      const ym = o.period.slice(0, 7);
      if (ym > latestYm) latestYm = ym;
    }
    series.push({
      nativeId: cat.nativeId,
      title: cat.title,
      observations,
    });
  }

  return {
    source: GB.sourceId,
    releaseLabel: latestYm,
    releasedAt: now.toISOString(),
    series,
    fetchMeta: {
      endpointUsed: ONS_TIMESERIES_BASE,
      observationCount,
    },
  };
}
