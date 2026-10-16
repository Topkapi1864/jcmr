import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic rendering model: the crew board is dynamic, the public pages are
  // cheap server renders. Cache Components are not needed for a site this size.
  cacheComponents: false,
  // The GPX files and seed CSV are read from disk at request time.
  outputFileTracingIncludes: {
    "/**": ["./content/**/*"],
  },
  serverExternalPackages: ["@libsql/client"],
  // Vehicle photos are resized in the browser (≈200 KB) but travel in a form post.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
