// Operator-assisted native probe. Never use on the everyday installation.
// The independent host watchdog stops ONLY this app on the explicitly selected
// disposable device after 15 seconds, even if its JavaScript thread is blocked.
const { spawn, spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const probes = {
  normal: 'lifecommand:///projects',
  missing: 'lifecommand:///task/acceptance-missing-record',
  unknown: 'lifecommand:///acceptance-unknown-route',
  percent: 'lifecommand:///projects?probe=%',
  truncated: 'lifecommand:///projects?probe=%E0%A4%A',
  invalid: 'lifecommand:///projects?probe=%C0%AF',
  repeated: 'lifecommand:///projects?probe=one&probe=two',
  nearby: 'lifecommand:///projects?probe=hello%20world%2B%26%F0%9F%8C%B1',
  small: 'lifecommand:///projects?probe=' + '%FF'.repeat(100),
  bounded: 'lifecommand:///projects?probe=' + '%FF'.repeat(1000),
};
if (!args.includes('--disposable')) {
  console.log('NOT RUN. Requires --disposable --serial <id> --case <name> --state cold|warm|foreground --build <id> --commit <hash>.');
  console.log('Cases: ' + Object.keys(probes).join(', '));
  process.exit(0);
}
const serial = option('--serial'), name = option('--case'), state = option('--state');
const build = option('--build'), commit = option('--commit');
if (!['--serial', '--case', '--state', '--build', '--commit'].every(name => args.includes(name)) || ![serial, build, commit].every(s => typeof s === 'string' && /^[\w.-]+$/.test(s)) || !probes[name] || !['cold', 'warm', 'foreground'].includes(state)) throw Error('Supply explicit disposable device, case, lifecycle, build and commit identities.');
const adb = args.includes('--adb') ? option('--adb') : 'adb';
const pkg = 'com.crowleymh.LifeCommand';
const run = command => spawnSync(adb, ['-s', serial, ...command], { encoding: 'utf8', timeout: 8000, windowsHide: true });
const read = property => { const r = run(['shell', 'getprop', property]); if (r.status !== 0) throw Error('Cannot read device identity'); return r.stdout.trim(); };
const model = read('ro.product.model'), android = read('ro.build.version.release');
const record = { case: `LINK-${name}`, state, model, android, build, commit, startedAt: new Date().toISOString(), status: 'NOT RUN', observed: '', operator: 'Record delivery, UI response and Back behavior separately; no automatic acceptance inference.' };
const output = resolve('.test-build/android-native-evidence'); mkdirSync(output, { recursive: true });
const file = resolve(output, `${Date.now()}-${name}-${state}.json`);
const stop = () => run(['shell', 'am', 'force-stop', pkg]);
if (state === 'cold' && stop().status !== 0) throw Error('Cannot stop disposable app for cold launch');
if (state === 'warm') { const r = run(['shell', 'input', 'keyevent', 'KEYCODE_HOME']); if (r.status !== 0) throw Error('Cannot background disposable app'); }
// No secret-bearing URLs are accepted as input; only fixed synthetic probes above.
const watchdog = spawn(process.execPath, ['-e', `const {spawnSync}=require('node:child_process');setTimeout(()=>{const r=spawnSync(process.argv[1],['-s',process.argv[2],'shell','am','force-stop',process.argv[3]],{timeout:5000,windowsHide:true,stdio:'ignore'});process.exitCode=r.status===0?0:1},15000)`, adb, serial, pkg], { windowsHide: true, stdio: 'ignore' });
watchdog.on('error', () => { stop(); console.error('Watchdog failed; app stop attempted.'); process.exitCode = 1; });
const result = run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${probes[name]}'`, pkg]);
record.status = 'BLOCKED';
record.observed = result.error ? 'ADB delivery timed out/failed; delivery unknown' : /unable to resolve|Error:/i.test(result.stdout + result.stderr) ? 'Android rejected intent; application parser not exercised' : `ADB exited ${result.status}; operator must establish app delivery and responsiveness`;
writeFileSync(file, JSON.stringify(record, null, 2));
console.log(`${record.case}: ${record.observed}. Host watchdog will stop disposable app at 15 seconds. Evidence: ${file}`);
watchdog.on('exit', code => { if (code !== 0) { console.error('Watchdog could not confirm app stop; use ADB force-stop on the disposable device.'); process.exitCode = 1; } });
