import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA M' — durable Clerk-free middleware (RED until App removes Clerk from middleware).
 *
 * Replaces old M1–M3 that allowed lazy Clerk after isAuthDevBypassActive() === false.
 * New contract: middleware must never touch @clerk/nextjs at all; always passthrough;
 * auth bypass remains in app helpers (D/V suites stay green).
 *
 * App turns this suite green by rewriting apps/web/middleware.ts to a pure
 * NextResponse.next() passthrough with zero Clerk imports (static or dynamic).
 */
const webRoot = path.resolve(__dirname, "..");
const middlewarePath = path.join(webRoot, "middleware.ts");
const src = readFileSync(middlewarePath, "utf8");

/** Static ESM/CJS import of @clerk/nextjs (any subpath). */
const STATIC_CLERK_IMPORT =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']@clerk\/nextjs(?:\/[^"']*)?["']/;

/** Dynamic import() of @clerk/nextjs (any subpath, including /server). */
const DYNAMIC_CLERK_IMPORT =
  /import\s*\(\s*["']@clerk\/nextjs(?:\/[^"']*)?["']\s*\)/;

/** Any string reference that would load Clerk from middleware. */
const CLERK_PACKAGE_REF = /@clerk\/nextjs/;

describe("QA M' — durable Clerk-free middleware", () => {
  it("M1': middleware must NOT import Clerk at all (static or dynamic)", () => {
    expect(existsSync(middlewarePath), "apps/web/middleware.ts must exist").toBe(
      true,
    );

    expect(
      STATIC_CLERK_IMPORT.test(src),
      "M1': no static import from @clerk/nextjs (including @clerk/nextjs/server)",
    ).toBe(false);

    expect(
      DYNAMIC_CLERK_IMPORT.test(src),
      "M1': no dynamic import() of @clerk/nextjs (including @clerk/nextjs/server)",
    ).toBe(false);

    expect(
      CLERK_PACKAGE_REF.test(src),
      "M1': middleware.ts must not mention @clerk/nextjs at all",
    ).toBe(false);

    // Extra guards for common Clerk middleware symbols even if package string is obscured.
    expect(src).not.toMatch(/\bclerkMiddleware\b/);
    expect(src).not.toMatch(/\bcreateRouteMatcher\b/);
  });

  it("M2': middleware always returns NextResponse.next() (passthrough for all requests)", () => {
    // Source contract: default export must call NextResponse.next() and must not
    // branch into Clerk protect / clerkHandler. Prefer a pure passthrough body.
    expect(src).toMatch(/NextResponse\.next\s*\(/);

    // Must not invoke Clerk protect or hand off to a clerk handler.
    expect(src).not.toMatch(/\bauth\.protect\s*\(/);
    expect(src).not.toMatch(/\bclerkHandler\s*\(/);
    expect(src).not.toMatch(/\bclerkMiddleware\s*\(/);

    // Durable passthrough: no conditional Clerk path. If isAuthDevBypassActive
    // remains in middleware only as a dead branch that still loads Clerk on the
    // else path, that fails M1'/M2'. App should drop Clerk entirely and always
    // return NextResponse.next().
    const returnNextCount = (src.match(/return\s+NextResponse\.next\s*\(/g) ?? [])
      .length;
    expect(
      returnNextCount,
      "M2': middleware should return NextResponse.next() (passthrough)",
    ).toBeGreaterThanOrEqual(1);

    // Reject "bypass → next, else → Clerk" shape: any remaining dynamic/static
    // Clerk load means requests are not always passthrough at the source level.
    expect(
      DYNAMIC_CLERK_IMPORT.test(src) || STATIC_CLERK_IMPORT.test(src),
      "M2': passthrough must be unconditional — no Clerk import path for any request",
    ).toBe(false);
  });

  it("M3': auth bypass still lives in app helpers; D/V suites remain present", () => {
    const bypassPath = path.join(webRoot, "lib/auth/dev-bypass.ts");
    const sessionPath = path.join(webRoot, "lib/auth/session.ts");
    const dSuite = path.join(webRoot, "tests/auth-dev-bypass.test.ts");
    const vSuite = path.join(webRoot, "tests/auth-vercel-bypass.test.ts");

    expect(existsSync(bypassPath), "lib/auth/dev-bypass.ts must exist").toBe(
      true,
    );
    expect(existsSync(sessionPath), "lib/auth/session.ts must exist").toBe(true);
    expect(existsSync(dSuite), "tests/auth-dev-bypass.test.ts must remain").toBe(
      true,
    );
    expect(
      existsSync(vSuite),
      "tests/auth-vercel-bypass.test.ts must remain",
    ).toBe(true);

    const bypassSrc = readFileSync(bypassPath, "utf8");
    const sessionSrc = readFileSync(sessionPath, "utf8");

    expect(bypassSrc).toMatch(
      /export\s+function\s+isAuthDevBypassActive\s*\(/,
    );
    expect(sessionSrc).toMatch(/export\s+async\s+function\s+resolveAuthSession\s*\(/);
  });
});
