const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.POLISH_DIST || 'dist');
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
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4180' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4180, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9230', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/snooze-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9230/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  const key = 'lifecommand:data:v1';
  const data = require('../.test-build/src/domain/defaults.js').createDefaultAppData(); data.settings.autoRollover = false;
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { createTask } = require('../.test-build/src/domain/tasks.js');
  const { createEvent } = require('../.test-build/src/domain/events.js');
  const { scheduleReminders } = require('../.test-build/src/domain/reminders.js');
  data.tasks = ['Fifteen', 'Hour', 'Tomorrow', 'Acknowledge'].map(title => createTask({title, sectionId:'work', reminderEnabled:true, reminderAt:'2020-01-01T09:00:00.000Z'}));
  data.familyEvents = [createEvent({title:'Family acknowledgement', date:'2020-01-01', source:'family', addedBy:'Max', category:'Other', reminderEnabled:true})];
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  const choose = async label => { assert.ok(await a.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if(!el) return false; el.click(); return true; })()`), label); await pause(200); };
  await a.go('/settings', 'Quiet hours');
  await a.evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(key)})).forEach(k => localStorage.removeItem(k)); localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))})`);
  // Today no longer exposes reminder actions. Their lifecycle remains covered by
  // reminder-actions.test.ts; keep browser coverage for quiet hours and storage.
  await a.go('/', 'Schedule');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label^="Snooze"], [aria-label^="Acknowledge:"]') !== null`), false);
  let saved = await read();
  assert.equal(saved.tasks.filter(task => task.reminderEnabled).length, 4);
  await a.go('/settings','Quiet hours');
  await choose('Quiet hours enabled');
  await a.fill('Quiet hours start, HH:MM','25:00'); await a.click('Save quiet hours start'); await a.ready('Use HH:MM');
  assert.equal((await read()).settings.quietHoursStart,'22:00');
  await a.fill('Quiet hours start, HH:MM','21:30'); await a.click('Save quiet hours start');
  await a.fill('Quiet hours end, HH:MM','08:15'); await a.click('Save quiet hours end');
  await a.go('/settings','Quiet hours');
  saved=await read(); assert.equal(saved.settings.quietHoursEnabled,true); assert.equal(saved.settings.quietHoursStart,'21:30'); assert.equal(saved.settings.quietHoursEnd,'08:15');
  for (const [width,height] of [[320,568],[390,844],[844,390]]) {
    await a.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    assert.equal(await a.evaluate(`Array.from(document.querySelectorAll('[aria-label^="Quiet hours"]')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right > innerWidth+1)}).length`),0);
  }
  const { localDateKey } = require('../.test-build/src/domain/dates.js');
  const evening = new Date(`${localDateKey(new Date())}T23:00:00`).toISOString();
  saved.tasks[0].reminderAt=evening;
  const descriptor=scheduleReminders(saved).find(r=>r.title==='Fifteen');
  assert.ok(Date.parse(descriptor.notificationReadyAt)>Date.parse(evening));
  await a.go('/settings','Quiet hours');
  await a.fill('Quiet hours start, HH:MM','04:44');
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Quiet hours start, HH:MM"]').value`),'22:00');
  assert.equal((await read()).settings.quietHoursEnabled,false);
  assert.deepEqual(errors,[]);
  console.log('PASS hidden Today reminder actions, retained reminder data, quiet hours validation/persistence/scheduling, mobile bounds and reset draft clearing');
}
const watchdog=setTimeout(()=>{console.error('Snooze harness timed out');process.exitCode=1;for(const c of clients)c.ws.close();chrome?.kill();server.close()},120000);
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{clearTimeout(watchdog);for(const c of clients)c.ws.close();chrome?.kill();server.close()});
