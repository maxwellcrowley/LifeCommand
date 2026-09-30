// Test export (PowerShell), synthetic public configuration only:
// $env:EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID='123-test.apps.googleusercontent.com'
// $env:EXPO_PUBLIC_MICROSOFT_CLIENT_ID='11111111-1111-1111-1111-111111111111'
// $env:EXPO_PUBLIC_MICROSOFT_WEB_REDIRECT_URI='http://127.0.0.1:4188/oauth/microsoft'
// npx expo export --platform web --output-dir .test-build/google-dist --clear
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.GOOGLE_HARNESS_DIST || '.test-build/google-dist');
const pause = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  let file = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + sep)) file = resolve(root, 'index.html');
  if (!extname(file)) file += '.html';
  if (!existsSync(file) && /^\/(project|task|event)\//.test(req.url)) file = resolve(root, req.url.split('/')[1], '[id].html');
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});

let chrome;
const clients = [];
const errors = [];
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const ready = async text => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } throw Error('Missing ' + text + ': ' + await evaluate('document.body.innerText')); };
  const click = async text => { assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,a')].find(el => el.innerText === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), 'Button: ' + text); await pause(150); };
  const fill = async (label, value) => evaluate(`(() => { const el = [...document.querySelectorAll('input,textarea')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) throw Error('Missing input'); Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4188' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4188, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9238', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/google-calendar-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9238/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  // Inject at the real external SDK/fetch boundary; no production test switches.
  await a.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.googleTest = { sub: 'test-user', title: 'Live Google meeting', fail: 0, cancelled: false, deleted: false, partial: false, requests: [], authRequests: [], pending: false };
    window.google = { accounts: { oauth2: {
      initTokenClient(options) { return { requestAccessToken() {
        window.googleTest.authRequests.push({ scope: options.scope, include: options.include_granted_scopes });
        window.dispatchEvent(new Event('focus'));
        setTimeout(() => options.callback({ access_token: 'test-access-token-' + window.googleTest.sub, expires_in: 3600, state: options.state, scope: window.googleTest.partial ? 'openid email' : options.scope }), 30);
      } }; },
      hasGrantedAllScopes(response, ...scopes) { return scopes.every(scope => response.scope.split(' ').includes(scope)); }
    } } };
    const originalFetch = window.fetch.bind(window);
    window.outlookTest = { requests: [], authRequests: [], partial: false, wrongState: false, fail: 0 };
    const originalOpen = window.open.bind(window);
    window.open = (input, ...args) => {
      const url = new URL(String(input), location.origin);
      if (url.hostname !== 'login.microsoftonline.com') return originalOpen(input, ...args);
      window.outlookTest.authRequests.push(Object.fromEntries(url.searchParams));
      if (window.outlookTest.pending) return originalOpen('about:blank', ...args);
      return originalOpen(location.origin + '/oauth/microsoft?code=mock-code&state=' + (window.outlookTest.wrongState ? 'wrong-state' : url.searchParams.get('state')), ...args);
    };
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.origin);
      if (url.hostname === 'login.microsoftonline.com') {
        const form = new URLSearchParams(init.body);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier')));
        const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
        if (challenge !== window.outlookTest.authRequests.at(-1).code_challenge || form.get('grant_type') !== 'authorization_code' || form.has('client_secret')) throw Error('Invalid PKCE exchange');
        return new Response(JSON.stringify({ access_token: 'mock-outlook-token', token_type: 'Bearer', expires_in: 3600, scope: window.outlookTest.partial ? 'openid' : 'openid profile email Calendars.ReadBasic' }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url.hostname === 'graph.microsoft.com') {
        window.outlookTest.requests.push({ url: url.toString(), method: init.method, bearer: init.headers.Authorization === 'Bearer mock-outlook-token' });
        const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
        if (window.outlookTest.fail) return json({}, window.outlookTest.fail);
        if (url.pathname === '/oidc/userinfo') return json({ sub: 'outlook-user', email: 'outlook-user@example.com' });
        if (url.pathname === '/v1.0/me/calendars') return json({ value: [{ id: 'outlook-work', name: 'Outlook work calendar', hexColor: '#0078D4' }] });
        if (url.pathname.endsWith('/calendarView')) {
          const date = new Date(); const key = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
          return json({ value: [{ id: 'meeting', subject: 'Live Outlook meeting', isAllDay: true, originalStartTimeZone: 'UTC', start: { dateTime: key + 'T00:00:00', timeZone: 'UTC' }, end: { dateTime: new Date(new Date(key + 'T12:00:00').getTime()+86400000).toISOString().slice(0,10) + 'T00:00:00', timeZone: 'UTC' } }] });
        }
        throw Error('Unexpected Outlook endpoint');
      }
      if (!url.hostname.endsWith('googleapis.com')) return originalFetch(input, init);
      window.googleTest.requests.push({ url: url.toString(), method: init.method, bearer: init.headers.Authorization.startsWith('Bearer test-access-token-') });
      const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
      if (window.googleTest.fail) return json({}, window.googleTest.fail);
      if (url.pathname.endsWith('/userinfo')) { const sub = init.headers.Authorization.slice('Bearer test-access-token-'.length); return json({ sub, email: sub + '@example.com' }); }
      if (url.pathname.endsWith('/calendarList')) return json(url.searchParams.has('pageToken') ? { kind: 'calendar#calendarList', items: [{ id: 'second', summary: 'Second Google calendar' }] } : { kind: 'calendar#calendarList', items: [{ id: 'primary', summary: 'Primary Google calendar', backgroundColor: '#31A3A0' }], nextPageToken: 'second-page' });
      if (url.pathname.endsWith('/events')) {
        if (window.googleTest.pending) await new Promise(resolve => { window.googleTest.release = resolve; });
        const date = new Date(); const key = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
        const primary = url.pathname.includes('/primary/');
        return json({ kind: 'calendar#events', items: window.googleTest.deleted ? [] : window.googleTest.cancelled ? [{ id: 'same-id', status: 'cancelled' }] : [{ id: 'same-id', summary: primary ? window.googleTest.title : 'Second calendar meeting', start: { dateTime: new Date(key + 'T10:00:00').toISOString() }, end: { dateTime: new Date(key + 'T11:00:00').toISOString() } }] });
      }
      throw Error('Unexpected Google endpoint');
    };
  ` });
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { createEvent, insertEvent } = require('../.test-build/src/domain/events.js');
  const { localDateKey } = require('../.test-build/src/domain/dates.js');
  const today = localDateKey(new Date());
  let data = createDefaultAppData(); data.settings.autoRollover = false; data.settings.ambientDisplayEnabled = true;
  data = insertEvent(data, createEvent({ title: 'Preserved local event', date: today, source: 'personal' }));
  data = insertEvent(data, createEvent({ title: 'Preserved family event', date: today, source: 'family', category: 'School', addedBy: 'Kellyn' }));
  const readCache = () => a.evaluate(`JSON.parse(localStorage.getItem('lifecommand:external-calendars:v1'))`);
  const readLocal = () => a.evaluate(`localStorage.getItem('lifecommand:data:v1')`);
  const choose = async label => { assert.ok(await a.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) return false; el.click(); return true; })()`), label); await pause(180); };
  await a.go('/settings', 'Calendar Sync');
  await a.evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('lifecommand:')).forEach(k=>localStorage.removeItem(k)); localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))})`);
  await a.go('/settings', 'Signed out / not connected');
  await pause(200);
  await a.evaluate('window.googleTest.partial = true');
  await a.click('Connect Google Calendar'); await a.ready('Grant both read-only');
  assert.equal((await readCache())?.accounts?.length ?? 0, 0);
  await a.evaluate('window.googleTest.partial = false');
  await a.click('Connect Google Calendar'); await a.ready('Connected · Google Calendar');
  const localBefore = await readLocal();
  await a.click('Sync now'); await a.ready('Last synced:');
  assert.equal((await readCache()).events.length, 2);
  assert.equal(await readLocal(), localBefore);
  assert.ok(await a.evaluate(`window.googleTest.requests.every(request => request.method === 'GET' && request.bearer && !request.url.includes('test-access-token'))`));
  assert.equal(await a.evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)]))).includes('test-access-token')`), false);
  const beforeFailure = await readCache();
  await a.evaluate('window.googleTest.fail = 500'); await a.click('Sync now'); await a.ready('request failed (500)');
  assert.deepEqual(await readCache(), beforeFailure);
  await a.evaluate('window.googleTest.fail = 401'); await a.click('Sync now'); await a.ready('Reconnect required');
  assert.deepEqual(await readCache(), beforeFailure);
  await a.evaluate('window.googleTest.fail = 0'); await a.click('Reconnect Google Calendar');
  await a.ready('Connected · Google Calendar');
  await a.evaluate(`window.googleTest.title = 'Updated live meeting'`); await a.click('Sync now');
  assert.equal((await readCache()).events.length, 2); assert.equal((await readCache()).events[0].title, 'Updated live meeting');
  await choose('Import calendar: Second Google calendar');
  await a.evaluate('window.googleTest.requests = []'); await a.click('Sync now');
  assert.equal(await a.evaluate(`window.googleTest.requests.some(request => request.url.includes('/second/events'))`), false);
  console.log('PASS live UI authorization, partial consent, focus return, pagination, narrow GET requests, token isolation, failure preservation and disabled calendars');
  await a.go('/', 'Updated live meeting'); await a.ready('Preserved family event');
  assert.equal(await a.evaluate(`!!document.querySelector('[aria-label="Edit Updated live meeting"]')`), false);
  await a.go('/calendar', 'Updated live meeting');
  await a.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1200, deviceScaleFactor: 1, mobile: false });
  await a.go('/ambient', 'Updated live meeting');
  await a.go('/settings', 'Connected · Google Calendar');
  await a.click('Sync now'); await a.ready('Reconnect required');
  await a.evaluate(`window.googleTest.sub = 'another-user'`); await a.click('Reconnect Google Calendar'); await a.ready('different account');
  assert.equal((await readCache()).accounts[0].id, 'google:test-user');
  await a.evaluate(`window.googleTest.sub = 'test-user'`); await a.click('Reconnect Google Calendar'); await a.ready('Connected · Google Calendar');
  await a.evaluate('window.googleTest.cancelled = true'); await a.click('Sync now');
  assert.equal((await readCache()).events.filter(event => event.externalCalendarId === 'primary').length, 0);
  await a.evaluate('window.googleTest.cancelled = false'); await a.click('Sync now');
  await a.evaluate('window.googleTest.deleted = true'); await a.click('Sync now');
  assert.equal((await readCache()).events.filter(event => event.externalCalendarId === 'primary').length, 0);
  await a.click('Disconnect'); await a.ready('Signed out / not connected');
  assert.equal((await readCache()).events.length, 0); assert.equal(await readLocal(), localBefore);
  console.log('PASS imported timelines, browser reload reauthorization, wrong-account rejection, updates/cancellations/deletions and disconnect');
  await a.evaluate('window.googleTest.deleted = false'); await a.click('Connect Google Calendar'); await a.ready('Connected · Google Calendar');
  const accountClick = async (id, label) => {
    assert.ok(await a.evaluate(`(() => { const row = document.querySelector('[data-testid="calendar-account-${id}"]'); const button = [...(row?.querySelectorAll('[role=button],button') ?? [])].find(el => el.innerText === ${JSON.stringify(label)}); button?.click(); return !!button; })()`));
    await pause(200);
  };
  await accountClick('google:test-user', 'Sync now');
  await choose('Family calendar: Primary Google calendar'); await choose('Primary Google calendar color: Gold');
  await a.evaluate(`window.googleTest.sub = 'second-user'`); await a.click('Connect Google Calendar'); await a.ready('2 connected calendar accounts');
  await accountClick('google:second-user', 'Sync now');
  assert.equal((await readCache()).events.length, 4);
  await accountClick('google:test-user', 'Sync now'); // token still belongs to the first login
  assert.equal((await readCache()).calendars.find(item => item.accountId === 'google:test-user' && item.id === 'primary').colorOverride, '#C7952D');
  await a.evaluate('window.outlookTest.wrongState = true'); await a.click('Connect Microsoft Outlook'); await a.ready('could not be verified');
  assert.equal((await readCache()).accounts.length, 2);
  await a.evaluate('window.outlookTest.wrongState = false; window.outlookTest.partial = true'); await a.click('Connect Microsoft Outlook'); await a.ready('Grant read-only calendar access');
  await a.evaluate('window.outlookTest.partial = false'); await a.click('Connect Microsoft Outlook'); await a.ready('3 connected calendar accounts');
  await accountClick('outlook:outlook-user', 'Sync now'); await a.ready('Outlook work calendar');
  assert.equal((await readCache()).events.length, 5);
  assert.ok(await a.evaluate(`window.outlookTest.requests.every(request => request.method === 'GET' && request.bearer)`));
  assert.ok(await a.evaluate(`window.outlookTest.authRequests.every(request => request.response_type === 'code' && request.code_challenge_method === 'S256' && !request.scope.includes('Write') && !request.scope.includes('offline_access'))`));
  assert.equal(await a.evaluate(`JSON.stringify(localStorage).includes('mock-outlook-token')`), false);
  for (const [width, height] of [[320,568], [390,844], [844,390]]) {
    await a.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(100);
    assert.deepEqual(await a.evaluate(`Array.from(document.querySelectorAll('[role=button],[role=radio]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).map(el => el.getAttribute('aria-label') || el.innerText)`), []);
  }
  await a.go('/', 'Live Outlook meeting'); await a.ready('Live Google meeting');
  assert.equal(await a.evaluate(`!!document.querySelector('[aria-label="Edit Live Outlook meeting"]')`), false);
  assert.equal(await a.evaluate(`document.body.innerText.split('Live Google meeting').length - 1`), 1, 'Shared Google calendar is deduplicated');
  await a.go('/calendar', 'Live Outlook meeting');
  await a.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1200, deviceScaleFactor: 1, mobile: false });
  await a.go('/ambient', 'Live Outlook meeting');
  const familyData = { ...data, settings: { ...data.settings, ambientMode: 'family' } };
  await a.evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(familyData, 2)))})`);
  await a.go('/ambient', 'Live Google meeting');
  assert.equal(await a.evaluate(`document.body.innerText.includes('Live Outlook meeting')`), false);
  await a.go('/settings', '3 connected calendar accounts');
  await accountClick('google:second-user', 'Disconnect');
  assert.equal((await readCache()).events.length, 3);
  await accountClick('outlook:outlook-user', 'Disconnect');
  assert.equal((await readCache()).events.length, 2);
  await a.evaluate(`window.googleTest.sub = 'test-user'`); await accountClick('google:test-user', 'Reconnect Google Calendar');
  console.log('PASS three connected accounts, real AuthSession popup callback and PKCE with mocked OAuth, state/consent rejection, shared-calendar deduplication, color/family settings, mobile bounds and account-specific disconnect');
  await a.evaluate('window.googleTest.pending = true'); await a.click('Sync now');
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  await a.evaluate('window.googleTest.pending = false; window.googleTest.release?.()'); await pause(250);
  assert.equal((await readCache())?.accounts?.length ?? 0, 0);
  await a.go('/', 'No events today.');
  await a.go('/settings', 'Signed out / not connected');
  await pause(200); await a.evaluate('window.outlookTest.pending = true');
  await a.click('Connect Microsoft Outlook'); await a.ready('Sync in progress');
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  await pause(250); assert.equal((await readCache())?.accounts?.length ?? 0, 0);
  await a.evaluate('window.outlookTest.pending = false'); await a.click('Connect Microsoft Outlook'); await a.ready('Connected · Microsoft Outlook');
  await accountClick('outlook:outlook-user', 'Disconnect');
  assert.deepEqual(errors, []);
  console.log('PASS reset during in-flight sync/OAuth cannot restore imports; Outlook can reconnect after popup cancellation; no runtime exceptions');
}
const watchdog = setTimeout(() => { console.error('Google calendar harness timed out'); process.exitCode = 1; for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); }, 120000);
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); });
