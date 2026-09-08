import { describe, expect, it } from "vitest";
import { canAllowLlm, isOverCap } from "../lib/metering/quota";
import { utcYearMonth } from "../lib/metering/period";

describe("quota helpers", () => {
  it("treats exactly 5.00 as over-cap", () => {
    expect(isOverCap(4.999)).toBe(false);
    expect(canAllowLlm(4.999)).toBe(true);
    expect(isOverCap(5.0)).toBe(true);
    expect(canAllowLlm(5.0)).toBe(false);
    expect(isOverCap(5.01)).toBe(true);
  });

  it("formats UTC year-month", () => {
    expect(utcYearMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(utcYearMonth(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12");
    // Near month boundary in US evening is still next UTC month
    expect(utcYearMonth(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
  });
});
