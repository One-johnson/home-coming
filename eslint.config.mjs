import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone maintenance scripts (CommonJS by design).
    "scripts/**",
  ]),
  {
    rules: {
      // react-hooks v6 (Next 16) rules that flag the established
      // localStorage/session-bootstrap effect pattern across the app.
      // Downgraded to warnings until those bootstraps are refactored
      // (e.g. with useSyncExternalStore); they stay visible in lint output.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
