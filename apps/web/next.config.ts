import type { NextConfig } from "next";

/**
 * MIDDLEWARE_ESM_CJS_MITIGATION / MIDDLEWARE_RUNTIME_EDGE
 * keepMiddlewareOnEdge — middleware stays on Edge (see middleware.ts).
 * Do not enable experimental.nodeMiddleware.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
