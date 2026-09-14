import { describe, expect, it } from "vitest";
import { handleChatRequest } from "../lib/chat/handler";
import { authOk, freshStore } from "./helpers";
import { mockWorkersAi } from "./helpers-cf";

/**
 * QA — RED chat CPI query tools for AU/US live Neon catalog ids.
 *
 * App implements (do not land in this PR):
 * - When cpiLookup is injected OR DATABASE_URL Neon returns rows:
 *   - shouldUseCpiQueryTools true for latest_au / latest_us
 *     (or handler tries query first and only falls back to fixtures if lookup returns null/empty)
 *   - pickSeriesId: latest_au → au.abs.cpi.all_groups;
 *     latest_us → us.bls.cpiu.all_items;
 *     US food/energy/shelter/core (less food and energy) map to catalog ids
 *   - CPI_CATALOG_IDS + SOURCE_LABEL (ABS / BLS) + SERIES_LABEL include AU/US
 *   - Parts include seriesId on timeseries AND stat_cards AND table
 *   - No fixture fallback when lookup/Neon has rows
 * - Empty lookup + no DATABASE_URL: fixtures still allowed (Q6 in uk-ca-eu stays green)
 * - GB/CA/EU/EA behavior unchanged
 *
 * Locked catalog series ids:
 * - au.abs.cpi.all_groups
 * - us.bls.cpiu.all_items, food, energy, all_items_less_food_energy, shelter
 *
 * Fixture ids forbidden when live rows exist:
 * - au-abs-cpi-headline, us-bls-cpiu-all, source matching /fixture/i
 */

const AU_ALL = "au.abs.cpi.all_groups";
const US_ALL = "us.bls.cpiu.all_items";
const US_FOOD = "us.bls.cpiu.food";
const US_ENERGY = "us.bls.cpiu.energy";
const US_SHELTER = "us.bls.cpiu.shelter";
const US_CORE = "us.bls.cpiu.all_items_less_food_energy";

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
  shouldUseCpiQueryTools?: (message: string) => boolean;
  CPI_CATALOG_IDS?: Record<string, string>;
};

/**
 * Example (not live) lookup data for AU/US catalog ids — injected so CI needs no Neon.
 * Values are illustrative only.
 */
const EXAMPLE_LOOKUP_DATA: Record<string, CpiLookupResult> = {
  // Example ABS CPI all groups (not live)
  [AU_ALL]: {
    points: [
      { period: "2024-09", value: 139.1 },
      { period: "2024-12", value: 140.0 },
      { period: "2025-03", value: 140.7 },
    ],
    source: "ABS",
    period: "2025-03",
  },
  // Example BLS CPI-U all items (not live)
  [US_ALL]: {
    points: [
      { period: "2024-10", value: 315.6 },
      { period: "2024-11", value: 316.1 },
      { period: "2024-12", value: 316.8 },
    ],
    source: "BLS",
    period: "2024-12",
  },
  // Example BLS CPI-U food (not live)
  [US_FOOD]: {
    points: [
      { period: "2024-11", value: 328.4 },
      { period: "2024-12", value: 329.0 },
    ],
    source: "BLS",
    period: "2024-12",
  },
  // Example BLS CPI-U energy (not live)
  [US_ENERGY]: {
    points: [
      { period: "2024-11", value: 278.2 },
      { period: "2024-12", value: 279.5 },
    ],
    source: "BLS",
    period: "2024-12",
  },
  // Example BLS CPI-U shelter (not live)
  [US_SHELTER]: {
    points: [
      { period: "2024-11", value: 385.1 },
      { period: "2024-12", value: 386.0 },
    ],
    source: "BLS",
    period: "2024-12",
  },
  // Example BLS CPI-U less food and energy (not live)
  [US_CORE]: {
    points: [
      { period: "2024-11", value: 322.0 },
      { period: "2024-12", value: 322.6 },
    ],
    source: "BLS",
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
      "App must export detectCpiIntent, runCpiQueryTools from apps/web/lib/chat/tools/cpi-query.ts",
    );
  }
}

function collectSeriesIds(parts: AnswerPart[]): string[] {
  const ids: string[] = [];
  for (const part of parts) {
    if (typeof part.seriesId === "string" && part.seriesId) {
      ids.push(part.seriesId);
    }
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

function expectNoFixtures(parts: AnswerPart[]) {
  const ids = collectSeriesIds(parts);
  expect(ids).not.toContain(AU_FIXTURE_ID);
  expect(ids).not.toContain(US_FIXTURE_ID);
  const blob = partsBlob(parts);
  expect(blob).not.toMatch(/fixture/i);
  expect(blob).not.toContain(AU_FIXTURE_ID);
  expect(blob).not.toContain(US_FIXTURE_ID);
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
  expectNoFixtures(parts);

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

describe("QA — chat CPI query AU/US live Neon (RED until App)", () => {
  // ── A1: detectCpiIntent ────────────────────────────────────────────────
  describe("A1: detectCpiIntent AU/US (+ UK unchanged)", () => {
    it('maps "latest Australia CPI" → latest_au', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("latest Australia CPI")).toBe("latest_au");
    });

    it('maps "latest US CPI" / "CPI-U" → latest_us', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("latest US CPI")).toBe("latest_us");
      expect(mod.detectCpiIntent("CPI-U")).toBe("latest_us");
    });

    it('keeps "latest UK CPI" → latest_gb', async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.detectCpiIntent("latest UK CPI")).toBe("latest_gb");
    });
  });

  // ── A2: runCpiQueryTools AU headline ───────────────────────────────────
  describe("A2: runCpiQueryTools latest AU → catalog ABS", () => {
    it("latest AU CPI → au.abs.cpi.all_groups; ABS; no fixture / au-abs-cpi-headline", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("latest AU CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, AU_ALL, /ABS|Australian Bureau/i);
      expect(collectSeriesIds(parts)).not.toContain(AU_FIXTURE_ID);
    });
  });

  // ── A3: runCpiQueryTools US headline ───────────────────────────────────
  describe("A3: runCpiQueryTools latest US → catalog BLS", () => {
    it("latest US CPI → us.bls.cpiu.all_items; BLS; no us-bls-cpiu-all", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("latest US CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, US_ALL, "BLS");
      expect(collectSeriesIds(parts)).not.toContain(US_FIXTURE_ID);
    });
  });

  // ── A4: US component series ────────────────────────────────────────────
  describe("A4: US component catalog series ids", () => {
    it("US food CPI → us.bls.cpiu.food", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("US food CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, US_FOOD, "BLS");
    });

    it("US energy → us.bls.cpiu.energy", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("US energy CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, US_ENERGY, "BLS");
    });

    it("US shelter → us.bls.cpiu.shelter", async () => {
      const mod = await loadCpiQueryModule();
      const parts = await mod.runCpiQueryTools("US shelter CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(parts, US_SHELTER, "BLS");
    });

    it('"US core" or "less food and energy" → us.bls.cpiu.all_items_less_food_energy', async () => {
      const mod = await loadCpiQueryModule();
      const coreParts = await mod.runCpiQueryTools("US core CPI", {
        lookup: exampleLookup(),
      });
      expectCatalogParts(coreParts, US_CORE, "BLS");

      const lessParts = await mod.runCpiQueryTools(
        "US CPI less food and energy",
        { lookup: exampleLookup() },
      );
      expectCatalogParts(lessParts, US_CORE, "BLS");
    });
  });

  // ── A5: handleChatRequest with cpiLookup ───────────────────────────────
  describe("A5: handleChatRequest with cpiLookup for US + AU", () => {
    it('status 200; "latest US CPI" answer.parts include catalog seriesId; no fixture', async () => {
      await loadCpiQueryModule();

      const llm = mockWorkersAi(() => ({
        ok: true,
        content: "US CPI overview",
        costUsd: 0.01,
        generationId: "cf-us-a5",
      }));

      const result = await handleChatRequest(
        { message: "latest US CPI" },
        {
          auth: authOk("acct_us_a5"),
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
      expect(collectSeriesIds(parts)).toContain(US_ALL);
      expectNoFixtures(parts);
    });

    it('status 200; "latest AU CPI" answer.parts include catalog seriesId; no fixture', async () => {
      await loadCpiQueryModule();

      const llm = mockWorkersAi(() => ({
        ok: true,
        content: "AU CPI overview",
        costUsd: 0.01,
        generationId: "cf-au-a5",
      }));

      const result = await handleChatRequest(
        { message: "latest AU CPI" },
        {
          auth: authOk("acct_au_a5"),
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
      expect(collectSeriesIds(parts)).toContain(AU_ALL);
      expectNoFixtures(parts);
    });
  });

  // ── A6: seriesId on timeseries, stat_cards, and table ──────────────────
  describe("A6: seriesId on timeseries, stat_cards, and table", () => {
    it("AU/US query parts carry seriesId on timeseries, stat_cards, and table", async () => {
      const mod = await loadCpiQueryModule();
      const auParts = await mod.runCpiQueryTools("latest AU CPI", {
        lookup: exampleLookup(),
      });
      const usParts = await mod.runCpiQueryTools("latest US CPI", {
        lookup: exampleLookup(),
      });

      for (const [label, parts, seriesId] of [
        ["AU", auParts, AU_ALL],
        ["US", usParts, US_ALL],
      ] as const) {
        expect(parts.length, `${label} parts non-empty`).toBeGreaterThan(0);

        const ts = parts.find((p) => p.type === "timeseries");
        const cards = parts.find((p) => p.type === "stat_cards");
        const table = parts.find((p) => p.type === "table");

        expect(ts, `${label} timeseries`).toBeTruthy();
        expect(cards, `${label} stat_cards`).toBeTruthy();
        expect(table, `${label} table`).toBeTruthy();

        expect(ts!.seriesId).toBe(seriesId);
        expect(cards!.seriesId).toBe(seriesId);
        expect(table!.seriesId).toBe(seriesId);

        expectNoFixtures(parts);
      }
    });
  });

  // ── A7: source/contract — shouldUseCpiQueryTools + CPI_CATALOG_IDS ─────
  describe("A7: source contract — shouldUseCpiQueryTools + CPI_CATALOG_IDS", () => {
    it('shouldUseCpiQueryTools("latest US CPI") is true (or handler uses query path — A5)', async () => {
      const mod = await loadCpiQueryModule();
      if (typeof mod.shouldUseCpiQueryTools === "function") {
        expect(mod.shouldUseCpiQueryTools("latest US CPI")).toBe(true);
        expect(mod.shouldUseCpiQueryTools("latest AU CPI")).toBe(true);
      } else {
        // Fallback: A5 already asserts handler query path when cpiLookup provided
        expect(true).toBe(true);
      }
    });

    it("CPI_CATALOG_IDS includes au.abs.cpi.all_groups and us.bls.cpiu.all_items", async () => {
      const mod = await loadCpiQueryModule();
      expect(mod.CPI_CATALOG_IDS).toBeTruthy();
      const values = Object.values(mod.CPI_CATALOG_IDS ?? {});
      expect(values).toContain(AU_ALL);
      expect(values).toContain(US_ALL);
    });
  });
});
