// ESLint flat config (D-048): the rules `next lint` would set up, for the whole repo.
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: [".next/", "node_modules/", "design/", "data/", "public/", "docs/", "test-results/", "playwright-report/", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Destructuring a field out to drop it is how this code omits one (lib/client/metrics.ts).
  { rules: { "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }] } },
];

export default config;
