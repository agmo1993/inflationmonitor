import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA L0 — IM monogram logo contract (RED until App ships mark + wiring).
 *
 * Locked mark: white geometric IM with #0099ff accent on black #090909;
 * no pulse / hybrid treatments.
 *
 * Acceptance:
 * - L0a: apps/web/public/logo-im.svg exists; SVG contains #0099ff and
 *   #090909 (or black equivalent) and is not empty.
 * - L0b: sidebar / header uses the logo (img src /logo-im.svg or
 *   data-testid="app-logo" referencing it).
 * - L0c: favicon/metadata in layout or public/favicon uses logo-im or a
 *   dedicated favicon derived from it (assert link rel=icon href in
 *   layout.tsx or file public/favicon.ico|svg exists and layout
 *   references it).
 *
 * Prefer fs + source-string contracts (no Playwright). Do not implement
 * product UI/assets in this suite — tests only.
 */

const webRoot = path.resolve(__dirname, "..");

function readWeb(rel: string): string {
  return readFileSync(path.join(webRoot, rel), "utf8");
}

function webPath(rel: string): string {
  return path.join(webRoot, rel);
}

const LOGO_REL = "public/logo-im.svg";
const ACCENT = "#0099ff";
const CANVAS = "#090909";

/** Black fill/stroke equivalents accepted for the mark canvas. */
function hasBlackEquivalent(svg: string): boolean {
  return (
    /#090909\b/i.test(svg) ||
    /#000000\b/i.test(svg) ||
    /#000\b/i.test(svg) ||
    /\bblack\b/i.test(svg) ||
    /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(svg)
  );
}

describe("QA L0 — IM monogram logo asset + shell wiring", () => {
  it("L0a: public/logo-im.svg exists, non-empty, with #0099ff + #090909 (or black)", () => {
    const abs = webPath(LOGO_REL);
    expect(
      existsSync(abs),
      "App must add apps/web/public/logo-im.svg (white geometric IM + #0099ff on #090909; no pulse/hybrid)",
    ).toBe(true);

    const st = statSync(abs);
    expect(st.size, "logo-im.svg must not be empty").toBeGreaterThan(0);

    const svg = readWeb(LOGO_REL);
    expect(svg.trim().length, "logo-im.svg content must not be empty").toBeGreaterThan(0);
    expect(svg, "logo-im.svg must be an SVG document").toMatch(/<svg[\s>]/i);
    expect(
      svg,
      `logo-im.svg must include accent ${ACCENT}`,
    ).toMatch(new RegExp(ACCENT, "i"));
    expect(
      hasBlackEquivalent(svg),
      `logo-im.svg must include canvas ${CANVAS} or black equivalent (#000/#000000/black)`,
    ).toBe(true);

    // Locked mark: no pulse / hybrid motion treatments in the asset.
    expect(
      /pulse|@keyframes|animateTransform|hybrid/i.test(svg),
      "logo-im.svg must not use pulse/hybrid animation treatments",
    ).toBe(false);
  });

  it("L0b: sidebar / header references logo-im.svg (img src or data-testid=app-logo)", () => {
    const page = readWeb("app/page.tsx");
    const shellSources = [page];

    // Optional dedicated logo component if App extracts it.
    const logoComponentCandidates = [
      "components/Logo.tsx",
      "components/logo.tsx",
      "components/brand/Logo.tsx",
      "components/ui/Logo.tsx",
      "components/AppLogo.tsx",
    ];
    for (const rel of logoComponentCandidates) {
      if (existsSync(webPath(rel))) {
        shellSources.push(readWeb(rel));
      }
    }

    const combined = shellSources.join("\n");

    const hasImgSrc =
      /src=["']\/logo-im\.svg["']/.test(combined) ||
      /src=\{["']\/logo-im\.svg["']\}/.test(combined);

    const hasAppLogoTestId = /data-testid=["']app-logo["']/.test(combined);
    const appLogoReferencesAsset =
      hasAppLogoTestId &&
      (/logo-im\.svg/.test(combined) ||
        /src=["'][^"']*logo-im/.test(combined) ||
        /href=["'][^"']*logo-im/.test(combined));

    // Logo must appear in sidebar and/or header/nav regions of the shell.
    const sidebarOrHeaderMentionsLogo =
      /im-sidebar[\s\S]{0,800}(logo-im\.svg|data-testid=["']app-logo["'])/.test(
        page,
      ) ||
      /data-testid=["']sidebar["'][\s\S]{0,800}(logo-im\.svg|data-testid=["']app-logo["'])/.test(
        page,
      ) ||
      /im-nav[\s\S]{0,800}(logo-im\.svg|data-testid=["']app-logo["'])/.test(
        page,
      ) ||
      /<header[\s\S]{0,800}(logo-im\.svg|data-testid=["']app-logo["'])/.test(
        page,
      ) ||
      // Or a shared Logo component imported into the shell page.
      (/from ["']@?\/?.*[Ll]ogo["']|from ["']\.\.?\/.*[Ll]ogo["']/.test(page) &&
        (hasImgSrc || appLogoReferencesAsset));

    expect(
      hasImgSrc || appLogoReferencesAsset,
      'Sidebar/header must use <img src="/logo-im.svg"> or data-testid="app-logo" that references logo-im.svg',
    ).toBe(true);

    expect(
      sidebarOrHeaderMentionsLogo,
      "logo-im / app-logo must be wired into sidebar (im-sidebar) and/or header (im-nav / <header>)",
    ).toBe(true);
  });

  it("L0c: favicon/metadata uses logo-im or dedicated favicon referenced from layout", () => {
    const layout = readWeb("app/layout.tsx");

    const faviconFiles = [
      "public/favicon.ico",
      "public/favicon.svg",
      "public/logo-im.svg",
    ] as const;

    const existingFavicon = faviconFiles.filter((rel) => existsSync(webPath(rel)));

    // Preferred: explicit <link rel="icon" ...> in layout (App Router may also
    // use metadata.icons — accept both).
    const linkRelIcon =
      /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i.test(layout) ||
      /rel:\s*["'](?:shortcut )?icon["']/i.test(layout);

    const metadataIcons =
      /icons\s*:/.test(layout) ||
      /icon:\s*["'][^"']+["']/.test(layout) ||
      /favicon/i.test(layout);

    const layoutReferencesLogoOrFavicon =
      /logo-im\.svg|favicon\.(ico|svg)|\/favicon/i.test(layout);

    const hasFileAndLayoutRef =
      existingFavicon.length > 0 && layoutReferencesLogoOrFavicon;

    const hasLinkWithHref =
      /rel=["'](?:shortcut )?icon["'][^>]*href=["'][^"']+(logo-im|favicon)/i.test(
        layout,
      ) ||
      /href=["'][^"']+(logo-im|favicon)[^"']*["'][^>]*rel=["'](?:shortcut )?icon["']/i.test(
        layout,
      ) ||
      /icons\s*:\s*\{[\s\S]*?(logo-im|favicon)/i.test(layout) ||
      /icon:\s*["'][^"']*(logo-im|favicon)/i.test(layout);

    expect(
      linkRelIcon || metadataIcons || hasFileAndLayoutRef || hasLinkWithHref,
      "layout.tsx must declare link rel=icon (or metadata.icons) pointing at logo-im / favicon, or public/favicon.ico|svg must exist and be referenced from layout",
    ).toBe(true);

    expect(
      hasLinkWithHref || hasFileAndLayoutRef,
      "Favicon contract: layout must reference logo-im.svg or public/favicon.ico|svg (derived from the IM mark)",
    ).toBe(true);
  });
});
