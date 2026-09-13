/**
 * Live Eurostat HICP fetch via SDMX 2.1 REST (TSV).
 *
 * Dataflow: prc_hicp_midx (monthly index; archived ECOICOP through 2025,
 * still served for historical I15 series as of 2026-09).
 *
 * Endpoint (no API key):
 *   GET https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/prc_hicp_midx/
 *       M.I15.CP00.EU27_2020+EA20?format=TSV&startPeriod=YYYY-MM
 *
 * Geo notes:
 *   - EU27_2020 = EU27 aggregate (not bare "EU")
 *   - EA20 = euro area 20 (not EA19)
 *   - Unit I15 = index 2015=100; COICOP CP00 = all-items
 */
import {
  EA,
  EU,
  EU_HICP_SERIES_LIST,
} from "../catalog/series-ids.js";
import type { EuHicpFixture, EuHicpSeriesFixture } from "./eu-hicp.js";
import type { ObsPoint } from "./types.js";

export const EUROSTAT_SDMX_DATA_BASE =
  "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data";
export const EUROSTAT_HICP_DATAFLOW = "prc_hicp_midx";
export const EUROSTAT_HICP_KEY_PREFIX = "M.I15.CP00";

export type FetchEuHicpOptions = {
  startPeriod?: string; // YYYY-MM
  fetchImpl?: typeof fetch;
  now?: Date;
};

function yearMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function defaultStartPeriod(now: Date): string {
  return `${now.getUTCFullYear() - 10}-01`;
}

/** Extract geo code from native id `prc_hicp_midx.M.I15.CP00.GEO`. */
export function geoFromNativeId(nativeId: string): string {
  const parts = nativeId.split(".");
  const geo = parts[parts.length - 1];
  if (!geo) throw new Error(`Cannot parse geo from ${nativeId}`);
  return geo;
}

export function buildEurostatHicpUrl(options: {
  geos: string[];
  startPeriod: string;
}): string {
  const key = `${EUROSTAT_HICP_KEY_PREFIX}.${options.geos.join("+")}`;
  const params = new URLSearchParams({
    format: "TSV",
    startPeriod: options.startPeriod,
  });
  return `${EUROSTAT_SDMX_DATA_BASE}/${EUROSTAT_HICP_DATAFLOW}/${key}?${params}`;
}

/**
 * Parse Eurostat SDMX TSV (wide time columns) into Map<geo, ObsPoint[]>.
 * Header: freq,unit,coicop,geo\TIME_PERIOD\tYYYY-MM\t...
 */
export function parseEurostatHicpTsv(
  tsvText: string,
): Map<string, ObsPoint[]> {
  const lines = tsvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("Eurostat HICP TSV empty or missing header");
  }
  const header = lines[0]!.split("\t").map((c) => c.trim());
  // First column is dimension key; remaining are TIME_PERIOD labels.
  const timeLabels = header.slice(1);
  const byGeo = new Map<string, ObsPoint[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split("\t").map((c) => c.trim());
    if (!cols.length) continue;
    const dim = cols[0] ?? "";
    // dim like "M,I15,CP00,EU27_2020"
    const parts = dim.split(",");
    const geo = parts[parts.length - 1]?.trim();
    if (!geo) continue;
    const obs: ObsPoint[] = [];
    for (let t = 0; t < timeLabels.length; t++) {
      const ym = timeLabels[t]!;
      if (!/^\d{4}-\d{2}$/.test(ym)) continue;
      const raw = cols[t + 1]?.replace(/[^0-9.\-]/g, "") ?? "";
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) continue;
      obs.push({ period: `${ym}-01`, value });
    }
    if (!obs.length) continue;
    obs.sort((a, b) => a.period.localeCompare(b.period));
    byGeo.set(geo, obs);
  }

  if (!byGeo.size) {
    throw new Error("Eurostat HICP TSV contained no monthly observations");
  }
  return byGeo;
}

export async function fetchEuHicpLive(
  options: FetchEuHicpOptions = {},
): Promise<
  EuHicpFixture & {
    fetchMeta: { endpointUsed: string; observationCount: number };
  }
> {
  const now = options.now ?? new Date();
  const startPeriod = options.startPeriod ?? defaultStartPeriod(now);
  const geos = EU_HICP_SERIES_LIST.map((s) => geoFromNativeId(s.nativeId));
  const url = buildEurostatHicpUrl({ geos, startPeriod });
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(url, {
    headers: { Accept: "text/tab-separated-values,text/plain" },
  });
  if (!res.ok) {
    throw new Error(`Eurostat SDMX HTTP ${res.status} for ${url}`);
  }
  const tsv = await res.text();
  const byGeo = parseEurostatHicpTsv(tsv);

  const titleByNative = new Map(
    EU_HICP_SERIES_LIST.map((s) => [s.nativeId, s.title] as const),
  );
  const series: EuHicpSeriesFixture[] = [];
  let observationCount = 0;
  let latestYm = "1970-01";

  for (const cat of EU_HICP_SERIES_LIST) {
    const geo = geoFromNativeId(cat.nativeId);
    const observations = byGeo.get(geo);
    if (!observations?.length) {
      throw new Error(`Eurostat HICP missing geo ${geo}`);
    }
    observationCount += observations.length;
    for (const o of observations) {
      const ym = o.period.slice(0, 7);
      if (ym > latestYm) latestYm = ym;
    }
    series.push({
      nativeId: cat.nativeId,
      title: titleByNative.get(cat.nativeId) ?? cat.title,
      observations,
    });
  }

  return {
    source: EU.sourceId,
    releaseLabel: latestYm,
    releasedAt: now.toISOString(),
    series,
    fetchMeta: {
      endpointUsed: url.split("?")[0]!,
      observationCount,
    },
  };
}

/** Exported for docs — maps platform geo aggregates we load. */
export const EUROSTAT_GEOS = {
  eu27: geoFromNativeId(EU.series.allItems.nativeId),
  ea20: geoFromNativeId(EA.series.allItems.nativeId),
} as const;
