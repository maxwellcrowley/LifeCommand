import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { cloudConfig } from '../src/cloud/config';

const { assertCloudEnvironment, inspectCloudEnvironment } = require(resolve('scripts/check-cloud-config.cjs'));
const url = 'https://configuration-test.supabase.co';
const publicKey = 'sb_publishable_synthetic_test_only';
const environment = (key = publicKey) => ({ EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key });
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.synthetic_signature`;

test('public publishable and legacy anon keys pass preflight and runtime config detection', () => {
  for (const key of [publicKey, jwt('anon')]) {
    assert.equal(assertCloudEnvironment(environment(key), true).configured, true);
    assert.ok(cloudConfig(url, key));
  }
});

test('local-only configuration stays optional locally but EAS cannot silently ship it', () => {
  assert.equal(assertCloudEnvironment({}).configured, false);
  assert.equal(cloudConfig(), null);
  assert.throws(() => assertCloudEnvironment({}, true), /EXPO_PUBLIC_SUPABASE_URL: missing/);
  for (const partial of [{ EXPO_PUBLIC_SUPABASE_URL: url }, { EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey }]) {
    assert.throws(() => assertCloudEnvironment(partial), /missing/);
  }
});

test('unsafe, malformed and non-anon keys abort before bundling without revealing values', () => {
  for (const key of ['sb_secret_do_not_print_this', jwt('service_role'), jwt('authenticated'), 'not-a-public-key', 'e30.broken.signature']) {
    assert.throws(() => assertCloudEnvironment(environment(key), true), (error: Error) => {
      assert.match(error.message, /secret\/service-role keys are forbidden/);
      assert.equal(error.message.includes(key), false);
      assert.equal(error.message.includes(url), false);
      return true;
    });
  }
});

test('malformed URLs, embedded credentials and disabled Expo inlining fail preflight', () => {
  for (const invalidUrl of ['not-a-url', 'file:///data', 'https://user:password@example.com']) {
    const result = inspectCloudEnvironment({ ...environment(), EXPO_PUBLIC_SUPABASE_URL: invalidUrl });
    assert.equal(result.configured, false);
    assert.equal(JSON.stringify(result).includes(invalidUrl), false);
    assert.equal(cloudConfig(invalidUrl, publicKey), null);
  }
  assert.throws(() => assertCloudEnvironment({ ...environment(), EXPO_NO_CLIENT_ENV_VARS: '1' }, true), /inlining/);
});

test('EAS profiles select matching environments and require the remote configuration check', () => {
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  for (const name of ['development', 'preview', 'production']) assert.equal(eas.build[name].environment, name);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['eas-build-post-install'], 'node scripts/check-cloud-config.cjs --environment-only');
  const appConfig = readFileSync('app.config.ts', 'utf8');
  assert.match(appConfig, /assertCloudEnvironment\(process\.env, process\.env\.EAS_BUILD === 'true'\)/);
});

test('remote preflight never uses local dotenv to conceal a missing EAS value', () => {
  const env = { ...process.env };
  delete env.EXPO_PUBLIC_SUPABASE_URL;
  delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const result = spawnSync(process.execPath, ['scripts/check-cloud-config.cjs', '--environment-only'], { env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EXPO_PUBLIC_SUPABASE_URL: missing/);
  assert.match(result.stderr, /EXPO_PUBLIC_SUPABASE_ANON_KEY: missing/);
  assert.doesNotMatch(result.stdout, /ready/);
});

test('app config loads as native ESM while preserving static config, OAuth and the EAS guard', () => {
  const env: NodeJS.ProcessEnv = { ...process.env, EXPO_NO_DOTENV: '1' };
  delete env.EXPO_PUBLIC_SUPABASE_URL;
  delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  delete env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete env.EAS_BUILD;
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    env,
    encoding: 'utf8',
    input: `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import configure from './app.config.ts';
      const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
      const original = structuredClone(config);
      assert.deepEqual(configure({ config }), config);
      process.env.EAS_BUILD = 'true';
      assert.throws(() => configure({ config }), /EXPO_PUBLIC_SUPABASE_URL: missing/);
      process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://configuration-test.supabase.co';
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_synthetic_test_only';
      assert.deepEqual(configure({ config }), config);
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'synthetic-test.apps.googleusercontent.com';
      assert.deepEqual(configure({ config }), {
        ...config,
        plugins: [...(config.plugins ?? []), ['@react-native-google-signin/google-signin', {
          iosUrlScheme: 'com.googleusercontent.apps.synthetic-test',
        }]],
      });
      assert.deepEqual(config, original);
    `,
  });
  // Do not expose child output: an assertion could otherwise print resolved config.
  assert.equal(result.status, 0, 'Native ESM config regression failed (output withheld)');
});

test('EAS full public config command loads the helper and cannot fall back to local dotenv', () => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EXPO_NO_DOTENV: '1',
    EAS_BUILD: 'true',
    ...environment(),
  };
  delete env.EXPO_NO_CLIENT_ENV_VARS;
  delete env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const args = [require.resolve('expo/bin/cli'), 'config', '--json', '--full', '--type', 'public'];
  const configured = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
  // Never include child output in assertions: stdout contains resolved app config.
  assert.equal(configured.status, 0, 'EAS config command failed with valid synthetic values (output withheld)');
  let validJson = false;
  try { validJson = typeof JSON.parse(configured.stdout).exp?.name === 'string'; } catch { /* Withhold output. */ }
  assert.ok(validJson, 'EAS config command must produce a JSON config (output withheld)');

  delete env.EXPO_PUBLIC_SUPABASE_URL;
  delete env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const missing = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
  const diagnostics = missing.stdout + missing.stderr;
  assert.notEqual(missing.status, 0, 'EAS config must reject missing variables despite local dotenv');
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
    assert.ok(diagnostics.includes(`${name}: missing`), `${name} must be reported missing (output withheld)`);
  }
  assert.equal(diagnostics.includes('require is not defined'), false, 'The helper must load before environment validation');
});

test('Supabase uses Expo static references and installed users get no developer setup instructions', () => {
  const client = readFileSync('src/cloud/client.ts', 'utf8');
  assert.match(client, /cloudConfig\(process\.env\.EXPO_PUBLIC_SUPABASE_URL, process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY\)/);
  const card = readFileSync('src/components/CloudSyncCard.tsx', 'utf8');
  assert.doesNotMatch(card, /\.env\.local|restart Expo|EXPO_PUBLIC_SUPABASE/);
  assert.match(card, /Your local data is still available/);
});
