import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "InflationMonitor",
  description: "CPI chat assistant — auth + metered OpenRouter gateway",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
