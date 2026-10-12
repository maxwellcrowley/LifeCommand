// Only synthetic records, a fresh browser profile, and loopback requests.
const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync, mkdtempSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const productMode = false, settingsMode = false;
const root = resolve('.test-build/recurrence-export');
const pause = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  let file = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  if (file === root) file = resolve(root, 'index.html');
  else if (!extname(file)) file += '.html';
  if (!existsSync(file) && /^\/(task|project|event)\//.test(req.url)) file = resolve(root, req.url.split('/')[1], '[id].html');
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' })[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
let chrome, ws;
const watchdog = setTimeout(() => { console.error('FAIL: section icon browser check timed out'); ws?.close(); chrome?.kill(); server.close(); process.exitCode = 1; }, 240000);
async function main() {
  assert.ok(existsSync(resolve(root, 'index.html')), 'Export must exist');
  await new Promise((r, j) => { server.once('error', j); server.listen(0, '127.0.0.1', r); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = mkdtempSync(resolve('.test-build/section-icon-chrome-'));
  console.log('stage: starting isolated browser');
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', () => console.error('Browser process failed to start'));
  const portFile = resolve(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await pause(100);
  assert.ok(existsSync(portFile), 'Browser did not expose DevTools within 10 seconds');
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { const timer = setTimeout(() => j(Error('DevTools connection timeout')), 5000); ws.addEventListener('open', () => { clearTimeout(timer); r(); }, { once: true }); ws.addEventListener('error', () => { clearTimeout(timer); j(Error('DevTools connection error')); }, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); clearTimeout(p.timer); pending.delete(msg.id); if (msg.error) p.reject(Error(msg.error.message)); else p.resolve(msg.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(Error('DevTools timeout: ' + method)); }, 8000); pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.ok(!r.exceptionDetails, 'Browser expression failed'); return r.result.value; };
  const ready = async label => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(label)})`)) return; await pause(100); } throw Error('Missing content: ' + label + (settingsMode ? '\nSynthetic editor: ' + await evaluate(`document.querySelector('[data-testid="settings-dialog"]')?.innerText ?? 'closed'`) : '')); };
  const click = async label => { assert.ok(await evaluate(`(() => { const e=[...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)} && e.getClientRects().length); if(!e) return false; e.scrollIntoView({block:'center'}); e.focus(); e.click(); return true; })()`), label); await pause(200); };
  const fill = async (label, value) => { await evaluate(`(() => {const e=document.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true}));})()`); await pause(150); };
  const go = async (path, label) => { await send('Page.navigate', { url: origin + path }); await pause(300); await ready(label); await pause(200); };
  const snap = () => evaluate(`JSON.parse(localStorage.getItem('lifecommand:data:v1'))`);
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve('.test-build/' + (productMode ? 'product-' : settingsMode ? 'settings-' : 'recurrence-') + name + '.png'), Buffer.from(r.data, 'base64')); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { createTask } = require('../.test-build/src/domain/tasks.js');
  const { createProject } = require('../.test-build/src/domain/projects.js');
  const { localDateKey } = require('../.test-build/src/domain/dates.js');
  const data = createDefaultAppData(), today = localDateKey(new Date());
  data.settings.autoRollover = false;
  data.projects = [createProject({ name: 'Synthetic home project', sectionId: 'home' })];
  data.sections = data.sections.map(s => s.id === 'home' ? { ...s, color: '#FFFFEE', icon: 'home' } : s.id === 'work' ? { ...s, color: '#010203', icon: 'work' } : s);
  data.tasks = [createTask({ title: 'Synthetic home task', sectionId: 'home', dueDate: today }), createTask({ title: 'Synthetic work task', sectionId: 'work', dueDate: today }), createTask({ title: 'Synthetic backlog', sectionId: 'home' })];
  data.onboardingComplete = true;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(origin)}&&!sessionStorage.getItem('section-fixture')) {localStorage.setItem('lifecommand:data:v1',${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))}); sessionStorage.setItem('section-fixture','yes');}` });
  await require('./recurrence-workflow.cjs').run({ send, evaluate, ready, click, fill, go, snap, shot, pause, data, today });
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); ws?.close(); chrome?.kill(); server.close(); });
