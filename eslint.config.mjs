import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

const eslintConfig = defineConfig([
  /* --- Global Ignores -------------------------------------------------- */
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'node_modules/**',
    'next-env.d.ts',
    'postcss.config.mjs',
    'public/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
  ]),

  /* --- Next.js Baseline ------------------------------------------------- */
  ...nextVitals,
  ...nextTs,

  /* --- TypeScript + Custom Rules (syntax-only, fast) ------------------- */
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // NOTE: Intentionally NOT using `project: './tsconfig.json'` here.
        // Type-aware lint rules (`no-unsafe-*`, `no-floating-promises`, etc.)
        // invoke the full TypeScript Language Service and dramatically slow
        // down linting. Instead, type-safety is enforced by `tsc --noEmit`
        // which is run as part of `npm run validate` and in CI.
        // If you want type-aware linting in your editor only, see the
        // `.vscode/settings.json` for editor-time TypeScript integration.
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
      'unused-imports': unusedImports,
      prettier: prettierPlugin,
    },
    settings: {
      'import/resolver': {
        node: { extensions: ['.ts', '.tsx'] },
      },
    },
    rules: {
      /* -- Prettier Integration --------------------------------------- */
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto',
        },
      ],

      /* -- TypeScript Rules (syntax-level, no type info needed) ------ */
      // Rules that require parserOptions.project are intentionally excluded.
      // Type-safety is enforced by `tsc --noEmit` (npm run validate / CI).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/no-unused-vars': 'off', // handled by unused-imports
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',

      /* -- Memory-Leak Prevention (React Hooks) ---------------------- */
      // NOTE: These are the single most important rules for preventing
      // memory leaks in React. react-hooks/exhaustive-deps catches stale
      // closures and missing cleanup in useEffect.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/set-state-in-effect': 'warn',

      /* -- Unused Imports / Variables -------------------------------- */
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      /* -- Import Order Enforcement ---------------------------------- */
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'type',
          ],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: '@/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react', 'next'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-self-import': 'error',

      /* -- General Best Practices ------------------------------------ */
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-alert': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',

      /* -- React Rules ----------------------------------------------- */
      'react/jsx-no-target-blank': ['error', { enforceDynamicLinks: 'always' }],
      'react/no-danger': 'error',
      'react/no-array-index-key': 'warn',
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/self-closing-comp': 'error',
      'react/display-name': 'off',
    },
  },

  /* --- Test Files Override ---------------------------------------------- */
  {
    files: [
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-console': 'off',
    },
  },

  /* --- Prettier config override (disables conflicting rules) ----------- */
  prettierConfig,
]);

export default eslintConfig;
