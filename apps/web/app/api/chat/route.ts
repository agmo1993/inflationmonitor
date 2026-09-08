import { NextRequest, NextResponse } from "next/server";
import { handleChatRequest } from "@/lib/chat/handler";

export const runtime = "nodejs";

/**
 * Protected chat API.
 * Unauthenticated → 401 (no LLM). Over monthly cap → 402 { code: "LIMIT_REACHED" }.
 */
export async function POST(req: NextRequest) {
  let payload: { message?: unknown } = {};
  try {
    payload = (await req.json()) as { message?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const result = await handleChatRequest(payload);
  return NextResponse.json(result.body, { status: result.status });
}

/** GET is also protected — no anonymous probing of the chat endpoint. */
export async function GET() {
  const result = await handleChatRequest({ message: undefined });
  // Auth failure → 401; missing message after auth → 400. Never runs LLM on GET.
  if (result.status === 401) {
    return NextResponse.json(result.body, { status: 401 });
  }
  return NextResponse.json(
    { ok: false, code: "BAD_REQUEST", error: "Use POST with { message }" },
    { status: 405 },
  );
}
