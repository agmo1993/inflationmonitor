import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isAuthDevBypassActive } from "./lib/auth/dev-bypass";

/**
 * MIDDLEWARE_ESM_CJS_MITIGATION
 *
 * Vercel logged MIDDLEWARE_INVOCATION_FAILED with:
 *   Failed to load ES module: /var/task/middleware.js
 *   SyntaxError: Cannot use import statement outside a module
 * when middleware ran as Node λ (CJS loader vs ESM output).
 *
 * Mitigation (Next 15.5.25): keep middleware on Edge — do NOT set
 * config.runtime = "nodejs", do NOT enable experimental nodeMiddleware,
 * and do NOT add "type":"module" to apps/web or root package.json.
 * Explicit runtime: "edge" locks the Edge path for Vercel.
 *
 * When AUTH_DEV_BYPASS (+ optional AUTH_ALLOW_VERCEL_BYPASS) is active, Clerk
 * keys are empty — we must NOT call clerkMiddleware() at module load or request
 * time. Clerk is loaded lazily only when bypass is inactive.
 */
export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isAuthDevBypassActive()) {
    return NextResponse.next();
  }

  const { clerkMiddleware, createRouteMatcher } = await import(
    "@clerk/nextjs/server"
  );
  const isPublicRoute = createRouteMatcher([
    "/sign-in(.*)",
    "/api/health(.*)",
  ]);
  const clerkHandler = clerkMiddleware(async (auth, request) => {
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  });
  return clerkHandler(req, event);
}

export const config = {
  // MIDDLEWARE_RUNTIME_EDGE — keepMiddlewareOnEdge / middleware on Edge
  runtime: "edge",
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
