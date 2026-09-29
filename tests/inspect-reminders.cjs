const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { seedData } = require('../.test-build/src/domain/seed.js');
const root = resolve('dist');
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
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const ready = async text => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } throw Error('Missing ' + text + ': ' + await evaluate('document.body.innerText')); };
  const click = async text => { assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,a')].find(el => el.innerText === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), 'Button: ' + text); await pause(150); };
  const fill = async (label, value) => evaluate(`(() => { const el = [...document.querySelectorAll('input')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) throw Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4179' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4179, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9229', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/reminders-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9229/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  const key = 'lifecommand:data:v1';
  const data = require('../.test-build/src/domain/defaults.js').createDefaultAppData(); data.settings.autoRollover = false;
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  const choose = async label => { assert.ok(await a.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if(!el) return false; el.click(); return true; })()`), label); await pause(200); };
  await a.go('/settings', 'Reminder defaults');
  await a.evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(key)})).forEach(k => localStorage.removeItem(k)); localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))})`);
  await a.go('/settings', 'Reminder defaults');
  await choose('Default task reminder: Morning of (09:00)');
  await choose('Default event reminder: 15 minutes before');
  assert.equal((await read()).settings.defaultTaskReminder, 'morning-of');
  assert.equal((await read()).settings.defaultEventReminder, '15-minutes');
  await a.go('/capture', 'Save task');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Enable reminder"]').checked`), true);
  await a.fill('Task title, required', 'Reminder harness task');
  await choose('Reminder: Custom date and time');
  await a.click('Save task'); await a.ready('Enter a valid reminder date');
  await a.fill('Reminder date, YYYY-MM-DD', '2020-01-01');
  await a.fill('Reminder time, HH:MM', '08:30');
  await a.click('Save task'); await a.ready('Section backlogs');
  let saved = (await read()).tasks[0];
  assert.equal(saved.reminderEnabled, true); assert.ok(saved.reminderAt);
  await a.go('/', 'Due: Reminder harness task');
  await a.go('/task/' + saved.id, 'Save changes');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Reminder time, HH:MM"]').value`), '08:30');
  for (const [width,height] of [[320,568],[390,844],[844,390]]) {
    await a.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    assert.equal(await a.evaluate(`Array.from(document.querySelectorAll('[aria-label^="Reminder:"], [aria-label^="Reminder date"], [aria-label^="Reminder time"]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).length`), 0);
  }
  await a.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: false });
  await a.evaluate(`document.querySelector('[aria-label="Enable reminder"]').scrollIntoView({ block: 'start' })`);
  const shot = await a.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve('.test-build/reminders-editor.png'), Buffer.from(shot.data, 'base64'));
  await choose('Reminder: 1 hour before');
  await a.evaluate(`window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'lifecommand:data:v1') throw Error('Reminder write failure'); return window.__set.call(this,k,v); }`);
  await a.click('Save changes'); await a.ready('Reminder write failure');
  assert.ok((await read()).tasks[0].reminderAt);
  await a.evaluate('Storage.prototype.setItem = window.__set');
  await a.click('Save changes'); await pause(300);
  saved = (await read()).tasks[0]; assert.equal(saved.reminderOffset, '1-hour'); assert.equal(saved.reminderAt, undefined);
  await a.go('/task/' + saved.id, 'Save changes');
  await choose('Reminder: Custom date and time'); await a.fill('Reminder date, YYYY-MM-DD', '2020-01-01');
  await a.click('Save changes'); await pause(300);
  await a.go('/', 'Due: Reminder harness task');
  await a.go('/task/' + saved.id, 'Save changes'); await choose('Status: complete'); await a.click('Save changes'); await pause(300);
  await a.go('/', 'No reminders scheduled.');
  console.log('PASS task defaults, custom validation, Today due indication, persistence, responsive controls, failed save/retry, relative clearing and completion exclusion');
  await a.go('/event/new', 'Save event');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Reminder: 15 minutes before"]').getAttribute('aria-checked')`), 'true');
  await a.fill('Title \u00b7 required', 'Reminder harness event');
  // Pick family through its visible radio label.
  await a.evaluate(`Array.from(document.querySelectorAll('[role=radio]')).find(el => el.innerText === 'Family').click()`); await pause(100);
  await a.click('Save event'); await pause(300);
  let family = (await read()).familyEvents[0]; assert.equal(family.reminderOffset, '15-minutes');
  await a.go('/event/' + encodeURIComponent('family:' + family.id), 'Save event');
  await choose('Enable reminder'); await a.click('Save event'); await pause(300);
  family = (await read()).familyEvents[0]; assert.equal(family.reminderEnabled, false);
  await a.go('/event/' + encodeURIComponent('family:' + family.id), 'Save event');
  await choose('Enable reminder'); await a.click('Save event'); await pause(300);
  await a.go('/event/' + encodeURIComponent('family:' + family.id), 'Save event');
  await a.click('Archive event'); await a.click('Confirm archive'); await pause(300);
  assert.ok((await read()).familyEvents[0].archivedAt);
  await a.go('/', 'No reminders scheduled.');
  await a.go('/settings', 'Reminder defaults');
  assert.equal((await read()).settings.defaultEventReminder, '15-minutes');
  assert.deepEqual(errors, []);
  console.log('PASS family event defaults, toggle persistence, archive exclusion, Settings persistence and no runtime exceptions');
}
const watchdog = setTimeout(() => { console.error('Reminder harness timed out'); process.exitCode = 1; for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); }, 120000);
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); });
