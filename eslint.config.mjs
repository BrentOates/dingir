import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'package.json', '.github/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
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
    },
  },
]);
