import type { NextConfig } from "next";

/**
 * MIDDLEWARE_ESM_CJS_MITIGATION / MIDDLEWARE_RUNTIME_EDGE
 * keepMiddlewareOnEdge — middleware on Edge via Next default (omit config.runtime).
 * Next 15.5.25 rejects runtime: "edge" on middleware; never set nodejs either.
 * Do not enable experimental.nodeMiddleware.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
