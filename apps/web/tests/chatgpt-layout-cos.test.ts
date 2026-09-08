import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * QA U1–U6 — ChatGPT-like CoS shell (RED until App implements U1/U3/U4/U5).
 *
 * App targets (feat/chatgpt-layout or equivalent):
 * - U1: sticky/fixed bottom composer; scrollable thread; user vs assistant
 *   bubbles; marketing hero hidden/collapsed once chatting.
 * - U2: DESIGN.md tokens remain (#090909 canvas, #0099ff accent, white pills)
 *   via theme module + CSS variables.
 * - U3: left sidebar stub with New chat + session history in DOM/contract.
 * - U4: AUTH_DEV_BYPASS suppresses Clerk configure/MFA overlay.
 * - U5: AU YoY-style assistant prose rendered once (no doubled message + text part).
 * - U6: existing E1–E6 + D1–D6 suites must stay green (this file is additive only).
 *
 * Prefer source/CSS/DOM-contract assertions (no Playwright). App may satisfy
 * via data-testid / CSS classes documented below.
 */

const webRoot = path.resolve(__dirname, "..");

function readWeb(rel: string): string {
  return readFileSync(path.join(webRoot, rel), "utf8");
}

const EXPECTED = {
  canvas: "#090909",
  accent: "#0099ff",
  primary: "#ffffff",
  onPrimary: "#000000",
  surface1: "#141414",
  surface2: "#1c1c1c",
  pill: "100px",
} as const;

function normalizeColor(value: string): string {
  return value.trim().toLowerCase();
}

describe("QA U1 — ChatGPT-like shell layout", () => {
  it("U1a: composer is position sticky or fixed at bottom (CSS contract)", () => {
    const css = readWeb("app/styles/globals.css");
    // ChatGPT-like: composer docks to viewport/shell bottom.
    const composerBlock =
      css.match(/\.im-composer\s*\{[^}]*\}/s)?.[0] ??
      css.match(/\[data-testid=["']composer["']\][^{]*\{[^}]*\}/s)?.[0] ??
      "";
    expect(
      composerBlock,
      "App must style .im-composer (or [data-testid=composer]) with position: sticky|fixed and bottom anchoring",
    ).toMatch(/position\s*:\s*(sticky|fixed)/i);
    expect(composerBlock).toMatch(/bottom\s*:/i);
  });

  it("U1b: message thread/column is scrollable (overflow-y auto|scroll)", () => {
    const css = readWeb("app/styles/globals.css");
    const threadBlock =
      css.match(/\.im-thread\s*\{[^}]*\}/s)?.[0] ??
      css.match(/\[data-testid=["']thread["']\][^{]*\{[^}]*\}/s)?.[0] ??
      css.match(/\.im-message-list\s*\{[^}]*\}/s)?.[0] ??
      "";
    expect(
      threadBlock,
      "App must make .im-thread / [data-testid=thread] / .im-message-list scrollable (overflow-y: auto|scroll)",
    ).toMatch(/overflow-y\s*:\s*(auto|scroll)/i);
  });

  it("U1c: distinct user vs assistant bubble classes/testids in page shell", () => {
    const page = readWeb("app/page.tsx");
    const hasUserBubble =
      /im-msg-user|data-testid=["']user-msg["']|data-testid=["']bubble-user["']/.test(
        page,
      );
    const hasAssistantBubble =
      /data-testid=["']assistant-msg["']|im-msg-assistant|data-testid=["']bubble-assistant["']/.test(
        page,
      );
    expect(hasUserBubble, "user bubble class/testid required").toBe(true);
    expect(hasAssistantBubble, "assistant bubble class/testid required").toBe(
      true,
    );
    // ChatGPT shell: chat column/shell must be primary layout region.
    expect(page).toMatch(/data-testid=["']chat-shell["']|className=["'][^"']*im-chat/);
  });

  it("U1d: after first message / when thread non-empty, hero must not dominate", () => {
    const page = readWeb("app/page.tsx");
    // Marketing hero must be gated: hidden/collapsed when chatting.
    const heroGated =
      /im-hero[\s\S]{0,200}(thread\.length|hasMessages|isChatting|chatStarted)/.test(
        page,
      ) ||
      /(thread\.length|hasMessages|isChatting|chatStarted)[\s\S]{0,200}im-hero/.test(
        page,
      ) ||
      /data-testid=["']hero["'][\s\S]{0,120}(hidden|collapsed|null)/.test(page) ||
      /im-hero--collapsed|im-hero--hidden|data-hero-visible=\{false\}/.test(page) ||
      /\{.*thread\.length\s*===\s*0.*im-hero|thread\.length\s*>\s*0[\s\S]{0,80}im-hero/.test(
        page,
      );

    expect(
      heroGated,
      "App must hide/collapse .im-hero (or data-testid=hero) once the thread has messages — marketing hero must not dominate while chatting",
    ).toBe(true);

    // Unconditional always-on hero section is insufficient for U1.
    const unconditionalHero =
      /<section\s+className=["']im-hero["']\s*>/.test(page) &&
      !/(thread\.length\s*===\s*0[\s\S]{0,120}<section\s+className=["']im-hero|\{thread\.length\s*===\s*0\s*&&\s*\([\s\S]{0,80}im-hero)/.test(
        page,
      );
    expect(
      unconditionalHero,
      "Unconditional <section className=\"im-hero\"> without thread gate fails U1d",
    ).toBe(false);
  });
});

describe("QA U2 — DESIGN.md tokens via theme + CSS", () => {
  it("U2a: theme module keeps canvas #090909 and accent #0099ff", async () => {
    const theme = (await import("../lib/ui/theme")) as {
      colors: Record<string, string>;
      rounded: Record<string, string>;
      components?: Record<string, Record<string, string>>;
    };
    expect(normalizeColor(theme.colors.canvas)).toBe(EXPECTED.canvas);
    const accent =
      theme.colors["accent-blue"] ??
      theme.colors.accentBlue ??
      theme.colors.accent;
    expect(normalizeColor(accent)).toBe(EXPECTED.accent);
  });

  it("U2b: white pill CTA tokens + CSS variables still wired", async () => {
    const theme = (await import("../lib/ui/theme")) as {
      colors: Record<string, string>;
      rounded: Record<string, string>;
      components?: Record<string, Record<string, string>>;
    };
    expect(normalizeColor(theme.colors.primary)).toBe(EXPECTED.primary);
    const onPrimary =
      theme.colors["on-primary"] ?? theme.colors.onPrimary ?? theme.colors.inkInverse;
    expect(normalizeColor(onPrimary)).toBe(EXPECTED.onPrimary);
    expect(String(theme.rounded.pill)).toBe(EXPECTED.pill);

    const css = readWeb("app/styles/globals.css");
    expect(css).toMatch(new RegExp(`--color-canvas:\\s*${EXPECTED.canvas}`, "i"));
    expect(css).toMatch(
      new RegExp(`--color-accent:\\s*${EXPECTED.accent}`, "i"),
    );
    expect(css).toMatch(
      new RegExp(`--color-primary:\\s*${EXPECTED.primary}`, "i"),
    );
    expect(css).toMatch(/--radius-pill:\s*100px/i);
    expect(css).toMatch(/--color-surface-1:\s*#141414/i);
    expect(css).toMatch(/--color-surface-2:\s*#1c1c1c/i);
  });
});

describe("QA U3 — left sidebar stub (new chat + session history)", () => {
  it("U3a: page/shell includes left sidebar stub in DOM contract", () => {
    const page = readWeb("app/page.tsx");
    const hasSidebar =
      /data-testid=["'](chat-)?sidebar["']|className=["'][^"']*im-sidebar|className=\{["']im-sidebar/.test(
        page,
      );
    expect(
      hasSidebar,
      "App must render a left sidebar stub (data-testid=\"sidebar\"|\"chat-sidebar\" or class im-sidebar)",
    ).toBe(true);
  });

  it("U3b: sidebar exposes New chat control + session history list", () => {
    const page = readWeb("app/page.tsx");
    const hasNewChat =
      /data-testid=["']new-chat["']|New chat|newChat|onNewChat/.test(page);
    const hasHistory =
      /data-testid=["']session-history["']|data-testid=["']chat-history["']|im-session-history|sessionHistory/.test(
        page,
      );
    expect(
      hasNewChat,
      "Sidebar must include a New chat control (data-testid=\"new-chat\" or visible New chat affordance)",
    ).toBe(true);
    expect(
      hasHistory,
      "Sidebar must include session history list (data-testid=\"session-history\"|\"chat-history\" or im-session-history)",
    ).toBe(true);
  });
});

describe("QA U4 — AUTH_DEV_BYPASS suppresses Clerk configure overlay", () => {
  it("U4a: root layout does not unconditionally mount ClerkProvider when bypass can be active", () => {
    const layout = readWeb("app/layout.tsx");
    // Always-on <ClerkProvider> with empty keys shows Clerk "configure" overlay.
    // App must gate provider (isAuthDevBypassActive / AUTH_DEV_BYPASS / NEXT_PUBLIC_…)
    // or mount a documented suppressed shell.
    const mentionsBypassGate =
      /isAuthDevBypassActive|AUTH_DEV_BYPASS|NEXT_PUBLIC_AUTH_DEV_BYPASS|clerk-overlay-suppressed|auth-bypass-shell/.test(
        layout,
      );
    expect(
      mentionsBypassGate,
      "layout.tsx must gate ClerkProvider / document overlay suppression when AUTH_DEV_BYPASS is active",
    ).toBe(true);

    const unconditionalProvider =
      /<ClerkProvider>/.test(layout) &&
      !/(isAuthDevBypassActive|AUTH_DEV_BYPASS|NEXT_PUBLIC_AUTH_DEV_BYPASS)/.test(
        layout,
      );
    expect(
      unconditionalProvider,
      "Unconditional <ClerkProvider> without bypass gate fails U4 (Clerk configure overlay appears when keys empty)",
    ).toBe(false);
  });

  it("U4b: documented suppress flag or bypass shell testid exists for QA", () => {
    const layout = readWeb("app/layout.tsx");
    const page = readWeb("app/page.tsx");
    const combined = `${layout}\n${page}`;
    const hasDocumentedHook =
      /data-testid=["'](clerk-overlay-suppressed|auth-bypass-shell|clerk-bypassed)["']/.test(
        combined,
      ) ||
      /isAuthDevBypassActive\(\)/.test(layout) ||
      (/ClerkProvider/.test(layout) &&
        /isAuthDevBypassActive|AUTH_DEV_BYPASS/.test(layout) &&
        /!\s*bypass|bypass\s*\?\s*|if\s*\(\s*bypass|if\s*\(\s*isAuthDevBypassActive/.test(
          layout,
        ));

    expect(
      hasDocumentedHook,
      "App must expose data-testid=\"clerk-overlay-suppressed\"|\"auth-bypass-shell\" or conditionally skip ClerkProvider via isAuthDevBypassActive()",
    ).toBe(true);
  });
});

describe("QA U5 — no duplicated AU YoY assistant prose", () => {
  it("U5a: assistant UI must not unconditionally render message text AND AnswerParts text parts", () => {
    const page = readWeb("app/page.tsx");
    // Extract assistant branch roughly: between assistant-msg and next role branch end.
    const assistantIdx = page.indexOf('data-testid="assistant-msg"');
    expect(assistantIdx).toBeGreaterThanOrEqual(0);
    const assistantSlice = page.slice(assistantIdx, assistantIdx + 900);

    const rendersStandaloneText =
      /\{item\.text\}|\{item\.answer\.prose\}|assistant-prose/.test(
        assistantSlice,
      );
    const rendersParts = /AnswerPartsView/.test(assistantSlice);

    // If both paths exist, App must dedupe (skip text parts when prose shown, or vice versa).
    if (rendersStandaloneText && rendersParts) {
      const hasDedupeGuard =
        /hasTextPart|textParts|dedupe|dedup|omitText|skipText|proseOnly|partsWithoutText|filter\([\s\S]*type\s*!==\s*["']text["']|type\s*===\s*["']text["']/.test(
          assistantSlice,
        ) ||
        /data-testid=["']assistant-prose["']/.test(assistantSlice);
      expect(
        hasDedupeGuard,
        "Rendering both item.text and AnswerPartsView without a text-part dedupe guard doubles YoY prose — App must show a single answer block",
      ).toBe(true);
    } else {
      // Single path is fine.
      expect(rendersStandaloneText || rendersParts).toBe(true);
    }
  });

  it("U5b: AnswerPartsView consumers document single prose block for YoY-style answers", () => {
    const page = readWeb("app/page.tsx");
    const partsView = readWeb("components/chat/AnswerParts.tsx");

    // Preferred contract: exactly one prose mount point with testid.
    const hasSingleProseTestId =
      /data-testid=["']assistant-prose["']/.test(page) ||
      /data-testid=["']assistant-prose["']/.test(partsView);

    // Or page strips duplicate text parts before AnswerPartsView.
    const stripsTextParts =
      /parts\.filter\([\s\S]{0,120}text|withoutTextParts|proseParts|displayParts/.test(
        page,
      );

    // Or AnswerPartsView accepts hideText / suppressText when parent shows prose.
    const partsSupportsSuppress =
      /hideText|suppressText|omitText|renderText\s*=/.test(partsView);

    expect(
      hasSingleProseTestId || stripsTextParts || partsSupportsSuppress,
      "App must expose data-testid=\"assistant-prose\" once, or strip/suppress duplicate text parts so AU YoY prose is not doubled",
    ).toBe(true);
  });
});

describe("QA U6 — existing E/D suites remain the regression gate", () => {
  it("U6a: additive CoS file only — prior E4/E5/D modules still present", () => {
    // Meta guard: this PR must not delete prior acceptance suites.
    expect(() => readWeb("tests/genui-parts.test.ts")).not.toThrow();
    expect(() => readWeb("tests/design-tokens.test.ts")).not.toThrow();
    expect(() => readWeb("tests/auth-dev-bypass.test.ts")).not.toThrow();
    expect(() => readWeb("tests/cf-workers-ai.test.ts")).not.toThrow();
    expect(() => readWeb("tests/cf-metering.test.ts")).not.toThrow();
  });
});
