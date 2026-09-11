/**
 * Live AU ABS CPI fetch via SDMX Data API.
 *
 * Classic series id A2325846C (All groups CPI ; Australia) maps to SDMX
 * data key 1.10001.10.50.M on dataflow ABS,CPI (monthly index, Australia).
 *
 * Endpoint that works (2026-09):
 *   GET https://data.api.abs.gov.au/rest/data/ABS,CPI,2.0.0/1.10001.10.50.M
 *       ?startPeriod=YYYY-MM&endPeriod=YYYY-MM&format=csvfilewithlabels
 *
 * Legacy host api.data.abs.gov.au no longer resolves.
 */
import { AU } from "../catalog/series-ids.js";
import type { AuAbsFixture } from "./au-abs-cpi.js";
import type { ObsPoint } from "./types.js";

export const ABS_CPI_SDMX_DATA_KEY = "1.10001.10.50.M";
export const ABS_CPI_DATAFLOW = "ABS,CPI,2.0.0";
export const ABS_DATA_API_BASE = "https://data.api.abs.gov.au/rest/data";

export type FetchAuAbsOptions = {
  startPeriod?: string; // YYYY-MM
  endPeriod?: string; // YYYY-MM
  fetchImpl?: typeof fetch;
  now?: Date;
};

function yearMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function defaultStartPeriod(now: Date): string {
  const y = now.getUTCFullYear() - 10;
  return `${y}-01`;
}

/** Parse ABS csvfilewithlabels CSV into monthly ObsPoint[] (YYYY-MM-01). */
export function parseAbsCpiCsv(csvText: string): ObsPoint[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error("ABS CPI CSV empty or missing header");
  }
  const header = splitCsvLine(lines[0]!);
  const idxTime = header.indexOf("TIME_PERIOD");
  const idxVal = header.indexOf("OBS_VALUE");
  const idxIndex = header.indexOf("INDEX");
  const idxMeasure = header.indexOf("MEASURE");
  const idxFreq = header.indexOf("FREQ");
  if (idxTime < 0 || idxVal < 0) {
    throw new Error(`ABS CPI CSV missing TIME_PERIOD/OBS_VALUE columns: ${header.join(",")}`);
  }

  const byPeriod = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (idxIndex >= 0 && cols[idxIndex] !== "10001") continue;
    if (idxMeasure >= 0 && cols[idxMeasure] !== "1") continue;
    if (idxFreq >= 0 && cols[idxFreq] !== "M") continue;
    const time = cols[idxTime]?.trim();
    const raw = cols[idxVal]?.trim();
    if (!time || !raw) continue;
    // Monthly periods are YYYY-MM; skip quarterly YYYY-Qn
    if (!/^\d{4}-\d{2}$/.test(time)) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    byPeriod.set(time, value);
  }

  const observations = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, value]) => ({ period: `${ym}-01`, value }));

  if (!observations.length) {
    throw new Error("ABS CPI CSV contained no monthly observations");
  }
  return observations;
}

/** Minimal RFC4180-ish CSV split (handles quoted commas). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function buildAbsCpiUrl(options: {
  startPeriod: string;
  endPeriod: string;
}): string {
  const params = new URLSearchParams({
    startPeriod: options.startPeriod,
    endPeriod: options.endPeriod,
    format: "csvfilewithlabels",
  });
  return `${ABS_DATA_API_BASE}/${ABS_CPI_DATAFLOW}/${ABS_CPI_SDMX_DATA_KEY}?${params}`;
}

/**
 * Fetch live ABS monthly All groups CPI and return AuAbsFixture-shaped payload.
 * Documents fetchMeta.endpointUsed for ops.
 */
export async function fetchAuAbsCpiLive(
  options: FetchAuAbsOptions = {},
): Promise<AuAbsFixture & { fetchMeta: { endpointUsed: string; observationCount: number } }> {
  const now = options.now ?? new Date();
  const startPeriod = options.startPeriod ?? defaultStartPeriod(now);
  const endPeriod = options.endPeriod ?? yearMonth(now);
  const url = buildAbsCpiUrl({ startPeriod, endPeriod });
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(url, {
    headers: { Accept: "text/csv,application/json" },
  });
  if (!res.ok) {
    throw new Error(`ABS Data API HTTP ${res.status} for ${url}`);
  }
  const csvText = await res.text();
  const observations = parseAbsCpiCsv(csvText);
  const latestYm = observations[observations.length - 1]!.period.slice(0, 7);

  const payload: AuAbsFixture & {
    fetchMeta: { endpointUsed: string; observationCount: number };
  } = {
    source: AU.sourceId,
    seriesNativeId: AU.headline.nativeId,
    seriesTitle: AU.headline.title,
    releaseLabel: latestYm,
    releasedAt: now.toISOString(),
    observations,
    fetchMeta: {
      endpointUsed: url.split("?")[0]!,
      observationCount: observations.length,
    },
  };
  return payload;
}
