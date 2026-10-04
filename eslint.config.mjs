// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // src/generated is Prisma Client's generated output (see
    // prisma/schema.prisma's generator block) -- never hand-edited, and
    // regenerated wholesale by `prisma generate`, so linting it is both
    // pointless and liable to flag things no one can fix in place.
    ignores: ['eslint.config.mjs', 'dist/**', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Spec files hit several strict type-checked rules that are
    // well-documented false positives against ordinary Jest patterns,
    // not real type-safety concerns:
    //  - unbound-method fires on every `expect(obj.method).toHaveBeenCalled...`
    //    — nothing is ever actually calling the method unbound; Jest's
    //    matcher just reads the reference.
    //  - no-unsafe-assignment/-member-access fire on mock call args
    //    (`.mock.calls[0][0]`) and on loosely-typed third-party return
    //    shapes (Joi's `.validate()`, opossum's `.options`, Reflector.get()).
    //  - no-unnecessary-type-assertion fires on `{ ... } as never` casts
    //    used throughout to pass partial DTO shapes without satisfying
    //    every field — intentional here, not needed in app code.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    // main.ts's module-level `void bootstrap()` call needs to be
    // re-triggered fresh per spec file (different env vars each time) —
    // `require()` (not a static `import`) is the only way to run that
    // side effect on demand instead of once at module load.
    files: ['src/main*.spec.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
