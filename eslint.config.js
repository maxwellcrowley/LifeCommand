const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  { ignores: ['dist/**', '.test-build/**', 'android/**', 'ios/**', 'backend/live-ics/.build/**'] },
  expoConfig,
]);
