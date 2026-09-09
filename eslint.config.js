import eslint from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      '**/dist/**',
      'coverage',
      'legacy',
      'docs/habitat-audit-reproduction',
      'test-results',
      'playwright-report',
      'node_modules',
      '.local',
      '**/worker-configuration.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Advisory React Compiler optimisation hint; the imperative board keeps
      // hand-written memoisation on purpose. Correctness rules stay on.
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tools/**/*.mjs', 'vite.config.ts', 'playwright.config.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['workers/**/*.ts'],
    languageOptions: {
      globals: globals.worker,
    },
  },
);
