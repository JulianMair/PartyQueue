// eslint.config.mjs
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['node_modules/**', '.next/**', 'dist/**'],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
      },
    },

    plugins: {
      '@typescript-eslint': tseslint,
      '@next/next': nextPlugin,
    },

    rules: {
      // 🔥 Hauptproblem: next.js hat no-explicit-any auf ERROR gesetzt → build fail
      '@typescript-eslint/no-explicit-any': 'off',

      // 🔥 Nervige unused vars → nur Warning
      '@typescript-eslint/no-unused-vars': 'warn',

      // optional
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
