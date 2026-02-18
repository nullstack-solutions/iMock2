import js from '@eslint/js';
import globals from 'globals';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const eslintPluginImock2 = require('./eslint-plugin-imock2.js');

export default [
  {
    ignores: [
      'node_modules/**',
      'vendor/**',
      'tests/**',
      'wiremock-v4/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'editor/json-worker.js',
      'eslint-report.json',
      'js/vendor-*.js',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        NotificationManager: 'readonly',
        SELECTORS: 'readonly',
        ENDPOINTS: 'readonly',
        FilterManager: 'readonly',
        Logger: 'readonly',
        Utils: 'readonly',
        MappingsStore: 'readonly',
        MappingsOperations: 'readonly',
        Icons: 'readonly',
        LifecycleManager: 'readonly',
        TemplateManager: 'readonly',
        MonacoLoader: 'readonly',
      },
    },
    plugins: {
      imock2: eslintPluginImock2,
    },
    rules: {
      ...js.configs.recommended.rules,
      'imock2/no-legacy-mappings': 'error',
      'no-undef': 'off',
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-constant-condition': 'warn',
    },
  },
];
