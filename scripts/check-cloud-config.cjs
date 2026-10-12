// Build tooling only. Never import this Node module into the application bundle.
const URL_NAME = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_NAME = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';

function inspectCloudEnvironment(env) {
  const url = env[URL_NAME]?.trim();
  const key = env[KEY_NAME]?.trim();
  const issues = [];
  if (!url) issues.push(`${URL_NAME}: missing`);
  else {
    try {
      const parsed = new URL(url);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
    } catch { issues.push(`${URL_NAME}: invalid HTTP(S) URL`); }
  }
  let keyType = 'missing';
  if (!key) issues.push(`${KEY_NAME}: missing`);
  else if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) keyType = 'publishable';
  else {
    keyType = 'invalid';
    try {
      const parts = key.split('.');
      if (parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)) &&
          JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'anon') keyType = 'anon';
    } catch { /* Only fixed diagnostics below; never log key contents or parser errors. */ }
    if (keyType === 'invalid') issues.push(`${KEY_NAME}: use a publishable key or legacy anon JWT; secret/service-role keys are forbidden`);
  }
  if (env.EXPO_NO_CLIENT_ENV_VARS === '1') issues.push('EXPO_NO_CLIENT_ENV_VARS disables client configuration inlining');
  return { configured: issues.length === 0, keyType, issues, empty: !url && !key };
}

function assertCloudEnvironment(env, required = false) {
  const result = inspectCloudEnvironment(env);
  if (!result.configured && (required || !result.empty)) {
    throw Error(`Cloud Sync configuration check failed: ${result.issues.join('; ')}. See docs/cloud/ANDROID_CLOUD_SYNC.md. Values withheld.`);
  }
  return result;
}

module.exports = { inspectCloudEnvironment, assertCloudEnvironment };

if (require.main === module) {
  // --environment-only deliberately excludes .env.local for EAS verification/build hooks.
  if (!process.argv.includes('--environment-only')) {
    require('@expo/env').loadProjectEnv(process.cwd(), { mode: 'production', silent: true });
  }
  try {
    const result = assertCloudEnvironment(process.env, true);
    console.log(`Cloud Sync configuration: ready (URL present; public ${result.keyType} key present). Values withheld. Connectivity not tested.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
