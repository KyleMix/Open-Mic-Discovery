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
      // qrcode-generator@2 is installed and typechecks, but it resolves only
      // through its package "exports" map, which eslint-plugin-import's node
      // resolver cannot read. Scoped ignore, not a missing dependency.
      'import/no-unresolved': ['error', { ignore: ['^qrcode-generator$'] }],
    },
  },
]);
