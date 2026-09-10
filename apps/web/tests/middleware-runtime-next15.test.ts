import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Next 15.5.25 rejects middleware config.runtime = "edge"
 * ("Page /middleware provided runtime 'edge'… Use runtime 'experimental-edge'").
 * Default Edge (omit runtime) is the supported keep-Edge path.
 */
const src = readFileSync(
  path.resolve(__dirname, "../middleware.ts"),
  "utf8",
);

describe("App R — Next 15.5 middleware runtime", () => {
  it("R1: must not set config.runtime to edge or nodejs", () => {
    expect(src).not.toMatch(/runtime\s*:\s*['"]edge['"]/);
    expect(src).not.toMatch(/runtime\s*:\s*['"]nodejs['"]/);
    expect(src).not.toMatch(
      /export\s+const\s+runtime\s*=\s*['"]edge['"]/,
    );
    expect(src).not.toMatch(
      /export\s+const\s+runtime\s*=\s*['"]nodejs['"]/,
    );
  });

  it("R2: still documents MIDDLEWARE_ESM_CJS_MITIGATION", () => {
    expect(src).toContain("MIDDLEWARE_ESM_CJS_MITIGATION");
  });
});
