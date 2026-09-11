/**
 * Live US BLS CPI-U (NSA) fetch.
 *
 * Primary: POST https://api.bls.gov/publicAPI/v2/timeseries/data/
 *   Optional BLS_API_KEY / registrationkey when present.
 *
 * Fallback (when API quota exhausted or blocked): parse official
 * data.bls.gov HTML series tables (output_view=data).
 */
import { US, US_SERIES_LIST } from "../catalog/series-ids.js";
import type { UsBlsFixture, UsBlsSeriesFixture } from "./us-bls-cpi.js";
import type { ObsPoint } from "./types.js";

export const BLS_API_URL =
  "https://api.bls.gov/publicAPI/v2/timeseries/data/";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type FetchUsBlsOptions = {
  startYear?: number;
  endYear?: number;
  registrationKey?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Force HTML fallback (tests / ops). */
  preferHtml?: boolean;
};

type BlsApiDatum = {
  year: string;
  period: string;
  value: string;
};

type BlsApiSeries = {
  seriesID: string;
  data?: BlsApiDatum[];
};

function resolveKey(explicit?: string): string | undefined {
  return (
    explicit ||
    process.env.BLS_API_KEY ||
    process.env.BLS_REGISTRATION_KEY ||
    undefined
  );
}

function defaultStartYear(now: Date): number {
  return now.getUTCFullYear() - 10;
}

/** Convert BLS period M01..M12 + year → YYYY-MM-01. */
export function blsPeriodToDate(year: string, period: string): string | null {
  const m = /^M(\d{2})$/.exec(period);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function parseBlsApiSeriesData(data: BlsApiDatum[]): ObsPoint[] {
  const byPeriod = new Map<string, number>();
  for (const item of data) {
    const period = blsPeriodToDate(item.year, item.period);
    if (!period) continue;
    const value = Number(item.value);
    if (!Number.isFinite(value)) continue;
    byPeriod.set(period, value);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }));
}

/**
 * Parse BLS data.bls.gov HTML year×month index table into ObsPoint[].
 * Skips blank cells and placeholders like -(X).
 */
export function parseBlsHtmlSeriesTable(html: string): ObsPoint[] {
  const byPeriod = new Map<string, number>();
  const rowRe =
    /<TH\s+scope="row">(\d{4})<\/TH>((?:<TD[^>]*>[\s\S]*?<\/TD>)+)/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html)) !== null) {
    const year = match[1]!;
    const cellsHtml = match[2]!;
    const cells = [...cellsHtml.matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gi)].map(
      (m) =>
        m[1]!
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/gi, "")
          .replace(/\u00a0/g, "")
          .trim(),
    );
    // First 12 cells are Jan–Dec; extras may be HALF1/HALF2 or annual avg.
    for (let i = 0; i < 12; i++) {
      const raw = cells[i];
      if (!raw) continue;
      if (/[A-Za-z()]/.test(raw)) continue; // skip -(X), footnotes text
      const value = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      const period = `${year}-${String(i + 1).padStart(2, "0")}-01`;
      byPeriod.set(period, value);
    }
  }
  const observations = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }));
  if (!observations.length) {
    throw new Error("BLS HTML contained no monthly index observations");
  }
  return observations;
}

async function fetchViaApi(
  seriesIds: string[],
  options: FetchUsBlsOptions,
): Promise<{ series: UsBlsSeriesFixture[]; source: "api" }> {
  const now = options.now ?? new Date();
  const startyear = String(options.startYear ?? defaultStartYear(now));
  const endyear = String(options.endYear ?? now.getUTCFullYear());
  const body: Record<string, unknown> = {
    seriesid: seriesIds,
    startyear,
    endyear,
  };
  const key = resolveKey(options.registrationKey);
  if (key) body.registrationkey = key;

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(BLS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`BLS API HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    status?: string;
    message?: string[];
    Results?: { series?: BlsApiSeries[] };
  };
  if (json.status !== "REQUEST_SUCCEEDED") {
    const msg = (json.message ?? []).join("; ") || json.status || "unknown";
    throw new Error(`BLS API failed: ${msg}`);
  }
  const apiSeries = json.Results?.series ?? [];
  const titleByNative = new Map(
    US_SERIES_LIST.map((s) => [s.nativeId, s.title] as const),
  );
  const series: UsBlsSeriesFixture[] = [];
  for (const nativeId of seriesIds) {
    const found = apiSeries.find((s) => s.seriesID === nativeId);
    if (!found) {
      throw new Error(`BLS API missing series ${nativeId}`);
    }
    const observations = parseBlsApiSeriesData(found.data ?? []);
    if (!observations.length) {
      throw new Error(`BLS API series ${nativeId} has no monthly data`);
    }
    series.push({
      nativeId,
      title: titleByNative.get(nativeId) ?? nativeId,
      observations,
    });
  }
  return { series, source: "api" };
}

async function fetchViaHtml(
  seriesIds: string[],
  options: FetchUsBlsOptions,
): Promise<{ series: UsBlsSeriesFixture[]; source: "html" }> {
  const now = options.now ?? new Date();
  const fromYear = options.startYear ?? defaultStartYear(now);
  const toYear = options.endYear ?? now.getUTCFullYear();
  const fetchImpl = options.fetchImpl ?? fetch;
  const titleByNative = new Map(
    US_SERIES_LIST.map((s) => [s.nativeId, s.title] as const),
  );
  const series: UsBlsSeriesFixture[] = [];

  for (const nativeId of seriesIds) {
    const url =
      `https://data.bls.gov/timeseries/${nativeId}` +
      `?years_option=specific_years&from_year=${fromYear}&to_year=${toYear}` +
      `&periods_option=all_periods&output_view=data`;
    const res = await fetchImpl(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "InflationMonitor/0.1 (+live CPI loader)",
      },
    });
    if (!res.ok) {
      throw new Error(`BLS HTML HTTP ${res.status} for ${nativeId}`);
    }
    const html = await res.text();
    const observations = parseBlsHtmlSeriesTable(html);
    series.push({
      nativeId,
      title: titleByNative.get(nativeId) ?? nativeId,
      observations,
    });
  }
  return { series, source: "html" };
}

export async function fetchUsBlsCpiLive(
  options: FetchUsBlsOptions = {},
): Promise<
  UsBlsFixture & {
    fetchMeta: { source: "api" | "html"; observationCount: number };
  }
> {
  const now = options.now ?? new Date();
  const seriesIds = US_SERIES_LIST.map((s) => s.nativeId);
  let series: UsBlsSeriesFixture[];
  let source: "api" | "html";

  if (options.preferHtml) {
    ({ series, source } = await fetchViaHtml(seriesIds, options));
  } else {
    try {
      ({ series, source } = await fetchViaApi(seriesIds, options));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Quota / threshold → official HTML tables
      if (/threshold|quota|REQUEST_NOT_PROCESSED|failed/i.test(reason)) {
        ({ series, source } = await fetchViaHtml(seriesIds, options));
      } else {
        throw err;
      }
    }
  }

  let latestYm = "1970-01";
  let observationCount = 0;
  for (const s of series) {
    observationCount += s.observations.length;
    for (const o of s.observations) {
      const ym = o.period.slice(0, 7);
      if (ym > latestYm) latestYm = ym;
    }
  }

  return {
    source: US.sourceId,
    releaseLabel: latestYm,
    releasedAt: now.toISOString(),
    series,
    fetchMeta: { source, observationCount },
  };
}

/** Exported for tests / docs — month labels used by HTML tables. */
export const BLS_HTML_MONTH_LABELS = MONTHS;
