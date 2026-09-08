import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";
import "./styles/globals.css";

export const metadata: Metadata = {
  title: "InflationMonitor",
  description:
    "CPI chat assistant — Clerk auth, Cloudflare Workers AI, generative UI",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
