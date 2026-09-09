import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";
import { isAuthDevBypassActive } from "@/lib/auth/dev-bypass";
import "./styles/globals.css";

export const metadata: Metadata = {
  title: "InflationMonitor",
  description:
    "CPI chat assistant — Clerk auth, Cloudflare Workers AI, generative UI",
  icons: {
    icon: [{ url: "/logo-im.svg", type: "image/svg+xml" }],
    shortcut: "/logo-im.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // AUTH_DEV_BYPASS: skip ClerkProvider so empty keys don't show the
  // Clerk "configure your application" overlay during local QA.
  if (isAuthDevBypassActive()) {
    return (
      <html lang="en" data-testid="clerk-overlay-suppressed">
        <body data-testid="auth-bypass-shell">{children}</body>
      </html>
    );
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
