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
  poweredByHeader: false,
  // Baseline hardening. (A strict CSP is not set: Leaflet/OSM tiles, Supabase realtime and inline styles would need a tuned policy.)
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), geolocation=(self)' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;

// Lets `next dev` access Cloudflare bindings (getCloudflareContext) locally.
initOpenNextCloudflareForDev();
