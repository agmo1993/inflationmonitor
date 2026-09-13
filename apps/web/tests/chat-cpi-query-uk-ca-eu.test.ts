import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { authOk, freshStore } from "./helpers";
import { mockWorkersAi } from "./helpers-cf";

/**
 * QA — RED chat CPI query tools for UK/CA/EU/EA catalog ids.
 *
 * App implements (do not land in this PR):
 * - apps/web/lib/chat/tools/cpi-query.ts
 *   export type CpiLookup = (seriesId: string) => Promise<
 *     { points: { period: string; value: number }[]; source: string; period: string } | null
 *   >;
 *   export function detectCpiIntent(message: string): at least
 *     'latest_gb' | 'latest_ca' | 'latest_eu' | 'latest_ea' | 'compare' | 'yoy'
 *     (+ existing AU/US intents if wrapping detectIntent)
 *   export async function runCpiQueryTools(
 *     message: string,
 *     opts?: { lookup?: CpiLookup },
 *   ): Promise<AnswerPart[]>
 * - handler.ts ChatHandlerDeps.cpiLookup?: CpiLookup (or runTools)
 *   For GB/CA/EU/EA messages: use runCpiQueryTools instead of runCpiFixtureTools.
 * - Prefer live Neon via DATABASE_URL when opts.lookup is omitted.
 *
 * Locked catalog series ids (must appear in parts.seriesId):
 * - gb.ons.cpi.all_items (+ food / energy / all_items_less_food_energy_alcohol_tobacco)
 * - ca.statcan.cpi.all_items (+ food / shelter / energy)
 * - eu.eurostat.hicp.all_items
 * - ea.eurostat.hicp.all_items
 * Country codes: GB not UK; EA not EA19.
 */

const GB_ALL = "gb.ons.cpi.all_items";
const GB_FOOD = "gb.ons.cpi.food";
const CA_ALL = "ca.statcan.cpi.all_items";
const CA_SHELTER = "ca.statcan.cpi.shelter";
const EU_ALL = "eu.eurostat.hicp.all_items";
const EA_ALL = "ea.eurostat.hicp.all_items";

const AU_FIXTURE_ID = "au-abs-cpi-headline";
const US_FIXTURE_ID = "us-bls-cpiu-all";

type AnswerPart = {
  type: string;
  seriesId?: string;
  source?: string;
  period?: string;
  text?: string;
  [key: string]: unknown;
};

type CpiLookupResult = {
  points: Array<{ period: string; value: number }>;
  source: string;
  period: string;
};

type CpiLookup = (seriesId: string) => Promise<CpiLookupResult | null>;

type CpiQueryModule = {
  detectCpiIntent: (message: string) => string;
  runCpiQueryTools: (
    message: string,
    opts?: { lookup?: CpiLookup },
  ) => Promise<AnswerPart[]>;
  CpiLookup?: unknown;
};

/**
 * Example (not live) lookup data for catalog ids — injected so CI needs no Neon.
 * Values are illustrative only.
 */
const EXAMPLE_LOOKUP_DATA: Record<string, CpiLookupResult> = {
  // Example ONS CPI index points (not live)
  [GB_ALL]: {
    points: [
      { period: "2024-10", value: 134.2 },
      { period: "2024-11", value: 134.5 },
      { period: "2024-12", value: 134.8 },
    ],
    source: "ONS",
    period: "2024-12",
  },
  // Example ONS food CPI (not live)
  [GB_FOOD]: {
    points: [
      { period: "2024-11", value: 128.1 },
      { period: "2024-12", value: 128.4 },
    ],
    source: "ONS",
    period: "2024-12",
  },
  // Example StatCan all-items (not live)
  [CA_ALL]: {
    points: [
      { period: "2024-10", value: 161.8 },
      { period: "2024-11", value: 162.0 },
      { period: "2024-12", value: 162.3 },
    ],
    source: "StatCan",
    period: "2024-12",
  },
  // Example StatCan shelter (not live)
  [CA_SHELTER]: {
    points: [
      { period: "2024-11", value: 178.2 },
      { period: "2024-12", value: 178.9 },
    ],
    source: "StatCan",
    period: "2024-12",
  },
  // Example Eurostat EU27 HICP (not live)
  [EU_ALL]: {
    points: [
      { period: "2024-10", value: 126.4 },
      { period: "2024-11", value: 126.6 },
      { period: "2024-12", value: 126.9 },
    ],
    source: "Eurostat",
    period: "2024-12",
  },
  // Example Eurostat EA20 HICP (not live)
  [EA_ALL]: {
    points: [
      { period: "2024-10", value: 125.1 },
      { period: "2024-11", value: 125.3 },
      { period: "2024-12", value: 125.5 },
    ],
    source: "Eurostat",
    period: "2024-12",
  },
};

function exampleLookup(): CpiLookup {
  return async (seriesId: string) => EXAMPLE_LOOKUP_DATA[seriesId] ?? null;
}

async function loadCpiQueryModule(): Promise<CpiQueryModule> {
  try {
    return (await import("../lib/chat/tools/cpi-query")) as CpiQueryModule;
  } catch {
    expect.fail(
      "App must add apps/web/lib/chat/tools/cpi-query.ts exporting detectCpiIntent, runCpiQueryTools, and CpiLookup (Neon DATABASE_URL preferred; inject lookup in tests)",
    );
  }
}

function collectSeriesIds(parts: AnswerPart[]): string[] {
  const ids: string[] = [];
  for (const part of parts) {
    if (typeof part.seriesId === "string" && part.seriesId) {
      ids.push(part.seriesId);
    }
    // compare parts may nest series[].id
    if (part.type === "compare" && Array.isArray(part.series)) {
      for (const s of part.series as Array<{ id?: string }>) {
        if (typeof s.id === "string" && s.id) ids.push(s.id);
      }
    }
  }
  return ids;
}

function partsBlob(parts: AnswerPart[]): string {
  return JSON.stringify(parts);
}

function expectCatalogParts(
  parts: AnswerPart[],
  seriesId: string,
  sourceNeedle: string | RegExp,
) {
  expect(Array.isArray(parts)).toBe(true);
  expect(parts.length).toBeGreaterThan(0);

  const chartOrStat = parts.filter(
    (p) => p.type === "timeseries" || p.type === "stat_cards",
  );
  expect(chartOrStat.length).toBeGreaterThanOrEqual(1);

  const ids = collectSeriesIds(parts);
  expect(ids).toContain(seriesId);
  expect(ids).not.toContain(AU_FIXTURE_ID);
  expect(ids).not.toContain(US_FIXTURE_ID);

  const blob = partsBlob(parts);
  expect(blob).not.toMatch(/fixture/i);
  expect(blob).not.toContain(AU_FIXTURE_ID);

  const withSource = parts.filter((p) => typeof p.source === "string" && p.source);
  expect(withSource.length).toBeGreaterThanOrEqual(1);
  const sourceOk = withSource.some((p) =>
    typeof sourceNeedle === "string"
      ? (p.source as string).includes(sourceNeedle)
      : sourceNeedle.test(p.source as string),
  );
  expect(sourceOk).toBe(true);

  const withPeriod = parts.filter((p) => typeof p.period === "string" && p.period);
  expect(withPeriod.length).toBeGreaterThanOrEqual(1);
}

describe("QA — chat CPI query UK/CA/EU/EA (RED until App)", () => {
  // ── Q1: detectCpiIntent mappings ──────────────────────────────────────
  describe("Q1: detectCpiIntent region mapping", () => {
    it('maps "latest UK CPI" → latest_gb', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("latest UK CPI")).toBe("latest_gb");
    });

    it('maps "Canada all-items CPI" → latest_ca', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("Canada all-items CPI")).toBe("latest_ca");
    });

    it('maps "EU HICP latest" → latest_eu', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("EU HICP latest")).toBe("latest_eu");
    });

    it('maps "euro area HICP" / "EA20" → latest_ea', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("euro area HICP")).toBe("latest_ea");
      expect(mod.detectCpiIntent("EA20")).toBe("latest_ea");
    });

    it('keeps "latest Australia CPI" as AU (latest_au)', async () => {
      const mod = await loadCpiQueryModule();
      const intent = mod.detectCpiIntent("latest Australia CPI");
      expect(intent).toMatch(/latest_au|au/i);
      expect(intent).not.toMatch(/latest_gb|latest_ca|latest_eu|latest_ea/);
    });

    it('keeps "latest US CPI" as US (latest_us)', async () => {
      const mod = await loadCpiQueryModule();
      const intent = mod.detectCpiIntent("latest US CPI");
      expect(intent).toMatch(/latest_us|us/i);
      expect(intent).not.toMatch(/latest_gb|latest_ca|latest_eu|latest_ea/);
    });
  });

  // ── Q2: runCpiQueryTools with injected lookup ─────────────────────────
  describe("Q2: runCpiQueryTools headline series + source (injected lookup)", () => {
    it("latest UK CPI → gb.ons.cpi.all_items / ONS; no fixture / AU ids", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("latest UK CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, GB_ALL, "ONS");
    });

    it("Canada all-items → ca.statcan.cpi.all_items / StatCan", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("Canada all-items CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, CA_ALL, "StatCan");
    });

    it("EU HICP → eu.eurostat.hicp.all_items / Eurostat", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("EU HICP latest", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, EU_ALL, /Eurostat/i);
    });

    it("euro area HICP → ea.eurostat.hicp.all_items / Eurostat", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("euro area HICP", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, EA_ALL, /Eurostat/i);
    });
  });

  // ── Q3: component series (food / shelter) ─────────────────────────────
  describe("Q3: component series ids", () => {
    it("UK food CPI → gb.ons.cpi.food", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("UK food CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, GB_FOOD, "ONS");
    });

    it("Canada shelter → ca.statcan.cpi.shelter", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("Canada shelter", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, CA_SHELTER, "StatCan");
    });
  });

  // ── Q4: no silent AU fixture fallback without lookup ──────────────────
  describe("Q4: without lookup, UK must not fall back to AU fixtures", () => {
    it("UK message without lookup does not emit AU fixture series or /fixture/i source", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("latest UK CPI");
      expect(Array.isArray(parts)).toBe(true);

      const ids = collectSeriesIds(parts);
      expect(ids).not.toContain(AU_FIXTURE_ID);
      expect(ids).not.toContain(US_FIXTURE_ID);

      const blob = partsBlob(parts);
      expect(blob).not.toMatch(/fixture/i);
      expect(blob).not.toContain(AU_FIXTURE_ID);

      // Empty parts OR a text part saying live CPI unavailable is OK
      if (parts.length === 0) {
        expect(parts).toEqual([]);
      } else {
        const onlySafe =
          parts.every(
            (p) =>
              p.type === "text" ||
              (typeof p.seriesId === "string" &&
                p.seriesId.startsWith("gb.") &&
                !/fixture/i.test(String(p.source ?? ""))),
          ) ||
          parts.some(
            (p) =>
              p.type === "text" &&
              typeof p.text === "string" &&
              /unavailable|no live|not available|DATABASE_URL|lookup/i.test(
                p.text,
              ),
          );
        expect(onlySafe).toBe(true);
      }
    });
  });

  // ── Q5: handler wires cpiLookup for UK ────────────────────────────────
  describe("Q5: handleChatRequest with cpiLookup for UK", () => {
    it("status 200; answer.parts include seriesId gb.ons.cpi.all_items", async () => {
      await loadCpiQueryModule();

      const llm = mockWorkersAi(() => ({
        ok: true,
        content: "UK CPI overview",
        costUsd: 0.01,
        generationId: "cf-uk-q5",
      }));

      const result = await handleChatRequest(
        { message: "latest UK CPI" },
        {
          auth: authOk("acct_uk_q5"),
          usageStore: freshStore(),
          llm,
          cpiLookup: exampleLookup(),
        } as Parameters<typeof handleChatRequest>[1] & {
          llm: ReturnType<typeof mockWorkersAi>;
          cpiLookup: CpiLookup;
        },
      );

      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
      if (!result.body.ok) return;

      const body = result.body as {
        ok: true;
        answer?: { parts?: AnswerPart[] };
      };
      const parts = body.answer?.parts ?? [];
      expect(Array.isArray(parts)).toBe(true);
      const ids = collectSeriesIds(parts);
      expect(ids).toContain(GB_ALL);
      expect(ids).not.toContain(AU_FIXTURE_ID);
      expect(partsBlob(parts)).not.toMatch(/fixture/i);
    });
  });

  // ── Q6: existing AU fixture path stays green ──────────────────────────
  describe("Q6: AU fixture path unbroken (no cpiLookup)", () => {
    it('handleChatRequest "latest AU CPI" still 200 with fixtures', async () => {
      const llm = mockWorkersAi(() => ({
        ok: true,
        content: "AU CPI overview",
        costUsd: 0.01,
        generationId: "cf-au-q6",
      }));

      const result = await handleChatRequest(
        { message: "latest AU CPI" },
        {
          auth: authOk("acct_au_q6"),
          usageStore: freshStore(),
          llm,
          skipTools: false,
        },
      );

      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
      if (!result.body.ok) return;

      const body = result.body as {
        ok: true;
        answer?: { parts?: AnswerPart[] };
      };
      const parts = body.answer?.parts ?? [];
      expect(Array.isArray(parts)).toBe(true);
      expect(parts.length).toBeGreaterThan(0);
      // May still use AU fixtures — that is intentional for this path
      const ids = collectSeriesIds(parts);
      const blob = partsBlob(parts);
      const usesAu =
        ids.includes(AU_FIXTURE_ID) ||
        /au-abs|ABS CPI|Australia/i.test(blob) ||
        parts.some((p) => p.type === "stat_cards" || p.type === "timeseries");
      expect(usesAu).toBe(true);
    });
  });

  // ── Q7: source contract (handler + DATABASE_URL) ──────────────────────
  describe("Q7: source contract — handler imports cpi-query; Neon DATABASE_URL", () => {
    it("handler.ts imports from tools/cpi-query or calls runCpiQueryTools", () => {
      const handlerPath = resolve(__dirname, "../lib/chat/handler.ts");
      const src = readFileSync(handlerPath, "utf8");
      const wiresQuery =
        /cpi-query/.test(src) || /runCpiQueryTools/.test(src);
      expect(
        wiresQuery,
        "handler.ts must import tools/cpi-query (or call runCpiQueryTools) for GB/CA/EU/EA",
      ).toBe(true);
    });

    it("cpi-query.ts mentions DATABASE_URL (live Neon preferred)", async () => {
      await loadCpiQueryModule();
      const queryPath = resolve(__dirname, "../lib/chat/tools/cpi-query.ts");
      let src: string;
      try {
        src = readFileSync(queryPath, "utf8");
      } catch {
        expect.fail(
          "App must add apps/web/lib/chat/tools/cpi-query.ts that mentions DATABASE_URL for live Neon lookup",
        );
      }
      expect(src).toMatch(/DATABASE_URL/);
    });
  });
});
