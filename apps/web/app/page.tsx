"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { FormEvent, useState } from "react";

type ChatResponse =
  | { ok: true; message: string; yearMonth: string; spendUsd: number }
  | { ok: false; code?: string; error: string };

export default function HomePage() {
  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = (await res.json()) as ChatResponse;
      if (!data.ok) {
        setError(
          data.code === "LIMIT_REACHED"
            ? `Limit reached (${data.code}): ${data.error}`
            : data.error,
        );
      } else {
        setReply(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>InflationMonitor</h1>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <SignedOut>
        <p>Sign in to use the chat. Unauthenticated requests cannot call the LLM.</p>
        <SignInButton mode="redirect">
          <button type="button">Sign in</button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <p style={{ color: "#555", fontSize: "0.9rem" }}>
          Metered OpenRouter chat ($5.00 USD / account / UTC calendar month).
          CPI tools are not wired yet — this is a protected stub.
        </p>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder="Ask something…"
            style={{ width: "100%", padding: "0.5rem" }}
            required
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
        {error && (
          <p role="alert" style={{ color: "#b00020", marginTop: "1rem" }}>
            {error}
          </p>
        )}
        {reply && (
          <pre
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "#f4f4f5",
              whiteSpace: "pre-wrap",
            }}
          >
            {reply}
          </pre>
        )}
      </SignedIn>
    </main>
  );
}
