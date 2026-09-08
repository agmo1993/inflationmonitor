import { describe, expect, it } from "vitest";

/**
 * QA E5 — DESIGN.md Framer token contract (RED until App adds theme module).
 *
 * Source of truth: repo-root DESIGN.md
 * App module expected: apps/web/lib/ui/theme.ts (shared theme / design tokens)
 *
 * Locked tokens for this acceptance:
 * - colors.canvas: #090909 (dark canvas)
 * - colors.accent-blue: #0099ff
 * - white pill CTA: colors.primary #ffffff + rounded.pill 100px
 *   (components.button-primary)
 */

const EXPECTED = {
  canvas: "#090909",
  accentBlue: "#0099ff",
  primary: "#ffffff",
  onPrimary: "#000000",
  ink: "#ffffff",
  inkMuted: "#999999",
  surface1: "#141414",
  surface2: "#1c1c1c",
  pillRadius: "100px",
} as const;

async function loadThemeModule(): Promise<{
  colors: Record<string, string>;
  rounded: Record<string, string>;
  components?: Record<string, Record<string, string>>;
}> {
  try {
    return (await import("../lib/ui/theme")) as {
      colors: Record<string, string>;
      rounded: Record<string, string>;
      components?: Record<string, Record<string, string>>;
    };
  } catch {
    expect.fail(
      "App must add apps/web/lib/ui/theme.ts exporting DESIGN.md tokens (colors.canvas #090909, accent-blue #0099ff, white pill button-primary)",
    );
  }
}

function normalizeColor(value: string): string {
  return value.trim().toLowerCase();
}

describe("QA E5 — DESIGN.md Framer tokens in shared theme module", () => {
  it("E5a: theme module exports dark canvas #090909 and accent #0099ff", async () => {
    const theme = await loadThemeModule();

    expect(normalizeColor(theme.colors.canvas ?? theme.colors["canvas"])).toBe(
      EXPECTED.canvas,
    );
    const accent =
      theme.colors["accent-blue"] ??
      theme.colors.accentBlue ??
      theme.colors.accent;
    expect(normalizeColor(accent)).toBe(EXPECTED.accentBlue);
  });

  it("E5b: white pill CTA tokens (primary #ffffff, on-primary #000000, pill 100px)", async () => {
    const theme = await loadThemeModule();

    expect(normalizeColor(theme.colors.primary)).toBe(EXPECTED.primary);
    const onPrimary =
      theme.colors["on-primary"] ?? theme.colors.onPrimary ?? theme.colors.inkInverse;
    expect(normalizeColor(onPrimary)).toBe(EXPECTED.onPrimary);
    expect(String(theme.rounded.pill)).toBe(EXPECTED.pillRadius);

    // Prefer explicit button-primary component contract when present
    const buttonPrimary =
      theme.components?.["button-primary"] ?? theme.components?.buttonPrimary;
    if (buttonPrimary) {
      expect(normalizeColor(buttonPrimary.backgroundColor ?? "")).toMatch(
        /#ffffff|\{colors\.primary\}/i,
      );
      expect(String(buttonPrimary.rounded ?? "")).toMatch(
        /100px|\{rounded\.pill\}|pill/i,
      );
    }
  });

  it("E5c: key surface/ink tokens from DESIGN.md exist", async () => {
    const theme = await loadThemeModule();

    expect(normalizeColor(theme.colors.ink)).toBe(EXPECTED.ink);
    const inkMuted = theme.colors["ink-muted"] ?? theme.colors.inkMuted;
    expect(normalizeColor(inkMuted)).toBe(EXPECTED.inkMuted);
    const surface1 = theme.colors["surface-1"] ?? theme.colors.surface1;
    const surface2 = theme.colors["surface-2"] ?? theme.colors.surface2;
    expect(normalizeColor(surface1)).toBe(EXPECTED.surface1);
    expect(normalizeColor(surface2)).toBe(EXPECTED.surface2);
  });
});
