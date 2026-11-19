// scripts/check-deploy-env.mjs
//
// Hosting predeploy guard (firebase.json): refuses to build/deploy when a
// required environment variable is missing. `.env*` files are gitignored, so a
// fresh checkout or worktree has none — and Next.js inlines NEXT_PUBLIC_* at
// build time, so a build without them silently ships a broken app (2026-11-19:
// every Google Sheets export said "not configured" after a deploy from a
// worktree with no .env.local).
//
// Loads the env exactly like `next build` does (@next/env), then checks.

import nextEnv from "@next/env";

const REQUIRED = [
  // Google Sheets export/import (Bulk Edit, Clients, every Export button).
  "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
  // /api/mediabox-refresh (server side).
  "MEDIABOX_REFRESH_URL",
  "MEDIABOX_REFRESH_SECRET",
];

nextEnv.loadEnvConfig(process.cwd(), false);

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(
    `\nDeploy stopped: missing environment variable(s): ${missing.join(", ")}.\n` +
      `Copy .env and .env.local from the main checkout into ${process.cwd()} and deploy again.\n`
  );
  process.exit(1);
}
console.log(`Deploy env OK (${REQUIRED.length} required variables set).`);
