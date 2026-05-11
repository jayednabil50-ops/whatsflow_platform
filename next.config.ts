import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate dev and production artifacts so one server mode cannot break
  // the other's CSS/JS asset lookups.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack(config, { isServer }) {
    if (isServer) {
      // Prevent webpack from trying to bundle Node.js built-ins used in instrumentation.ts
      const builtins = ["child_process", "net", "fs", "path", "os", "crypto", "stream"];
      const existing = config.externals ?? [];
      config.externals = [
        ...(Array.isArray(existing) ? existing : [existing]),
        ...builtins.map((mod) => ({ [mod]: `commonjs ${mod}` }))
      ];
    }
    return config;
  }
};

export default nextConfig;
