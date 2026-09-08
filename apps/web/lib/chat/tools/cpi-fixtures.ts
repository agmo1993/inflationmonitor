/**
 * Fixture CPI tools for generative UI when packages/data has no query API yet.
 * Uses inlined AU/US series (mirrors packages/data fixtures; does not mutate that package).
 */

import type {
  AnswerPart,
  BarPart,
  ComparePart,
  StatCardsPart,
  TablePart,
  TimeseriesPart,
} from "../answer";

export interface FixtureSeries {
  id: string;
  label: string;
  region: "AU" | "US";
  source: string;
  period: string;
  unit: string;
  points: Array<{ period: string; value: number }>;
}

/** AU All groups CPI — ABS-style fixture (source/period cited in parts). */
export const AU_HEADLINE: FixtureSeries = {
  id: "au-abs-cpi-headline",
  label: "AU All groups CPI",
  region: "AU",
  source: "ABS CPI (fixture)",
  period: "2024-07 … 2024-12",
  unit: "index",
  points: [
    { period: "2024-07", value: 139.0 },
    { period: "2024-08", value: 139.3 },
    { period: "2024-09", value: 139.7 },
    { period: "2024-10", value: 140.0 },
    { period: "2024-11", value: 140.2 },
    { period: "2024-12", value: 140.5 },
  ],
};

/** US CPI-U All items — BLS-style fixture. */
export const US_HEADLINE: FixtureSeries = {
  id: "us-bls-cpiu-all",
  label: "US CPI-U All items",
  region: "US",
  source: "BLS CPI-U (fixture)",
  period: "2024-10 … 2025-01",
  unit: "index",
  points: [
    { period: "2024-10", value: 315.664 },
    { period: "2024-11", value: 315.493 },
    { period: "2024-12", value: 315.605 },
    { period: "2025-01", value: 317.671 },
  ],
};

function latest(series: FixtureSeries) {
  return series.points[series.points.length - 1]!;
}

function yoyApprox(series: FixtureSeries): number | null {
  // Fixtures are short; approximate YoY as last vs first when < 12 points.
  if (series.points.length < 2) return null;
  const last = latest(series);
  const first = series.points[0]!;
  return ((last.value - first.value) / first.value) * 100;
}

export function timeseriesPart(series: FixtureSeries): TimeseriesPart {
  return {
    type: "timeseries",
    title: series.label,
    seriesId: series.id,
    unit: series.unit,
    points: series.points,
    source: series.source,
    period: series.period,
  };
}

export function latestStatCards(series: FixtureSeries): StatCardsPart {
  const last = latest(series);
  const yoy = yoyApprox(series);
  const cards = [
    { label: "Latest index", value: last.value.toFixed(2), hint: last.period },
    {
      label: "Change (fixture window)",
      value: yoy === null ? "n/a" : `${yoy >= 0 ? "+" : ""}${yoy.toFixed(2)}%`,
      hint: series.period,
    },
  ];
  return {
    type: "stat_cards",
    title: `${series.region} latest`,
    cards,
    source: series.source,
    period: last.period,
  };
}

export function yoyTable(series: FixtureSeries): TablePart {
  const rows = series.points.map((p, i) => {
    const prev = i > 0 ? series.points[i - 1]! : null;
    const mom =
      prev && prev.value !== 0
        ? (((p.value - prev.value) / prev.value) * 100).toFixed(2) + "%"
        : "—";
    return [p.period, p.value, mom];
  });
  return {
    type: "table",
    title: `${series.label} — levels & MoM`,
    columns: ["Period", "Index", "MoM"],
    rows,
    source: series.source,
    period: series.period,
  };
}

export function compareAuUs(): ComparePart {
  return {
    type: "compare",
    title: "AU vs US CPI (fixture, rebased to overlapping months)",
    series: [
      {
        id: AU_HEADLINE.id,
        label: AU_HEADLINE.label,
        points: AU_HEADLINE.points.filter((p) =>
          US_HEADLINE.points.some((u) => u.period === p.period),
        ),
      },
      {
        id: US_HEADLINE.id,
        label: US_HEADLINE.label,
        points: US_HEADLINE.points.filter((p) =>
          AU_HEADLINE.points.some((a) => a.period === p.period),
        ),
      },
    ],
    source: "ABS CPI + BLS CPI-U (fixtures)",
    period: "overlapping months in fixtures",
  };
}

export function compareBar(): BarPart {
  const au = latest(AU_HEADLINE);
  const us = latest(US_HEADLINE);
  return {
    type: "bar",
    title: "Latest index levels (not directly comparable)",
    unit: "index",
    bars: [
      { label: `AU ${au.period}`, value: au.value },
      { label: `US ${us.period}`, value: us.value },
    ],
    source: "ABS CPI + BLS CPI-U (fixtures)",
    period: `${au.period} / ${us.period}`,
  };
}

export type ToolIntent =
  | "latest_au"
  | "latest_us"
  | "yoy"
  | "compare"
  | "chart"
  | "generic";

export function detectIntent(message: string): ToolIntent {
  const m = message.toLowerCase();
  if (/compar|au\s*vs\s*us|us\s*vs\s*au/.test(m)) return "compare";
  if (/yoy|year[\s-]?over[\s-]?year|annual/.test(m)) return "yoy";
  if (/chart|timeseries|time[\s-]?series|plot|graph/.test(m)) return "chart";
  if (/\bau\b|australia|abs/.test(m) && /latest|current|headline/.test(m)) {
    return "latest_au";
  }
  if (/\bus\b|united states|bls|cpi-u/.test(m) && /latest|current|headline/.test(m)) {
    return "latest_us";
  }
  if (/\bau\b|australia|abs/.test(m)) return "latest_au";
  if (/\bus\b|united states|bls/.test(m)) return "latest_us";
  if (/latest/.test(m)) return "latest_au";
  return "generic";
}

/**
 * Run fixture tools → typed AnswerPart[]. Always cites source/period.
 */
export function runCpiFixtureTools(message: string): AnswerPart[] {
  const intent = detectIntent(message);
  switch (intent) {
    case "latest_au":
      return [
        latestStatCards(AU_HEADLINE),
        timeseriesPart(AU_HEADLINE),
        yoyTable(AU_HEADLINE),
      ];
    case "latest_us":
      return [
        latestStatCards(US_HEADLINE),
        timeseriesPart(US_HEADLINE),
        yoyTable(US_HEADLINE),
      ];
    case "yoy":
      return [
        latestStatCards(AU_HEADLINE),
        latestStatCards(US_HEADLINE),
        yoyTable(AU_HEADLINE),
        yoyTable(US_HEADLINE),
      ];
    case "compare":
      return [compareAuUs(), compareBar(), latestStatCards(AU_HEADLINE), latestStatCards(US_HEADLINE)];
    case "chart":
      // Always include ≥1 chart (timeseries/bar/compare) AND ≥1 table for genUI contract.
      return [
        timeseriesPart(AU_HEADLINE),
        compareBar(),
        yoyTable(AU_HEADLINE),
        yoyTable(US_HEADLINE),
      ];
    case "generic":
    default:
      return [
        latestStatCards(AU_HEADLINE),
        timeseriesPart(AU_HEADLINE),
        {
          type: "text",
          text: "Fixture CPI tools attached (packages/data query APIs not wired yet). Ask for latest AU/US, YoY, compare, or chart.",
        },
      ];
  }
}
