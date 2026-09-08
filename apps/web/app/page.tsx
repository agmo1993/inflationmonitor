"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { FormEvent, useMemo, useState } from "react";
import { AnswerPartsView } from "@/components/chat/AnswerParts";
import type { Answer } from "@/lib/chat/answer";

type ChatSuccess = {
  ok: true;
  message: string;
  answer?: Answer;
  yearMonth: string;
  spendUsd: number;
};

type ChatFailure = { ok: false; code?: string; error: string };
type ChatResponse = ChatSuccess | ChatFailure;

type ThreadItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; answer?: Answer; spendUsd?: number; yearMonth?: string }
  | { role: "error"; text: string };

const PROMPTS = [
  "latest AU CPI",
  "latest US CPI",
  "YoY inflation",
  "compare AU vs US",
  "show cpi chart and table",
];

export default function HomePage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const bypassHint = useMemo(
    () =>
      typeof window !== "undefined" &&
      process.env.NEXT_PUBLIC_AUTH_DEV_BYPASS === "1",
    [],
  );

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setThread((t) => [...t, { role: "user", text: trimmed }]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json()) as ChatResponse;
      if (!data.ok) {
        setThread((t) => [
          ...t,
          {
            role: "error",
            text:
              data.code === "LIMIT_REACHED"
                ? `Limit reached (${data.code}): ${data.error}`
                : data.error,
          },
        ]);
      } else {
        setThread((t) => [
          ...t,
          {
            role: "assistant",
            text: data.message,
            answer: data.answer,
            spendUsd: data.spendUsd,
            yearMonth: data.yearMonth,
          },
        ]);
      }
    } catch (err) {
      setThread((t) => [
        ...t,
        {
          role: "error",
          text: err instanceof Error ? err.message : "Request failed",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await send(input);
  }

  return (
    <div className="im-shell">
      <header className="im-nav">
        <h1 className="im-brand">InflationMonitor</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="redirect">
              <button type="button" className="im-pill im-pill-primary">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </header>

      <main className="im-main">
        <section className="im-hero">
          <h2>Ask inflation.</h2>
          <p>
            Dark cinematic chat with generative charts and tables. Metered
            Cloudflare Workers AI — $5 USD / account / UTC month.
            {bypassHint ? " AUTH_DEV_BYPASS is on for local QA." : null}
          </p>
        </section>

        <SignedOut>
          <p style={{ color: "var(--color-ink-muted)" }}>
            Sign in to use chat. Unauthenticated requests cannot call the LLM.
            For local QA without Clerk, set AUTH_DEV_BYPASS=1 and leave Clerk
            keys empty, then restart on port 3001.
          </p>
        </SignedOut>

        {/* Bypass mode skips Clerk UI; still render chat shell when signed-in OR
            when middleware allows anonymous page load under AUTH_DEV_BYPASS. */}
        <div className="im-chat" data-testid="chat-shell">
          <div className="im-chips" data-testid="prompt-chips">
            {PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="im-chip"
                onClick={() => send(p)}
                disabled={busy}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="im-thread" data-testid="thread">
            {thread.length === 0 && (
              <div className="im-msg">
                <div className="im-msg-meta">assistant</div>
                <p style={{ margin: 0, color: "var(--color-ink-muted)" }}>
                  Try “latest AU CPI”, “YoY”, “compare AU vs US”, or “chart”.
                  Fixture series cite ABS / BLS source and period.
                </p>
              </div>
            )}
            {thread.map((item, i) => {
              if (item.role === "user") {
                return (
                  <div className="im-msg im-msg-user" key={i}>
                    <div className="im-msg-meta">you</div>
                    <div>{item.text}</div>
                  </div>
                );
              }
              if (item.role === "error") {
                return (
                  <p className="im-alert" role="alert" key={i}>
                    {item.text}
                  </p>
                );
              }
              return (
                <div className="im-msg" key={i} data-testid="assistant-msg">
                  <div className="im-msg-meta">
                    assistant
                    {typeof item.spendUsd === "number"
                      ? ` · spend $${item.spendUsd.toFixed(4)} (${item.yearMonth})`
                      : ""}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{item.text}</div>
                  {item.answer?.parts?.length ? (
                    <AnswerPartsView parts={item.answer.parts} />
                  ) : null}
                </div>
              );
            })}
          </div>

          <form className="im-composer" onSubmit={onSubmit} data-testid="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about latest AU/US CPI, YoY, compare, chart…"
              required
              data-testid="chat-input"
            />
            <div className="im-composer-row">
              <span style={{ color: "var(--color-ink-muted)", fontSize: 12 }}>
                Generative UI · Workers AI · $5/mo hard stop
              </span>
              <button
                type="submit"
                className="im-pill im-pill-primary"
                disabled={busy || !input.trim()}
                data-testid="send-button"
              >
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
