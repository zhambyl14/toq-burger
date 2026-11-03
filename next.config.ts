import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
