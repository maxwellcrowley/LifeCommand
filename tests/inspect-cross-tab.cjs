const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { seedData } = require('../.test-build/src/domain/seed.js');
const root = resolve(process.env.POLISH_DIST || 'dist');
const pause = ms => new Promise(r => setTimeout(r, ms));
const server = createServer((req, res) => {
  let file = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + sep)) file = resolve(root, 'index.html');
  if (!extname(file)) file += '.html';
  if (!existsSync(file) && /^\/(project|task)\//.test(req.url)) file = resolve(root, req.url.split('/')[1], '[id].html');
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
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4178' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4178, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9228', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/cross-tab-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9228/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools is reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  const target = await (await fetch('http://127.0.0.1:9228/json/new?about:blank', { method: 'PUT' })).json();
  const b = await connect(target);
  const key = 'lifecommand:data:v1';
  const prefix = key + ':recovery:';
  const data = require('../.test-build/src/domain/normalize.js').normalizeAppData(seedData);
  data.settings.autoRollover = false;
  const raw = JSON.stringify({ ...data, schemaVersion: 4, revision: 1 });
  await a.go('/settings', 'Data Management');
  await a.evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(key)})).forEach(k => localStorage.removeItem(k)); localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(raw)})`);
  await a.go('/settings', 'Data Management');
  await b.go('/task/' + data.tasks[0].id, 'Save changes');
  await b.fill('Task title, required', 'Stale draft must never win');
  const imported = structuredClone(data);
  imported.tasks[0].title = 'Replacement with same ID and timestamp';
  const envelope = require('../.test-build/src/domain/transfer.js').createExport(imported);
  const file = resolve('.test-build/cross-tab-import.json'); writeFileSync(file, JSON.stringify(envelope));
  const doImport = async () => {
    await a.click('Import and replace local data');
    const { root } = await a.send('DOM.getDocument');
    const { nodeId } = await a.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    await a.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    await a.ready('Import preview'); await a.click('Confirm import and replace data'); await a.ready('Import complete.');
  };
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  await doImport();
  await b.ready('Local data changed in another tab');
  for (const [width, height] of [[320,568],[390,844],[844,390]]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    assert.equal(await b.evaluate(`Array.from(document.querySelectorAll('[role=dialog] [role=button]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).length`), 0);
  }
  assert.equal((await read()).revision, 2);
  // Exercise the hidden stale editor handler too, bypassing the blocking modal.
  await b.click('Save changes');
  assert.equal((await read()).tasks[0].title, imported.tasks[0].title);
  await b.evaluate(`window.__getItem = Storage.prototype.getItem; Storage.prototype.getItem = function(k) { if(k === 'lifecommand:data:v1') throw Error('Injected reload failure'); return window.__getItem.call(this,k); }`);
  await b.click('Reload local data'); await b.ready('Injected reload failure');
  await b.evaluate('Storage.prototype.getItem = window.__getItem');
  await b.click('Reload local data'); await b.ready('Save changes');
  assert.equal(await b.evaluate(`document.querySelector('input[aria-label="Task title, required"]').value`), imported.tasks[0].title);
  assert.equal(await b.evaluate(`!!document.querySelector('[role=dialog]')`), false);
  console.log('PASS real two-tab import detection, identical record timestamps, stale handler protection and reload draft clearing');

  await a.click('View recovery backups (1)'); await a.click('Preview backup 1'); await a.click('Confirm restore and replace data'); await a.ready('Restore complete.');
  await b.ready('Local data changed in another tab'); await b.click('Reload local data'); await b.ready('Save changes');
  assert.equal(await b.evaluate(`document.querySelector('input[aria-label="Task title, required"]').value`), data.tasks[0].title);
  console.log('PASS restore broadcasts a fresh revision and reload returns the restored task');

  await b.go('/capture', 'Save task'); await b.fill('Task title, required', 'Unsaved capture');
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  await b.ready('Local data changed in another tab'); await b.click('Save task');
  assert.deepEqual((await read()).tasks, []);
  await b.click('Reload local data'); await b.ready('Save task');
  assert.equal(await b.evaluate(`document.querySelector('input[aria-label="Task title, required"]').value`), '');
  assert.equal(await a.evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(prefix)})).length`), 0);
  console.log('PASS Start Fresh blocks stale Capture, clears drafts on reload and keeps both tabs open');

  // Suppress event delivery: the save-time guard must work independently.
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.addEventListener('storage', e => e.stopImmediatePropagation());" });
  await b.go('/capture', 'Save task'); await b.fill('Task title, required', 'Delayed event draft');
  await doImport();
  await b.click('Save task'); await b.ready('Local data changed in another tab');
  assert.equal((await read()).tasks.some(t => t.title === 'Delayed event draft'), false);
  await b.click('Reload local data'); await b.ready('Save task');
  await b.fill('Task title, required', 'Safe after reload'); await b.click('Save task');
  assert.ok((await read()).tasks.some(t => t.title === 'Safe after reload'));
  await a.ready('Local data changed in another tab');
  console.log('PASS missing storage events cannot bypass save checks; ordinary writes also notify other tabs');
  assert.deepEqual(errors, []);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clients.forEach(c => c.ws.close()); chrome?.kill(); server.close(); });
