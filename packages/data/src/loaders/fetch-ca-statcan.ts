/**
 * Live Canada StatCan CPI fetch via Web Data Service (WDS) JSON API.
 *
 * Endpoint (no API key):
 *   POST https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorsAndLatestNPeriods
 *   Body: [{ "vectorId": 41690973, "latestN": 120 }, ...]
 *
 * Table 18-10-0004-01 vectors (Canada geography):
 *   v41690973 all-items, v41690974 food, v41691050 shelter, v41691239 energy.
 *
 * Alternate range endpoint:
 *   POST .../getDataFromVectorByReferencePeriodRange
 */
import { CA, CA_SERIES_LIST } from "../catalog/series-ids.js";
import type {
  CaStatcanFixture,
  CaStatcanSeriesFixture,
} from "./ca-statcan-cpi.js";
import type { ObsPoint } from "./types.js";

export const STATCAN_WDS_BASE = "https://www150.statcan.gc.ca/t1/wds/rest";
export const STATCAN_VECTORS_LATEST_N_URL = `${STATCAN_WDS_BASE}/getDataFromVectorsAndLatestNPeriods`;

export type FetchCaStatcanOptions = {
  latestN?: number;
  fetchImpl?: typeof fetch;
  now?: Date;
};

type WdsPoint = {
  refPer?: string;
  value?: number | string | null;
};

type WdsVectorObject = {
  vectorId?: number;
  vectorDataPoint?: WdsPoint[];
};

type WdsResponseRow = {
  status?: string;
  object?: WdsVectorObject | string;
};

/** Strip leading `v` from catalog native ids → numeric vectorId. */
export function nativeIdToVectorId(nativeId: string): number {
  const m = /^v?(\d+)$/i.exec(nativeId.trim());
  if (!m) throw new Error(`Invalid StatCan vector id ${nativeId}`);
  return Number(m[1]);
}

/** Parse WDS vectorDataPoint[] into ObsPoint[] (refPer YYYY-MM-DD → period). */
export function parseStatcanVectorPoints(points: WdsPoint[]): ObsPoint[] {
  const byPeriod = new Map<string, number>();
  for (const p of points) {
    const ref = p.refPer?.trim();
    if (!ref) continue;
    // Prefer first-of-month; WDS usually returns YYYY-MM-01.
    let period: string;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) {
      period = `${ref.slice(0, 7)}-01`;
    } else if (/^\d{4}-\d{2}$/.test(ref)) {
      period = `${ref}-01`;
    } else {
      continue;
    }
    if (p.value == null || p.value === "") continue;
    const value = Number(p.value);
    if (!Number.isFinite(value)) continue;
    byPeriod.set(period, value);
  }
  const observations = [...byPeriod.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }));
  if (!observations.length) {
    throw new Error("StatCan WDS response contained no monthly observations");
  }
  return observations;
}

export async function fetchCaStatcanCpiLive(
  options: FetchCaStatcanOptions = {},
): Promise<
  CaStatcanFixture & {
    fetchMeta: { endpointUsed: string; observationCount: number };
  }
> {
  const now = options.now ?? new Date();
  const latestN = options.latestN ?? 120;
  const fetchImpl = options.fetchImpl ?? fetch;

  const body = CA_SERIES_LIST.map((s) => ({
    vectorId: nativeIdToVectorId(s.nativeId),
    latestN,
  }));

  const res = await fetchImpl(STATCAN_VECTORS_LATEST_N_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`StatCan WDS HTTP ${res.status}`);
  }

  const json = (await res.json()) as WdsResponseRow[];
  if (!Array.isArray(json)) {
    throw new Error("StatCan WDS returned non-array response");
  }

  const byVector = new Map<number, WdsVectorObject>();
  for (const row of json) {
    if (row.status && row.status !== "SUCCESS") {
      throw new Error(`StatCan WDS status ${row.status}`);
    }
    if (!row.object || typeof row.object === "string") {
      throw new Error(
        `StatCan WDS missing object: ${typeof row.object === "string" ? row.object : "null"}`,
      );
    }
    if (row.object.vectorId != null) {
      byVector.set(row.object.vectorId, row.object);
    }
  }

  const series: CaStatcanSeriesFixture[] = [];
  let observationCount = 0;
  let latestYm = "1970-01";

  for (const cat of CA_SERIES_LIST) {
    const vid = nativeIdToVectorId(cat.nativeId);
    const obj = byVector.get(vid);
    if (!obj) {
      throw new Error(`StatCan WDS missing vector ${cat.nativeId}`);
    }
    const observations = parseStatcanVectorPoints(obj.vectorDataPoint ?? []);
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
    source: CA.sourceId,
    releaseLabel: latestYm,
    releasedAt: now.toISOString(),
    series,
    fetchMeta: {
      endpointUsed: STATCAN_VECTORS_LATEST_N_URL,
      observationCount,
    },
  };
}
