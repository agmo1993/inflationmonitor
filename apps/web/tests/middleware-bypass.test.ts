import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Middleware must not invoke Clerk when bypass is active.
 * No top-level clerkMiddleware(...) / static Clerk import — lazy import only
 * after isAuthDevBypassActive() is false.
 */
const webRoot = path.resolve(__dirname, "..");
const src = readFileSync(path.join(webRoot, "middleware.ts"), "utf8");

describe("QA M — middleware bypass passthrough", () => {
  it("M1: no static import of clerkMiddleware from @clerk/nextjs/server", () => {
    expect(src).not.toMatch(
      /import\s*\{[^}]*clerkMiddleware[^}]*\}\s*from\s*["']@clerk\/nextjs\/server["']/,
    );
    expect(src).toMatch(/isAuthDevBypassActive\s*\(/);
    expect(src).toMatch(/NextResponse\.next\s*\(/);
  });

  it("M2: dynamic import of @clerk/nextjs/server only on non-bypass path", () => {
    expect(src).toMatch(/import\s*\(\s*["']@clerk\/nextjs\/server["']\s*\)/);
    const bypassIdx = src.search(/isAuthDevBypassActive\s*\(/);
    const dynIdx = src.search(/import\s*\(\s*["']@clerk\/nextjs\/server["']\s*\)/);
    expect(bypassIdx).toBeGreaterThanOrEqual(0);
    expect(dynIdx).toBeGreaterThan(bypassIdx);
  });

  it("M3: health route remains in public matcher when Clerk path used", () => {
    expect(src).toMatch(/\/api\/health/);
  });
});
