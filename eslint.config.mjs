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
    // Lesson data is machine-generated from content/src by scripts/convert-content.mjs.
    // Linting ~500KB of object literals is noise; scripts/validate-content.mjs checks it.
    "src/data/generated/**",
  ]),
]);

export default eslintConfig;
