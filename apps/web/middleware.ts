import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isAuthDevBypassActive } from "./lib/auth/dev-bypass";

/**
 * When AUTH_DEV_BYPASS (+ optional AUTH_ALLOW_VERCEL_BYPASS) is active, Clerk
 * keys are empty — we must NOT call clerkMiddleware() at module load or request
 * time, or Vercel returns MIDDLEWARE_INVOCATION_FAILED.
 *
 * Clerk is loaded lazily only when bypass is inactive.
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
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
