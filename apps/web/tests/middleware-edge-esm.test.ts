import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA E — Vercel middleware Edge / ESM·CJS contract (RED until App fixes).
 *
 * Root cause on Vercel: middleware invoked as Node λ with
 *   SyntaxError: Cannot use import statement outside a module
 * (ESM source loaded as CJS). Tied to Edge vs Node middleware runtime and
 * `"type": "module"` / Next 15.5+ `config.runtime = 'nodejs'`.
 *
 * Current baseline (read 2026-09-09):
 * - apps/web/package.json and root package.json do NOT set `"type": "module"`
 *   (packages/data does — scoped to that workspace only).
 * - apps/web/middleware.ts has matcher config only; no runtime export.
 * - apps/web/next.config.ts has no middleware / nodeMiddleware flags.
 *
 * Chosen App mitigation this suite locks (smallest precise reds):
 * - E1: Keep middleware on Edge — forbid Node.js runtime on middleware;
 *   require an explicit Edge declaration (config.runtime or export, or a
 *   documented next.config keep-Edge marker App can add).
 * - E2: Keep apps/web + root without `"type": "module"`, and document the
 *   ESM/CJS mitigation with the stable marker below so the intent is
 *   discoverable in code/config (App adds the marker + any config tweak).
 * - E3: Do not break existing M1–M3 / D* / V* suites (this file only adds
 *   assertions; product code unchanged here).
 *
 * Marker App must place in middleware.ts and/or next.config.ts (comment OK):
 *   MIDDLEWARE_ESM_CJS_MITIGATION
 */

const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "../..");

function readUtf8(abs: string): string {
  return readFileSync(abs, "utf8");
}

function readJson(abs: string): Record<string, unknown> {
  return JSON.parse(readUtf8(abs)) as Record<string, unknown>;
}

const middlewarePath = path.join(webRoot, "middleware.ts");
const nextConfigPath = path.join(webRoot, "next.config.ts");
const webPkgPath = path.join(webRoot, "package.json");
const rootPkgPath = path.join(repoRoot, "package.json");
const mBypassPath = path.join(webRoot, "tests/middleware-bypass.test.ts");

const ESM_MITIGATION_MARKER = "MIDDLEWARE_ESM_CJS_MITIGATION";

/** Explicit Edge declaration App may add to satisfy E1. */
const EDGE_RUNTIME_DECL =
  /(?:export\s+const\s+runtime\s*=\s*['"]edge['"])|(?:runtime\s*:\s*['"]edge['"])/;

/** Documented keep-Edge note in next.config (alternative to runtime decl). */
const EDGE_CONFIG_DOC =
  /keepMiddlewareOnEdge|middleware\s+on\s+Edge|MIDDLEWARE_RUNTIME_EDGE/i;

/** Forbidden Node.js middleware runtime (Next 15.5+ stable). */
const NODEJS_RUNTIME_DECL =
  /(?:export\s+const\s+runtime\s*=\s*['"]nodejs['"])|(?:runtime\s*:\s*['"]nodejs['"])/;

describe("QA E — middleware Edge runtime / ESM·CJS (Vercel)", () => {
  it("E1: middleware must stay on Edge (no nodejs runtime; explicit Edge setup)", () => {
    expect(existsSync(middlewarePath), "apps/web/middleware.ts must exist").toBe(
      true,
    );
    const mw = readUtf8(middlewarePath);
    const cfg = existsSync(nextConfigPath) ? readUtf8(nextConfigPath) : "";

    expect(
      NODEJS_RUNTIME_DECL.test(mw),
      "middleware must NOT declare runtime 'nodejs' (Vercel Node λ + ESM/CJS SyntaxError). Prefer Edge.",
    ).toBe(false);

    const hasExplicitEdge =
      EDGE_RUNTIME_DECL.test(mw) || EDGE_CONFIG_DOC.test(cfg);
    expect(
      hasExplicitEdge,
      "App must declare Edge middleware: set `runtime: 'edge'` in middleware config " +
        "(or `export const runtime = 'edge'`), OR document keep-Edge in next.config.ts " +
        "via keepMiddlewareOnEdge / 'middleware on Edge' / MIDDLEWARE_RUNTIME_EDGE",
    ).toBe(true);
  });

  it("E2: no root/apps/web type:module without documented ESM mitigation", () => {
    expect(existsSync(webPkgPath), "apps/web/package.json must exist").toBe(true);
    expect(existsSync(rootPkgPath), "root package.json must exist").toBe(true);

    const webPkg = readJson(webPkgPath);
    const rootPkg = readJson(rootPkgPath);

    // Chosen mitigation for current tree (neither package has type:module):
    // keep omitting it on apps/web + root, and document why in code/config.
    expect(
      webPkg.type,
      'apps/web/package.json must NOT set "type":"module" (avoids Vercel loading middleware.js as ESM under Node require/CJS launcher)',
    ).not.toBe("module");
    expect(
      rootPkg.type,
      'root package.json must NOT set "type":"module" (same Vercel middleware ESM/CJS risk)',
    ).not.toBe("module");

    const mw = existsSync(middlewarePath) ? readUtf8(middlewarePath) : "";
    const cfg = existsSync(nextConfigPath) ? readUtf8(nextConfigPath) : "";
    const documented =
      mw.includes(ESM_MITIGATION_MARKER) || cfg.includes(ESM_MITIGATION_MARKER);

    expect(
      documented,
      `App must document the chosen mitigation with marker "${ESM_MITIGATION_MARKER}" ` +
        "in middleware.ts and/or next.config.ts (comment OK). Example: keep apps/web " +
        'without "type":"module"; do not set middleware config.runtime to nodejs; ' +
        "keep middleware on Edge for Vercel.",
    ).toBe(true);

    // Guard: next.config must not force Node middleware experimental path.
    expect(
      /nodeMiddleware\s*:\s*true/.test(cfg),
      "next.config must not enable experimental nodeMiddleware: true (forces Node λ path)",
    ).toBe(false);
  });

  it("E3: M1–M3 middleware-bypass suite file remains present (D/V untouched)", () => {
    expect(
      existsSync(mBypassPath),
      "tests/middleware-bypass.test.ts must remain (M1–M3)",
    ).toBe(true);
    const mSrc = readUtf8(mBypassPath);
    expect(mSrc).toMatch(/\bM1\b/);
    expect(mSrc).toMatch(/\bM2\b/);
    expect(mSrc).toMatch(/\bM3\b/);
    // D/V suites are separate files — assert they still exist so App fix
    // cannot delete them as collateral.
    expect(existsSync(path.join(webRoot, "tests/auth-dev-bypass.test.ts"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(webRoot, "tests/auth-vercel-bypass.test.ts")),
    ).toBe(true);
  });
});
