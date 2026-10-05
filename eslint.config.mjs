import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', '.claude/**', 'package.json', '.github/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-tabs': ['error', { allowIndentationTabs: true }],
      'quotes': [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: false },
      ],
      'semi': ['error', 'always'],
      'brace-style': 'error',
      'curly': ['error', 'all'],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // node:test's top-level test()/describe() calls return promises that the runner tracks
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
]);
