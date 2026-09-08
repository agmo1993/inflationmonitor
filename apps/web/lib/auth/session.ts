/**
 * Auth session abstraction so route handlers and tests share one shape.
 * Production uses Clerk; tests inject a mock resolver.
 */

export type AuthSession =
  | { authenticated: true; accountId: string }
  | { authenticated: false; reason: "unauthenticated" | "invalid_session" };

export type AuthResolver = () => Promise<AuthSession>;

let resolver: AuthResolver | null = null;

export function setAuthResolver(next: AuthResolver | null) {
  resolver = next;
}

export async function resolveAuthSession(): Promise<AuthSession> {
  if (resolver) return resolver();
  return resolveClerkSession();
}

async function resolveClerkSession(): Promise<AuthSession> {
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    const userId = session.userId;
    if (!userId) {
      return { authenticated: false, reason: "unauthenticated" };
    }
    return { authenticated: true, accountId: userId };
  } catch {
    // Missing keys / invalid session material → treat as unauthenticated
    return { authenticated: false, reason: "invalid_session" };
  }
}
