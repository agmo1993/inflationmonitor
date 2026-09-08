import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { authOk, freshStore } from "./helpers";
import { mockWorkersAi } from "./helpers-cf";

/**
 * QA E4 — Typed generative UI parts for chart AND table (not markdown-only).
 *
 * App contract (feat/cf-workers-ai-gen-ui):
 * - Module: apps/web/lib/chat/answer.ts
 * - Chat success body includes `answer: { parts: AnswerPart[] }`
 * - Chart-like parts: type "bar" and/or "timeseries" (and optionally compare)
 * - Table part: type "table" with title, columns[], rows[][]
 */

type AnswerPart = {
  type: string;
  [key: string]: unknown;
};

async function loadAnswerModule(): Promise<{
  buildAnswer: (opts: {
    prose?: string;
    parts?: AnswerPart[];
    yearMonth?: string;
    spendUsd?: number;
  }) => { prose?: string; parts: AnswerPart[] };
  isAnswerPart?: (value: unknown) => boolean;
}> {
  try {
    return (await import("../lib/chat/answer")) as {
      buildAnswer: (opts: {
        prose?: string;
        parts?: AnswerPart[];
        yearMonth?: string;
        spendUsd?: number;
      }) => { prose?: string; parts: AnswerPart[] };
      isAnswerPart?: (value: unknown) => boolean;
    };
  } catch {
    expect.fail(
      "App must add apps/web/lib/chat/answer.ts exporting buildAnswer + typed AnswerPart union (bar/timeseries chart + table)",
    );
  }
}

function isChartPart(part: AnswerPart): boolean {
  return part.type === "bar" || part.type === "timeseries" || part.type === "compare";
}

function isTablePart(part: AnswerPart): boolean {
  return part.type === "table";
}

describe("QA E4 — generative UI parts (chart + table)", () => {
  it("E4a: answer module exports buildAnswer; chart + table part shapes validate", async () => {
    const mod = await loadAnswerModule();
    expect(typeof mod.buildAnswer).toBe("function");

    const bar = {
      type: "bar",
      title: "CPI by region",
      bars: [
        { label: "AU", value: 2.8 },
        { label: "US", value: 3.0 },
      ],
    };
    const timeseries = {
      type: "timeseries",
      title: "CPI YoY",
      points: [
        { period: "2024-Q1", value: 3.1 },
        { period: "2025-Q1", value: 2.8 },
      ],
    };
    const table = {
      type: "table",
      title: "Latest CPI",
      columns: ["region", "yoy"],
      rows: [
        ["AU", 2.8],
        ["US", 3.0],
      ],
    };

    const answer = mod.buildAnswer({
      prose: "CPI overview",
      parts: [bar, timeseries, table],
    });

    expect(Array.isArray(answer.parts)).toBe(true);
    const charts = answer.parts.filter(isChartPart);
    const tables = answer.parts.filter(isTablePart);
    expect(charts.length).toBeGreaterThanOrEqual(1);
    expect(tables.length).toBeGreaterThanOrEqual(1);

    const tablePart = tables[0]!;
    expect(typeof tablePart.title).toBe("string");
    expect(Array.isArray(tablePart.columns)).toBe(true);
    expect((tablePart.columns as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(tablePart.rows)).toBe(true);

    const chartPart = charts[0]!;
    if (chartPart.type === "bar") {
      expect(Array.isArray(chartPart.bars)).toBe(true);
    } else if (chartPart.type === "timeseries") {
      expect(Array.isArray(chartPart.points)).toBe(true);
    }
  });

  it("E4b: successful chat response includes answer.parts with ≥1 chart and ≥1 table", async () => {
    await loadAnswerModule();

    const llm = mockWorkersAi(() => ({
      ok: true,
      content: "Here is the CPI view",
      costUsd: 0.02,
      generationId: "cf-e4b",
    }));

    const result = await handleChatRequest(
      { message: "show cpi chart and table" },
      {
        auth: authOk("acct_e4b"),
        usageStore: freshStore(),
        llm,
      } as Parameters<typeof handleChatRequest>[1] & {
        llm: ReturnType<typeof mockWorkersAi>;
      },
    );

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    if (!result.body.ok) return;

    const body = result.body as {
      ok: true;
      message: string;
      answer?: { parts?: AnswerPart[] };
      parts?: AnswerPart[];
    };

    const parts = body.answer?.parts ?? body.parts;
    expect(Array.isArray(parts)).toBe(true);
    const list = parts as AnswerPart[];
    const charts = list.filter(isChartPart);
    const tables = list.filter(isTablePart);
    expect(charts.length).toBeGreaterThanOrEqual(1);
    expect(tables.length).toBeGreaterThanOrEqual(1);
  });
});
