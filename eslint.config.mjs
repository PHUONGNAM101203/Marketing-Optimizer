import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `mock/*.ts` functions intentionally keep the same signature as the
      // real `data/` layer function they stand in for (e.g. `(siteId:
      // string) => ...`), even though the mock body ignores the argument —
      // swapping mock for real later is then a one-line import change, not
      // a signature change at every call site. `_`-prefixed params mark
      // that on purpose; only args, not vars, so a genuinely unused
      // top-level const still warns.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // `.next/**` above only matches the root build output. Every isolated
    // git worktree under `.claude/worktrees/<name>/` has its own `.next/`
    // from its own `npm run build`, several levels deep — unmatched by that
    // pattern, so a running worktree's compiled Turbopack chunks (raw
    // require() calls, legacy ts-ignore-style suppressions, none of which
    // follow this repo's lint rules) get linted as if they were our source,
    // drowning real findings in noise.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
