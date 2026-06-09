// Flat config (ESLint 9). We lint TypeScript with full type information so the
// linter understands our types, and turn off any rules Prettier already owns.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // web/ is a separate Next.js app with its own ESLint/Prettier/tsconfig.
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'web/**'] },

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Use the nearest tsconfig automatically; no need to list files twice.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow intentionally-unused params/vars when prefixed with underscore
      // (e.g. `_config` on a not-yet-implemented adapter factory).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // This config file itself is plain JS; don't run type-aware rules on it.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Must come last: disables stylistic rules that would fight Prettier.
  prettier,
);
