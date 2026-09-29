// Web smoke harness. Native delivery is covered by stubbed service tests and device QA.
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve('dist');
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
const errors = [];
async function main() {
  await new Promise(r => server.listen(4181, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9231', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/notifications-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9231/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
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
  const ready = async text => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } throw Error('Missing ' + text); };
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4181' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.notificationPrompts = 0; if (window.Notification) Notification.requestPermission = () => { window.notificationPrompts++; throw Error("Unexpected browser notification prompt"); };' });
  await go('/settings', 'Native notifications unavailable on web');
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { createTask } = require('../.test-build/src/domain/tasks.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const data = createDefaultAppData(); data.settings.autoRollover = false;
  data.tasks = [createTask({ title: 'Web reminder still works', sectionId: 'work', reminderEnabled: true, reminderAt: '2020-01-01T09:00:00Z' })];
  await evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))}); localStorage.removeItem('lifecommand:notifications:v1')`);
  await go('/settings', 'Permission status: unavailable');
  for (const [width, height] of [[320,568],[390,844],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const label of ['Enable native notifications', 'Respect quiet hours']) {
      assert.equal(await evaluate(`(() => { const e=document.querySelector('[aria-label="${label}"]'); const r=e.getBoundingClientRect(); return (e.disabled || e.getAttribute('aria-disabled')==='true') && r.left >= 0 && r.right <= innerWidth; })()`), true);
    }
    assert.equal(await evaluate(`[...document.querySelectorAll('[role=button]')].filter(e=>['Request permission','Test notification','Refresh notifications'].includes(e.innerText)).every(e=>e.getAttribute('aria-disabled')==='true' && e.getBoundingClientRect().height>=44)`), true);
  }
  await evaluate(`document.querySelector('[aria-label="Enable native notifications"]').click(); [...document.querySelectorAll('[role=button]')].find(e=>e.innerText==='Test notification').click()`);
  assert.equal(await evaluate('window.notificationPrompts'), 0);
  assert.equal(await evaluate("localStorage.getItem('lifecommand:notifications:v1')"), null);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('[aria-label="Enable native notifications"]').scrollIntoView({block:'center'})`);
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('.test-build/notifications-web.png', Buffer.from(screenshot.data, 'base64'));
  await go('/', 'Due: Web reminder still works');
  assert.ok(await evaluate(`document.querySelector('[aria-label="Snooze 15 minutes: Web reminder still works"]') !== null`));
  await evaluate(`document.querySelector('[aria-label="Acknowledge: Web reminder still works"]').click()`);
  await pause(300);
  assert.ok(await evaluate(`JSON.parse(localStorage.getItem('lifecommand:data:v1')).tasks[0].lastReminderAcknowledgedAt`));
  await go('/settings', 'Native notifications unavailable on web');
  assert.deepEqual(errors, []);
  console.log('PASS web unavailability, disabled accessible controls, no browser prompts/device writes, mobile bounds, reminder acknowledgement and reload');
}
const watchdog = setTimeout(() => { console.error('Notification harness timed out'); process.exitCode = 1; ws?.close(); chrome?.kill(); server.close(); }, 120000);
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); ws?.close(); chrome?.kill(); server.close(); });
