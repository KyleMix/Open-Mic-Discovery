// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'supabase/functions/**'],
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // react-native-purchases resolves fine in Metro and TypeScript; the
      // import plugin's resolver cannot read its export map.
      'import/no-unresolved': ['error', { ignore: ['^react-native-purchases$'] }],
    },
  },
]);
