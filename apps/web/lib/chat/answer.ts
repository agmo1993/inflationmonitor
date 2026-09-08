/**
 * Generative UI answer protocol — structured parts, not markdown-only.
 */

export type AnswerPartType =
  | "text"
  | "stat_cards"
  | "timeseries"
  | "bar"
  | "table"
  | "compare";

export interface TextPart {
  type: "text";
  text: string;
}

export interface StatCard {
  label: string;
  value: string;
  hint?: string;
}

export interface StatCardsPart {
  type: "stat_cards";
  title?: string;
  cards: StatCard[];
  source?: string;
  period?: string;
}

export interface TimeseriesPoint {
  period: string;
  value: number;
}

export interface TimeseriesPart {
  type: "timeseries";
  title: string;
  seriesId?: string;
  unit?: string;
  points: TimeseriesPoint[];
  source?: string;
  period?: string;
}

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarPart {
  type: "bar";
  title: string;
  unit?: string;
  bars: BarDatum[];
  source?: string;
  period?: string;
}

export interface TablePart {
  type: "table";
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  source?: string;
  period?: string;
}

export interface CompareSeries {
  id: string;
  label: string;
  points: TimeseriesPoint[];
}

export interface ComparePart {
  type: "compare";
  title: string;
  series: CompareSeries[];
  source?: string;
  period?: string;
}

export type AnswerPart =
  | TextPart
  | StatCardsPart
  | TimeseriesPart
  | BarPart
  | TablePart
  | ComparePart;

export interface Answer {
  prose?: string;
  parts: AnswerPart[];
  yearMonth?: string;
  spendUsd?: number;
}

/** Build a minimal Answer from prose alone. */
export function answerFromProse(prose: string): Answer {
  const trimmed = prose.trim();
  return {
    prose: trimmed || undefined,
    parts: trimmed ? [{ type: "text", text: trimmed }] : [],
  };
}

/** Merge tool parts after optional LLM prose. */
export function buildAnswer(opts: {
  prose?: string;
  parts?: AnswerPart[];
  yearMonth?: string;
  spendUsd?: number;
}): Answer {
  const parts = [...(opts.parts ?? [])];
  const prose = opts.prose?.trim() || undefined;
  if (prose && !parts.some((p) => p.type === "text" && p.text === prose)) {
    parts.unshift({ type: "text", text: prose });
  }
  return {
    prose,
    parts,
    yearMonth: opts.yearMonth,
    spendUsd: opts.spendUsd,
  };
}

/** Pure serializer for tests / logging — stable JSON shape. */
export function serializeAnswer(answer: Answer): string {
  return JSON.stringify(answer);
}

export function parseAnswer(raw: string): Answer {
  const parsed = JSON.parse(raw) as Answer;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.parts)) {
    throw new Error("Invalid Answer");
  }
  return parsed;
}

/** Collect citation strings from parts that declare source/period. */
export function collectCitations(
  parts: AnswerPart[],
): Array<{ source: string; period?: string }> {
  const out: Array<{ source: string; period?: string }> = [];
  for (const part of parts) {
    if ("source" in part && typeof part.source === "string" && part.source) {
      out.push({ source: part.source, period: part.period });
    }
  }
  return out;
}
