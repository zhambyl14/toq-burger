import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // cacheComponents is intentionally OFF: it hangs on the Cloudflare Workers runtime (OpenNext).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Cloudflare Workers: no IMAGES binding configured, serve images as-is.
  images: { unoptimized: true },
};

export default nextConfig;

// Lets `next dev` access Cloudflare bindings (getCloudflareContext) locally.
initOpenNextCloudflareForDev();
