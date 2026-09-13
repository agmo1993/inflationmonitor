import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GB, EU, EA, CA } from "../src/catalog/series-ids.js";
import { seedMeta } from "../src/db/seed-meta.js";
import { checkFreshness } from "../src/freshness/check.js";
import { loadUkOnsCpi, loadUkOnsFixture } from "../src/loaders/uk-ons-cpi.js";
import { loadEuHicp, loadEuHicpFixture } from "../src/loaders/eu-hicp.js";
import {
  loadCaStatcanCpi,
  loadCaStatcanFixture,
} from "../src/loaders/ca-statcan-cpi.js";
import { createTestDb } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UK_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/uk-ons/cpi-components.json",
);
const EU_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/eu-hicp/hicp-components.json",
);
const CA_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/ca-statcan/cpi-components.json",
);

const HEADLINE_IDS = [
  GB.headline.id,
  EU.headline.id,
  EA.headline.id,
  CA.headline.id,
];

describe("freshness UK / EU / EA / CA", () => {
  it("flags all headlines missing after seedMeta only", async () => {
    const { db, client } = await createTestDb();
    try {
      await seedMeta(db);
      const report = await checkFreshness(db, HEADLINE_IDS, {
        asOf: new Date("2025-02-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.ok).toBe(false);
      expect(report.expectedLatestPeriod).toBe("2025-01-01");
      const byId = Object.fromEntries(
        report.issues.map((i) => [i.seriesId, i.status]),
      );
      expect(byId[GB.headline.id]).toBe("missing");
      expect(byId[EU.headline.id]).toBe("missing");
      expect(byId[EA.headline.id]).toBe("missing");
      expect(byId[CA.headline.id]).toBe("missing");
    } finally {
      await client.close();
    }
  });

  it("returns ok when all fixtures are loaded (asOf 2025-01-15)", async () => {
    const { db, client } = await createTestDb();
    try {
      await loadUkOnsCpi(db, await loadUkOnsFixture(UK_FIXTURE));
      await loadEuHicp(db, await loadEuHicpFixture(EU_FIXTURE));
      await loadCaStatcanCpi(db, await loadCaStatcanFixture(CA_FIXTURE));

      const report = await checkFreshness(db, HEADLINE_IDS, {
        asOf: new Date("2025-01-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.expectedLatestPeriod).toBe("2024-12-01");
      expect(report.ok).toBe(true);
      const byId = Object.fromEntries(
        report.issues.map((i) => [i.seriesId, i.status]),
      );
      expect(byId[GB.headline.id]).toBe("ok");
      expect(byId[EU.headline.id]).toBe("ok");
      expect(byId[EA.headline.id]).toBe("ok");
      expect(byId[CA.headline.id]).toBe("ok");
      for (const issue of report.issues) {
        expect(issue.latestPeriod).toBe("2024-12-01");
      }
    } finally {
      await client.close();
    }
  });

  it("marks report not ok when only GB is loaded (EU+EA+CA missing)", async () => {
    const { db, client } = await createTestDb();
    try {
      await loadUkOnsCpi(db, await loadUkOnsFixture(UK_FIXTURE));

      const report = await checkFreshness(db, HEADLINE_IDS, {
        asOf: new Date("2025-01-15T00:00:00Z"),
        lagMonths: 1,
      });
      expect(report.ok).toBe(false);
      const byId = Object.fromEntries(
        report.issues.map((i) => [i.seriesId, i.status]),
      );
      expect(byId[GB.headline.id]).toBe("ok");
      expect(byId[EU.headline.id]).toBe("missing");
      expect(byId[EA.headline.id]).toBe("missing");
      expect(byId[CA.headline.id]).toBe("missing");
    } finally {
      await client.close();
    }
  });
});
