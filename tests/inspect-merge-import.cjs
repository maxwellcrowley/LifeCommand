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
  const ready = async text => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } throw Error('Missing ' + text + ': ' + await evaluate('document.body.innerText')); };
  const click = async text => { assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,a')].find(el => el.innerText === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), 'Button: ' + text); await pause(150); };
  const fill = async (label, value) => evaluate(`(() => { const el = [...document.querySelectorAll('input')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) throw Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4187' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4187, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9237', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/merge-import-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9237/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools is reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  const target = await (await fetch('http://127.0.0.1:9237/json/new?about:blank', { method: 'PUT' })).json();
  const b = await connect(target);
  const key = 'lifecommand:data:v1';
  const prefix = key + ':recovery:';
  const normalize = require('../.test-build/src/domain/normalize.js').normalizeAppData;
  const original = JSON.parse(JSON.stringify(normalize(seedData)));
  original.settings.autoRollover = false;
  const originalRaw = JSON.stringify({ ...original, schemaVersion: 3, revision: 1 });
  const incoming = structuredClone(original);
  incoming.settings.appearance = 'dark';
  incoming.projects = [
    { ...original.projects[0], id: 'project-alias', name: '  ' + original.projects[0].name.toUpperCase() + '  ' },
    { ...original.projects[0], id: 'new-project', name: 'Merge browser project' },
  ];
  incoming.tasks = [
    { ...original.tasks[0], title: 'Conflicting edit must be ignored' },
    { ...original.tasks[0], id: 'merge-existing-link', title: 'Merge existing project task', projectId: 'project-alias' },
    { ...original.tasks[0], id: 'merge-new-link', title: 'Merge new project task', projectId: 'new-project' },
    { ...original.tasks[0], id: 'merge-missing', title: 'Broken link skipped', projectId: 'absent-project' },
  ];
  // History is out of scope but still must pass ordinary file validation.
  delete incoming.lastRolloverSummary;
  const envelope = JSON.stringify({ format: 'lifecommand-export', schemaVersion: 3, exportedAt: '2026-10-01T12:00:00Z', data: incoming });
  const file = resolve('.test-build/merge-import-input.json');
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  const backups = () => a.evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(prefix)}))`);
  const choose = async (client, raw = envelope) => {
    writeFileSync(file, raw);
    const { root } = await client.send('DOM.getDocument');
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    assert.ok(nodeId);
    await client.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    await pause(250);
  };
  const preview = async client => { await client.click('Merge import projects/tasks'); await choose(client); await client.ready('Merge import preview'); };
  await a.go('/settings', 'Data Management');
  await a.evaluate(`Object.keys(localStorage).filter(k => k.startsWith('lifecommand:')).forEach(k => localStorage.removeItem(k)); localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(originalRaw)}); localStorage.setItem('unrelated-merge-test', 'keep'); localStorage.setItem('lifecommand:notifications:v1', '{"enabled":true,"respectQuietHours":false}')`);
  await a.go('/settings', 'Data Management');
  const initial = await read();
  for (const raw of ['{bad', JSON.stringify({ format: 'lifecommand-export', schemaVersion: 999 }), envelope.replace('"storyPoints":1', '"storyPoints":-1')]) {
    if (raw === envelope) continue;
    await a.click('Merge import projects/tasks'); await choose(a, raw);
    assert.equal(await a.evaluate(`document.body.innerText.includes('Confirm merge import')`), false);
    assert.deepEqual(await read(), initial); assert.equal((await backups()).length, 0);
    await a.click('Cancel');
  }
  console.log('PASS invalid files show errors and never mutate data');
  for (const [width, height] of [[320,568], [390,844], [844,390]]) {
    await a.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await preview(a);
    for (const text of ['Projects to add: 1', 'Projects already present / skipped: 1', 'Tasks to add: 2', 'Tasks already present / skipped: 1', 'Tasks skipped (missing project): 1', 'Existing local data will be preserved.']) await a.ready(text);
    assert.equal(await a.evaluate(`Array.from(document.querySelectorAll('[role=dialog] [role=button]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).length`), 0);
    if (width === 320) { const shot = await a.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve('.test-build/merge-import-preview.png'), Buffer.from(shot.data, 'base64')); }
    await a.click('Cancel'); assert.deepEqual(await read(), initial); assert.equal((await backups()).length, 0);
  }
  await preview(a);
  await a.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await a.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await pause(200);
  assert.equal(await a.evaluate(`!!document.querySelector('[role=dialog]')`), false);
  console.log('PASS preview counts, warnings, phone/landscape layouts, Cancel and Escape');
  // Keep an unsaved Settings draft: an additive merge must not reset it.
  await a.fill('Rollover time, 24-hour HH:MM', '05:15');
  await b.go('/task/' + original.tasks[0].id, 'Save changes');
  await b.fill('Task title, required', 'Stale editor must not win');
  await preview(a);
  await a.evaluate(`window.__originalSet = Storage.prototype.setItem; window.__failBackup = true; window.__writes = []; Storage.prototype.setItem = function(k,v) { if(window.__failBackup && k.startsWith(${JSON.stringify(prefix)})) throw Error('injected quota'); window.__writes.push(k); return window.__originalSet.call(this,k,v); }`);
  await a.click('Confirm merge import'); await a.ready('Could not create a recovery backup');
  assert.deepEqual(await read(), initial); assert.equal((await backups()).length, 0);
  await a.evaluate('window.__failBackup = false');
  await a.evaluate(`(() => { const el = [...document.querySelectorAll('[role=button]')].find(e => e.innerText === 'Confirm merge import'); el.click(); el.click(); })()`);
  await a.ready('Merge complete. Added 1 projects and 2 tasks.');
  const merged = await read();
  assert.equal(merged.revision, 2);
  assert.deepEqual(merged.tasks.slice(0, original.tasks.length), original.tasks);
  assert.deepEqual(merged.projects.slice(0, original.projects.length), original.projects);
  for (const name of ['sections', 'settings', 'calendarEvents', 'familyEvents', 'lastRolloverSummary']) assert.deepEqual(merged[name], original[name]);
  assert.equal(merged.tasks.find(t => t.id === 'merge-existing-link').projectId, original.projects[0].id);
  assert.equal(merged.tasks.find(t => t.id === 'merge-new-link').projectId, 'new-project');
  assert.equal(merged.tasks.some(t => t.id === 'merge-missing'), false);
  assert.equal(await a.evaluate(`document.querySelector('input[aria-label="Rollover time, 24-hour HH:MM"]').value`), '05:15');
  const keys = await backups(); assert.equal(keys.length, 1);
  assert.deepEqual(await a.evaluate('window.__writes'), [keys[0], key]);
  assert.equal(await a.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(keys[0])})).raw`), originalRaw);
  await b.ready('Local data changed in another tab'); await b.click('Save changes');
  assert.deepEqual(await read(), merged);
  await b.click('Reload local data'); await b.ready('Save changes');
  assert.equal(await b.evaluate(`document.querySelector('input[aria-label="Task title, required"]').value`), original.tasks[0].title);
  console.log('PASS backup failure/retry, duplicate taps, ordered backup, preserved local data/draft, mapped links and stale editor guard');
  await preview(a); await a.ready('Projects to add: 0'); await a.ready('Tasks to add: 0');
  await a.click('Confirm merge import'); await a.ready('Merge complete. Added 0 projects and 0 tasks.');
  assert.deepEqual(await read(), merged); assert.equal((await backups()).length, 1);
  await a.go('/settings', 'Data Management'); assert.deepEqual(await read(), merged);
  await a.click('View recovery backups (1)'); await a.ready('Before merge import'); await a.click('Preview backup 1');
  await a.click('Confirm restore and replace data'); await a.ready('Restore complete.');
  const restored = await read(); delete restored.revision; delete restored.schemaVersion;
  assert.deepEqual(restored, original);
  assert.equal(await a.evaluate(`localStorage.getItem('unrelated-merge-test')`), 'keep');
  assert.equal(await a.evaluate(`localStorage.getItem('lifecommand:notifications:v1')`), '{"enabled":true,"respectQuietHours":false}');
  console.log('PASS repeat merge has no writes, restart persistence, recovery restore and installation preferences');
  // A pending merge preview must lose to another tab's ordinary edit.
  await b.click('Reload local data'); await b.ready('Save changes');
  await preview(a);
  await b.fill('Task title, required', 'Saved by other tab'); await b.click('Save changes');
  await a.ready('Local data changed in another tab');
  const beforeStaleConfirm = await read(); const backupCount = (await backups()).length;
  await a.click('Confirm merge import');
  assert.deepEqual(await read(), beforeStaleConfirm); assert.equal((await backups()).length, backupCount);
  await a.click('Reload local data'); await a.ready('Data Management');
  assert.equal(await a.evaluate(`document.body.innerText.includes('Confirm merge import')`), false);
  console.log('PASS stale merge preview cannot write or back up; reload dismisses preview');
  assert.deepEqual(errors, []);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clients.forEach(c => c.ws.close()); chrome?.kill(); server.close(); });
