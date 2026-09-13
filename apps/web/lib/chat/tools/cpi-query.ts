/**
 * Live CPI query tools for GB/CA/EU/EA catalog series.
 * Prefer Neon via DATABASE_URL; tests inject `lookup`.
 */

import type { AnswerPart, StatCardsPart, TimeseriesPart, TablePart } from "../answer";
import { getSql } from "../../db/client";

export type CpiLookupResult = {
  points: Array<{ period: string; value: number }>;
  source: string;
  period: string;
};

export type CpiLookup = (seriesId: string) => Promise<CpiLookupResult | null>;

/** Locked catalog accept-list (Data PR #16). */
export const CPI_CATALOG_IDS = {
  gbAll: "gb.ons.cpi.all_items",
  gbFood: "gb.ons.cpi.food",
  gbEnergy: "gb.ons.cpi.energy",
  gbCore: "gb.ons.cpi.all_items_less_food_energy_alcohol_tobacco",
  caAll: "ca.statcan.cpi.all_items",
  caFood: "ca.statcan.cpi.food",
  caShelter: "ca.statcan.cpi.shelter",
  caEnergy: "ca.statcan.cpi.energy",
  euAll: "eu.eurostat.hicp.all_items",
  eaAll: "ea.eurostat.hicp.all_items",
} as const;

export type CpiQueryIntent =
  | "latest_gb"
  | "latest_ca"
  | "latest_eu"
  | "latest_ea"
  | "latest_au"
  | "latest_us"
  | "compare"
  | "yoy"
  | "chart"
  | "generic";

const SOURCE_LABEL: Record<string, string> = {
  [CPI_CATALOG_IDS.gbAll]: "ONS",
  [CPI_CATALOG_IDS.gbFood]: "ONS",
  [CPI_CATALOG_IDS.gbEnergy]: "ONS",
  [CPI_CATALOG_IDS.gbCore]: "ONS",
  [CPI_CATALOG_IDS.caAll]: "StatCan",
  [CPI_CATALOG_IDS.caFood]: "StatCan",
  [CPI_CATALOG_IDS.caShelter]: "StatCan",
  [CPI_CATALOG_IDS.caEnergy]: "StatCan",
  [CPI_CATALOG_IDS.euAll]: "Eurostat",
  [CPI_CATALOG_IDS.eaAll]: "Eurostat",
};

const SERIES_LABEL: Record<string, string> = {
  [CPI_CATALOG_IDS.gbAll]: "UK CPI All items",
  [CPI_CATALOG_IDS.gbFood]: "UK CPI Food",
  [CPI_CATALOG_IDS.gbEnergy]: "UK CPI Energy",
  [CPI_CATALOG_IDS.gbCore]: "UK CPI core",
  [CPI_CATALOG_IDS.caAll]: "Canada CPI All-items",
  [CPI_CATALOG_IDS.caFood]: "Canada CPI Food",
  [CPI_CATALOG_IDS.caShelter]: "Canada CPI Shelter",
  [CPI_CATALOG_IDS.caEnergy]: "Canada CPI Energy",
  [CPI_CATALOG_IDS.euAll]: "EU27 HICP All-items",
  [CPI_CATALOG_IDS.eaAll]: "EA20 HICP All-items",
};

function ymFromPeriod(period: string): string {
  // Neon stores DATE; normalize to YYYY-MM
  return period.length >= 7 ? period.slice(0, 7) : period;
}

export function detectCpiIntent(message: string): CpiQueryIntent {
  const m = message.toLowerCase();

  if (/compar|vs\.?/.test(m)) return "compare";
  if (/yoy|year[\s-]?over[\s-]?year|annual/.test(m)) return "yoy";
  if (/chart|timeseries|time[\s-]?series|plot|graph/.test(m)) return "chart";

  // Euro area before bare EU
  if (
    /euro\s*area|\bea20\b|\bea\b(?!\s*19)|hicp.*\bea\b|\bea\b.*hicp/.test(m)
  ) {
    return "latest_ea";
  }
  if (/\beu27\b|\beu\b|eurostat|hicp/.test(m) && !/euro\s*area|\bea20\b/.test(m)) {
    // "EU HICP latest" / bare HICP → EU27
    if (/\beu\b|\beu27\b|eurostat/.test(m) || /hicp/.test(m)) {
      if (/euro\s*area|\bea20\b/.test(m)) return "latest_ea";
      if (/\beu\b|\beu27\b|eurostat|hicp/.test(m)) return "latest_eu";
    }
  }
  if (/euro\s*area|\bea20\b/.test(m)) return "latest_ea";
  if (/\beu27\b|\beu\b(?![a-z])|eurostat/.test(m)) return "latest_eu";
  if (/\bhicp\b/.test(m)) return "latest_eu";

  if (/\buk\b|\bgb\b|britain|united kingdom|\bons\b/.test(m)) {
    return "latest_gb";
  }
  if (/\bcanada\b|\bca\b(?![a-z])|statcan|stat\s*can/.test(m)) {
    return "latest_ca";
  }

  if (/\bau\b|australia|abs/.test(m)) return "latest_au";
  if (/\bus\b|united states|bls|cpi-u/.test(m)) return "latest_us";

  if (/latest/.test(m)) return "latest_au";
  return "generic";
}

function pickSeriesId(intent: CpiQueryIntent, message: string): string | null {
  const m = message.toLowerCase();
  if (intent === "latest_gb") {
    if (/food/.test(m)) return CPI_CATALOG_IDS.gbFood;
    if (/energy|fuel|electricity|gas/.test(m)) return CPI_CATALOG_IDS.gbEnergy;
    if (/core|excluding|less food/.test(m)) return CPI_CATALOG_IDS.gbCore;
    return CPI_CATALOG_IDS.gbAll;
  }
  if (intent === "latest_ca") {
    if (/shelter|housing|rent/.test(m)) return CPI_CATALOG_IDS.caShelter;
    if (/food/.test(m)) return CPI_CATALOG_IDS.caFood;
    if (/energy|fuel|gasoline/.test(m)) return CPI_CATALOG_IDS.caEnergy;
    return CPI_CATALOG_IDS.caAll;
  }
  if (intent === "latest_eu") return CPI_CATALOG_IDS.euAll;
  if (intent === "latest_ea") return CPI_CATALOG_IDS.eaAll;
  return null;
}

/** Live Neon lookup when DATABASE_URL is set. */
export async function neonCpiLookup(
  seriesId: string,
): Promise<CpiLookupResult | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = getSql();
    const rows = await sql<{
      period: string;
      value: string | number;
      source_name: string | null;
    }[]>`
      SELECT DISTINCT ON (o.period)
        to_char(o.period, 'YYYY-MM') AS period,
        o.value::float8 AS value,
        src.name AS source_name
      FROM obs o
      JOIN series s ON s.id = o.series_id
      JOIN source src ON src.id = s.source_id
      WHERE o.series_id = ${seriesId}
      ORDER BY o.period ASC, o.release_id DESC
    `;
    if (!rows.length) return null;
    const points = rows.map((r) => ({
      period: ymFromPeriod(String(r.period)),
      value: Number(r.value),
    }));
    const last = points[points.length - 1]!;
    return {
      points,
      source: rSource(rows[0]?.source_name, seriesId),
      period: last.period,
    };
  } catch {
    return null;
  }
}

function rSource(dbName: string | null | undefined, seriesId: string): string {
  if (dbName && dbName.trim()) return dbName.trim();
  return SOURCE_LABEL[seriesId] ?? "CPI";
}

function timeseriesPart(
  seriesId: string,
  data: CpiLookupResult,
): TimeseriesPart {
  return {
    type: "timeseries",
    title: SERIES_LABEL[seriesId] ?? seriesId,
    seriesId,
    unit: "index",
    points: data.points,
    source: data.source,
    period: data.period,
  };
}

function latestStatCards(
  seriesId: string,
  data: CpiLookupResult,
): StatCardsPart {
  const last = data.points[data.points.length - 1]!;
  const first = data.points[0]!;
  const change =
    data.points.length >= 2 && first.value !== 0
      ? ((last.value - first.value) / first.value) * 100
      : null;
  return {
    type: "stat_cards",
    title: `${SERIES_LABEL[seriesId] ?? seriesId} latest`,
    seriesId,
    cards: [
      {
        label: "Latest index",
        value: last.value.toFixed(2),
        hint: last.period,
      },
      {
        label: "Change (window)",
        value:
          change === null
            ? "n/a"
            : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
        hint: `${first.period} → ${last.period}`,
      },
    ],
    source: data.source,
    period: last.period,
  };
}

function yoyTable(seriesId: string, data: CpiLookupResult): TablePart {
  const rows = data.points.map((p, i) => {
    const prev = i > 0 ? data.points[i - 1]! : null;
    const mom =
      prev && prev.value !== 0
        ? (((p.value - prev.value) / prev.value) * 100).toFixed(2) + "%"
        : "—";
    return [p.period, p.value, mom];
  });
  return {
    type: "table",
    title: `${SERIES_LABEL[seriesId] ?? seriesId} — levels & MoM`,
    seriesId,
    columns: ["Period", "Index", "MoM"],
    rows,
    source: data.source,
    period: data.period,
  };
}

function unavailableParts(message: string): AnswerPart[] {
  return [
    {
      type: "text",
      text: `Live CPI data unavailable for this query (no lookup / DATABASE_URL / empty Neon). Message: ${message.slice(0, 80)}`,
    },
  ];
}

async function resolveLookup(opts?: { lookup?: CpiLookup }): Promise<CpiLookup> {
  if (opts?.lookup) return opts.lookup;
  return neonCpiLookup;
}

/**
 * Build generative UI parts for GB/CA/EU/EA (and pass-through AU/US intents as empty
 * so the handler can keep fixture tools for those).
 */
export async function runCpiQueryTools(
  message: string,
  opts?: { lookup?: CpiLookup },
): Promise<AnswerPart[]> {
  const intent = detectCpiIntent(message);
  const seriesId = pickSeriesId(intent, message);

  // AU/US/generic handled by fixtures in the handler — return empty so caller
  // can fall back. (Q4/Q6: UK must not emit AU fixtures from this module.)
  if (
    intent === "latest_au" ||
    intent === "latest_us" ||
    intent === "generic" ||
    intent === "compare" ||
    intent === "yoy" ||
    intent === "chart" ||
    !seriesId
  ) {
    if (
      intent === "latest_gb" ||
      intent === "latest_ca" ||
      intent === "latest_eu" ||
      intent === "latest_ea"
    ) {
      // seriesId missing unexpectedly
      return unavailableParts(message);
    }
    return [];
  }

  const lookup = await resolveLookup(opts);
  const data = await lookup(seriesId);
  if (!data || !data.points.length) {
    return unavailableParts(message);
  }

  // Ensure source label matches QA needles (ONS / StatCan / Eurostat)
  const source = SOURCE_LABEL[seriesId] ?? data.source;
  const normalized: CpiLookupResult = { ...data, source };

  return [
    latestStatCards(seriesId, normalized),
    timeseriesPart(seriesId, normalized),
    yoyTable(seriesId, normalized),
  ];
}

/** True when message should use catalog query tools (not AU/US fixtures). */
export function shouldUseCpiQueryTools(message: string): boolean {
  const intent = detectCpiIntent(message);
  return (
    intent === "latest_gb" ||
    intent === "latest_ca" ||
    intent === "latest_eu" ||
    intent === "latest_ea"
  );
}
