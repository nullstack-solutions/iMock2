// ESLint flat config for iMock2
// Uses permissive rules to keep linting focused on syntax correctness.

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**', 'editor/**', '**/*.min.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script'
    },
    rules: {}
  }
];
