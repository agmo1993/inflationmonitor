import { NextResponse, type NextRequest } from "next/server";

/**
 * MIDDLEWARE_ESM_CJS_MITIGATION
 *
 * Durable Vercel bypass-deploy middleware (Next 15.5.25):
 * - Pure Edge passthrough — zero Clerk imports (static or dynamic).
 * - A dynamic Clerk server import pulled Node APIs into the middleware
 *   bundle → Node λ → ESM-as-CJS MIDDLEWARE_INVOCATION_FAILED.
 * - Do NOT set config.runtime ("edge" is rejected by Next 15.5; "nodejs"
 *   reopens the λ crash). Default Edge only.
 * - Do NOT enable experimental.nodeMiddleware.
 * - Do NOT add "type":"module" to apps/web or root package.json.
 *
 * Auth for AUTH_DEV_BYPASS + AUTH_ALLOW_VERCEL_BYPASS lives in app helpers
 * (lib/auth), not middleware. When real Clerk keys land, protect routes in
 * app code or revisit middleware only with an Edge-safe Clerk path (no Node).
 */
export default function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
