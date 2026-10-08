/**
 * Build-time guard: fails the build/deploy when a non-production environment
 * is pointed at the production Convex deployment.
 *
 * Runs before `next build` (see the `build` script in package.json), so a
 * misconfigured preview/dev deploy blows up at build time instead of quietly
 * showing (and writing!) production data.
 *
 * The pure decision lives in `evaluateDeploymentSafety` so it is unit-tested
 * in tests/deploymentSafety.test.ts.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/** The production Convex deployment URLs. Non-prod builds must never use these. */
export const PROD_CONVEX_URLS = [
  "https://helpful-anteater-315.convex.cloud",
  "https://helpful-anteater-315.convex.site",
];

export function evaluateDeploymentSafety({ convexUrl = "", vercelEnv = "" } = {}) {
  const url = (convexUrl ?? "").trim().replace(/\/+$/, "");
  if (!url) {
    // Unconfigured builds are safe: the app renders its setup banner and
    // never touches Convex data.
    return { ok: true };
  }
  const isProdUrl = PROD_CONVEX_URLS.includes(url);
  if (!isProdUrl) return { ok: true };
  if ((vercelEnv ?? "").trim().toLowerCase() === "production") {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `This non-production build (VERCEL_ENV=${vercelEnv || "local"}) is pointed at the PRODUCTION Convex deployment (${url}). ` +
      "It would read and write live data. Point NEXT_PUBLIC_CONVEX_URL at the dev deployment instead.",
  };
}

/** Minimal .env file parser for KEY=VALUE lines (quotes tolerated). */
function readEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const out = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function main() {
  const fileEnv = {
    ...readEnvFile(".env.local"),
    ...readEnvFile(".env.production"),
  };
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL || fileEnv.NEXT_PUBLIC_CONVEX_URL;
  const result = evaluateDeploymentSafety({
    convexUrl,
    vercelEnv: process.env.VERCEL_ENV,
  });
  if (!result.ok) {
    console.error("\n✗ Convex deployment-safety check failed:\n");
    console.error(`  ${result.reason}\n`);
    process.exit(1);
  }
  console.log("✓ Convex deployment-safety check passed");
}

// Only run the CLI path when executed directly (tests import the pure logic).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
