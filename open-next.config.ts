// OpenNext config for Cloudflare Workers.
// No incremental cache binding is configured yet (no R2 bucket needed to deploy).
// To enable persistent ISR caching later: create an R2 bucket, add it to wrangler.jsonc and use
//   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
//   export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({});
