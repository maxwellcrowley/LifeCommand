// Bounded dependency diagnostics, not a native-device test. No live URLs or data.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const cases = [
  ['decoder library', "require('decode-uri-component')('%FF'.repeat(1000));", true],
  ['React Navigation fallback', "require('./node_modules/expo-router/build/react-navigation/core/getStateFromPath').getStateFromPath('/projects?probe='+'%FF'.repeat(1000), {screens:{projects:'projects'}});", true],
  ['Expo Router query helper', "const result=require('./node_modules/expo-router/build/fork/getStateFromPath-forks').parseQueryParams('/projects?probe='+'%FF'.repeat(1000),{name:'projects'}); require('node:assert/strict').equal(result.probe.length,1000);", false],
];
for (const [name, source, timeoutExpected] of cases) {
  const result = spawnSync(process.execPath, ['-e', source], { cwd: root, encoding: 'utf8', timeout: 3000, windowsHide: true });
  const timedOut = result.error?.code === 'ETIMEDOUT';
  console.log(`${name}: ${timedOut ? 'exceeded 3-second limit; child terminated' : `exit ${result.status}`}`);
  assert.equal(timedOut, timeoutExpected, `${name}: unexpected result; reassess advisory evidence`);
  if (!timedOut) assert.equal(result.status, 0, result.stderr);
}
console.log('Native URL delivery and Hermes execution remain unverified; this diagnostic executes installed parser code in Node only.');
