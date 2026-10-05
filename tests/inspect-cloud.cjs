// Uses the exported app and the real Supabase JS client. Only HTTP is mocked.
// node tests/inspect-cloud.cjs [--configured]
const { createServer } = require('node:http');
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const configured = process.argv.includes('--configured');
const root = resolve(process.env.POLISH_DIST || (configured ? '.test-build/cloud-dist' : 'dist'));
if (configured) assert.ok(readdirSync(resolve(root,'_expo/static/js/web')).filter(f=>f.endsWith('.js')).some(f=>readFileSync(resolve(root,'_expo/static/js/web',f),'utf8').includes('https://cloud-test.supabase.co')), 'Refusing cloud harness: export must contain the mock endpoint');
const pause = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  let file = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + sep)) file = resolve(root, 'index.html');
  if (!extname(file)) file += '.html';
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
let chrome, ws;
async function main() {
  await new Promise(r => server.listen(4183, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9233', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--user-data-dir=' + resolve('.test-build/cloud-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9233/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const pending = new Map(), errors = [];
  let id = 0;
  ws.addEventListener('message', ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const ready = async text => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } throw Error('Missing ' + text + ': ' + await evaluate('document.body.innerText')); };
  const click = async text => { assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,a')].find(el => el.innerText === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), 'Button: ' + text); await pause(150); };
  const fill = async (label, value) => { await evaluate(`(() => { const el = document.querySelector('input[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`); await pause(50); };
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4183' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  if (configured) {
    const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
    const { createExport } = require('../.test-build/src/domain/transfer.js');
    const cloudData = createDefaultAppData(); cloudData.settings.autoRollover = false; cloudData.settings.appearance = 'dark';
    const mock = function (payload) {
      const nativeFetch = window.fetch.bind(window);
      const user = { id: '11111111-1111-4111-8111-111111111111', email: 'max@example.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };
      window.__cloud = { user_id: user.id, payload, schema_version: payload.schemaVersion, revision: 2, updated_at: '2026-09-29T12:00:00Z' };
      window.__writes = 0;
      window.fetch = async (input, options = {}) => {
        const url = String(input);
        if (!url.startsWith('https://cloud-test.supabase.co')) { if (url.includes('/auth/v1/') || url.includes('/rest/v1/')) throw Error('Non-mock provider request blocked'); return nativeFetch(input, options); }
        const respond = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
        if (url.includes('/signup')) return respond({ user, session: null });
        if (url.includes('/token')) {
          if (JSON.parse(options.body).password === 'wrong') return respond({ msg: 'Invalid login credentials' }, 400);
          const token = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000) + 3600 })) + '.signature';
          return respond({ access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user });
        }
        if (url.includes('/logout')) return respond({});
        if (url.includes('/user')) return respond(user);
        if (url.includes('/rpc/write_cloud_snapshot')) {
          const args = JSON.parse(options.body);
          if (args.p_expected_revision !== window.__cloud.revision) return respond({ code: '40001', message: 'Cloud changed' }, 409);
          window.__writes++;
          window.__cloud = { ...window.__cloud, payload: args.p_payload, revision: window.__cloud.revision + 1, updated_at: new Date().toISOString() };
          return respond(window.__cloud);
        }
        if (url.includes('/cloud_snapshots')) { window.__cloudReads = (window.__cloudReads || 0) + 1; return respond([window.__cloud]); }
        throw Error('Unexpected cloud request: ' + url);
      };
    };
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mock.toString()})(${JSON.stringify(createExport(cloudData))});` });
  }
  await go('/settings', 'Cloud Sync');
  await evaluate(`Object.keys(localStorage).filter(k => k.startsWith('lifecommand:') || k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))`);
  await go('/settings', 'Cloud Sync');
  await evaluate(`const d=JSON.parse(localStorage.getItem('lifecommand:data:v1'));d.onboardingComplete=true;localStorage.setItem('lifecommand:data:v1',JSON.stringify(d));`);
  await go('/settings','Cloud Sync');
  const guestOriginal = await evaluate(`localStorage.getItem('lifecommand:data:v1')`);
  const accountPrefix = 'lifecommand:account:' + encodeURIComponent('https://cloud-test.supabase.co:11111111-1111-4111-8111-111111111111') + ':';
  const accountKey = accountPrefix + 'lifecommand:data:v1';
  let original = guestOriginal;
  if (!configured) {
    await ready('Not configured · Local-only mode');
    assert.equal(await evaluate(`!!document.querySelector('input[aria-label="Cloud email"]')`), false);
    console.log('PASS Settings Cloud Sync card and missing-config local-only state');
  } else {
    await ready('Signed out');
    await fill('Cloud email', 'max@example.test'); await fill('Cloud password', 'password123');
    await click('Create account'); await ready('Check your email to confirm your account');
    await fill('Cloud password', 'wrong'); await click('Sign in'); await ready('Invalid login credentials');
    await fill('Cloud password', 'password123'); await click('Sign in'); await ready('Signed in as max@example.test');
    await ready('Last cloud update:');
    if(await evaluate(`document.body.innerText.includes('Skip setup')`)) await click('Skip setup');
    assert.equal(await evaluate(`localStorage.getItem('lifecommand:data:v1')`), guestOriginal);
    original = await evaluate(`localStorage.getItem(${JSON.stringify(accountKey)})`);
    await go('/settings', 'Signed in as max@example.test');
    await ready('Last cloud update:');
    console.log('PASS signed-out UI, signup confirmation, sign-in error/retry, signed-in state; auth does not replace data');
    await click('Upload this device’s local data to cloud'); await ready('Newer cloud revision:');
    await click('Cancel'); assert.equal(await evaluate('window.__writes'), 0);
    await click('Upload this device’s local data to cloud'); await ready('Newer cloud revision:');
    await evaluate('window.__cloud.revision++');
    await click('Overwrite newer cloud snapshot'); await ready('Cloud data changed after this preview');
    assert.equal(await evaluate('window.__writes'), 0);
    await click('Cancel');
    console.log('PASS stale revision warning, cancel, and concurrent upload rejection');
    await evaluate(`window.__validPayload = window.__cloud.payload; window.__cloud.payload = { invalid: true }`);
    await click('Download cloud data to this device'); await ready('Choose a LifeCommand export');
    assert.equal(await evaluate(`document.body.innerText.includes('Confirm cloud restore and replace data')`), false);
    await evaluate('window.__cloud.payload = window.__validPayload');
    await click('Download cloud data to this device'); await ready('Cloud download preview');
    for (const [width, height] of [[320,568],[390,844],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[role=dialog] [role=button]')).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || r.height < 44); }).map(el => el.innerText)`), []);
    }
    await click('Cancel');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(accountKey)})`), original);
    await fill('Rollover time, 24-hour HH:MM', '09:45');
    await click('Download cloud data to this device'); await ready('Cloud download preview');
    await evaluate(`window.__setItem = Storage.prototype.setItem; window.__failBackup = true; window.__localWrites = []; Storage.prototype.setItem = function(k,v) { if (window.__failBackup && k.startsWith(${JSON.stringify(accountKey + ':recovery:')})) throw Error('quota'); window.__localWrites.push(k); return window.__setItem.call(this,k,v); }`);
    await click('Confirm cloud restore and replace data'); await ready('Could not create a recovery backup');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(accountKey)})`), original);
    await evaluate('window.__failBackup = false');
    await click('Confirm cloud restore and replace data'); await ready('Cloud restore complete');
    const writes = await evaluate('window.__localWrites');
    assert.ok(writes[0].startsWith(accountKey + ':recovery:')); assert.equal(writes[1], accountKey);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(writes[0])})).raw`), original);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(accountKey)})).settings.appearance`), 'dark');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Rollover time, 24-hour HH:MM"]').value`), '00:00');
    await ready('View recovery backups (1)');
    console.log('PASS invalid cloud data rejected, responsive preview/cancel, backup failure/retry, backup-before-replacement, live refresh and stale Settings draft cleared');
    await click('Upload this device’s local data to cloud'); await ready('Cloud upload preview');
    assert.equal(await evaluate(`document.body.innerText.includes('Newer cloud revision:')`), false);
    await click('Confirm upload'); await ready('Upload complete');
    assert.equal(await evaluate('window.__writes'), 1);
    await click('Enable automatic sync');await ready('Synchronized.');
    await fill('Rollover time, 24-hour HH:MM','05:00');await click('Save time');
    for(let i=0;i<100 && await evaluate('window.__writes')<2;i++) await pause(100);
    assert.equal(await evaluate('window.__writes'),2);
    assert.equal(await evaluate('window.__cloud.payload.data.settings.rolloverTime'),'05:00');
    await evaluate(`window.__cloud.payload.data.settings.rolloverTime='07:00';window.__cloud.revision++`);
    await fill('Rollover time, 24-hour HH:MM','06:00');await click('Save time');await ready('Both copies need review.');
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(accountKey)})).settings.rolloverTime`),'06:00');
    assert.equal(await evaluate('window.__cloud.payload.data.settings.rolloverTime'),'07:00');
    await click('Disable automatic sync');
    console.log('PASS automatic sync durable local writes, remote update and explicit competing-change conflict');
    await click('Sign out'); await ready('Signed out');
    assert.equal(await evaluate(`localStorage.getItem('lifecommand:data:v1')`), guestOriginal);
    assert.equal(await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(accountKey)})).settings.appearance`),'dark');
    console.log('PASS confirmed upload acknowledges revision and sign-out returns to guest and retains isolated account data');
    // Hold repository hydration while interval and foreground signals fire.
    await fill('Cloud email', 'max@example.test'); await fill('Cloud password', 'password123');
    await click('Sign in'); await ready('Signed in as max@example.test');
    await evaluate(`localStorage.setItem(${JSON.stringify(accountPrefix + 'automatic-sync-enabled')},'true')`);
    const heldOriginal = await evaluate(`localStorage.getItem(${JSON.stringify(accountKey)})`);
    const hold = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      const request = navigator.locks.request.bind(navigator.locks);
      window.__heldLocks = []; window.__holdHydration = true;
      navigator.locks.request = (...args) => window.__holdHydration && args[0]==='lifecommand:data:v1:write' ? new Promise((resolve,reject)=>window.__heldLocks.push(()=>request(...args).then(resolve,reject))) : request(...args);
      const interval=window.setInterval.bind(window); window.setInterval=(fn,ms,...args)=>interval(fn,ms===30000?50:ms,...args);
    ` });
    await send('Page.navigate', { url: 'http://127.0.0.1:4183/settings' }); await ready('Loading settings');
    await evaluate(`window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));`);
    await pause(400);
    assert.equal(await evaluate('window.__cloudReads || 0'), 0, 'no timer/resume cloud reads before hydration');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(accountKey)})`), heldOriginal, 'no startup mutation before hydration');
    // Supabase uses this channel for cross-tab sign-out. It reaches the real auth subscriber.
    await evaluate(`localStorage.removeItem('sb-cloud-test-auth-token');window.__signoutChannel=new BroadcastChannel('sb-cloud-test-auth-token');window.__signoutChannel.postMessage({event:'SIGNED_OUT',session:null});`);
    await pause(200);
    await evaluate('window.__holdHydration=false;window.__heldLocks.splice(0).forEach(run=>run());');
    await ready('Signed out');
    assert.equal(await evaluate(`localStorage.getItem('lifecommand:data:v1')`), guestOriginal);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(accountKey)})`), heldOriginal);
    assert.equal(await evaluate('window.__writes'),0);
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:hold.identifier});
    console.log('PASS timer/foreground hydration barrier and account switch during pending hydration; old results cannot replace guest data');
  }
  await go('/', 'Today');
  await go('/projects', 'Projects');
  assert.deepEqual(errors, []);
  console.log('PASS Today/Projects navigation and no runtime exceptions');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (ws) ws.close(); if (chrome) chrome.kill(); await new Promise(r => server.close(r));
});
