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
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png' })[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
let chrome, ws;
const pending = new Map();
let id = 0;
async function main() {
  await new Promise(r => server.listen(4177, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9227', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/transfer-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  chrome.on('error', e => { throw e; });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9227/json')).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools is reachable');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  const errors = [];
  ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.error(JSON.stringify(m.params.args)); });
  ws.addEventListener('message', ({ data }) => { const message = JSON.parse(data); if (message.id) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(message.error) : p.resolve(message.result); } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  await send('Runtime.enable');
  await send('Page.enable');
  const ready = async expected => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body.innerText.includes(${JSON.stringify(expected)})`)) return; await pause(100); } throw Error('Missing ' + expected + ': ' + await evaluate('document.body.innerText')); };

  const click = async text => {
    assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,a')].find(el => el.innerText === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), 'Button exists: ' + text);
    await pause(150);
  };
  const read = async () => { const { schemaVersion, revision, ...data } = await evaluate('JSON.parse(localStorage.getItem("lifecommand:data:v1"))'); assert.equal(schemaVersion, 3); assert.ok(revision >= 1); return data; };

  const fixture = require('../.test-build/src/domain/normalize.js').normalizeAppData(seedData);
  fixture.settings.autoRollover = false;
  const key = 'lifecommand:data:v1';
  const prefix = key + ':recovery:';
  const incoming = require('../.test-build/src/domain/defaults.js').createDefaultAppData();
  incoming.settings.autoRollover = false;
  incoming.settings.appearance = 'dark';
  incoming.tasks = [{ ...fixture.tasks[0], title: 'Imported task', id: 'imported-task' }];
  incoming.projects = fixture.projects;
  const envelope = require('../.test-build/src/domain/transfer.js').createExport(incoming);
  const filePath = resolve('.test-build/transfer-input.json');
  const navigate = async () => { await send('Page.navigate', { url: 'http://127.0.0.1:4177/settings' }); await ready('Data Management'); };
  const backupKeys = () => evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(prefix)}))`);
  const choose = async raw => {
    writeFileSync(filePath, raw);
    const { root } = await send('DOM.getDocument');
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    assert.ok(nodeId);
    await send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
    await pause(200);
  };
  await navigate();
  await evaluate(`Object.keys(localStorage).filter(k => k.startsWith(${JSON.stringify(key)})).forEach(k => localStorage.removeItem(k)); localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify({ ...fixture, schemaVersion: 3, revision: 1 }))}); localStorage.setItem('unrelated-transfer-test','keep')`);
  await navigate();
  const original = await read();
  await evaluate(`window.__originalURL = URL.createObjectURL; URL.createObjectURL = blob => { blob.text().then(text => window.__exported = text); return window.__originalURL(blob); }`);
  await click('Export local data');
  await ready('Export download requested');
  const exported = JSON.parse(await evaluate('window.__exported'));
  assert.deepEqual(exported.data, original);
  assert.equal(exported.schemaVersion, 3);
  assert.ok(Date.parse(exported.exportedAt));
  assert.deepEqual(await backupKeys(), []);
  console.log('PASS export blob contains all saved data and version without replacement');
  for (const raw of ['{bad', JSON.stringify({ ...envelope, schemaVersion: 4 }), JSON.stringify({ ...envelope, data: { ...incoming, tasks: [null] } })]) {
    await click('Import local data');
    await choose(raw);
    assert.equal(await evaluate(`document.body.innerText.includes('Confirm import and replace data')`), false);
    assert.deepEqual(await read(), original);
    assert.deepEqual(await backupKeys(), []);
    await click('Cancel');
  }
  console.log('PASS malformed and incompatible imports reject before writes');
  for (const [width, height] of [[320,568],[390,844],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await click('Import local data');
    await choose(JSON.stringify(envelope));
    await ready('Import preview');
    assert.ok(await evaluate(`document.body.innerText.includes('does not merge')`));
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role=dialog] [role=button]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).length`), 0);
    if (width === 320) { const shot = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve('.test-build/transfer-preview.png'), Buffer.from(shot.data, 'base64')); }
    await click('Cancel');
    assert.deepEqual(await read(), original);
    assert.deepEqual(await backupKeys(), []);
  }
  console.log('PASS phone/landscape preview controls and cancellation preserve data');
  await click('Import local data');
  await choose(JSON.stringify(envelope));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await pause(200);
  assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
  await click('Import local data');
  await choose(JSON.stringify(envelope));
  await evaluate(`window.__setItem = Storage.prototype.setItem; window.__failBackup = true; window.__writes = []; Storage.prototype.setItem = function(k,v) { if(window.__failBackup && k.startsWith(${JSON.stringify(prefix)})) throw Error('injected quota'); window.__writes.push(k); return window.__setItem.call(this,k,v); }`);
  await click('Confirm import and replace data');
  await ready('Could not create a recovery backup');
  assert.deepEqual(await read(), original);
  assert.deepEqual(await backupKeys(), []);
  await evaluate('window.__failBackup = false');
  await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button]')].find(e => e.innerText === 'Confirm import and replace data'); el.click(); el.click(); })()`);
  await ready('Import complete.');
  assert.deepEqual(await read(), JSON.parse(JSON.stringify(incoming)));
  const afterImport = await backupKeys();
  assert.equal(afterImport.length, 1);
  const recovery = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(afterImport[0])}))`);
  const { schemaVersion, revision, ...backupData } = JSON.parse(recovery.raw);
  assert.equal(schemaVersion, 3); assert.equal(revision, 1);
  assert.deepEqual(backupData, original);
  const writes = await evaluate('window.__writes');
  assert.deepEqual(writes, [afterImport[0], key]);
  console.log('PASS backup failure/retry, duplicate confirmation, exact backup-before-import ordering and live replacement');
  await click('View recovery backups (1)');
  await ready('Before import');
  await click('Preview backup 1');
  await ready('Restore preview');
  await click('Cancel');
  assert.deepEqual(await read(), JSON.parse(JSON.stringify(incoming)));
  await click('View recovery backups (1)');
  await click('Preview backup 1');
  await click('Confirm restore and replace data');
  await ready('Restore complete.');
  assert.deepEqual(await read(), original);
  assert.equal((await backupKeys()).length, 2);
  await navigate();
  assert.deepEqual(await read(), original);
  await ready('View recovery backups (2)');
  await click('View recovery backups (2)');
  await ready('Before restore');
  await click('Cancel');
  console.log('PASS preview/cancel/restore, backup-before-restore and restart persistence');
  await evaluate(`localStorage.setItem(${JSON.stringify(prefix + '1000')}, '{broken')`);
  await ready('View recovery backups (2)');
  await click('View recovery backups (2)');
  await ready('Cannot restore:');
  assert.ok(await evaluate(`document.body.innerText.includes('not valid JSON')`));
  assert.equal(await evaluate('localStorage.getItem("unrelated-transfer-test")'), 'keep');
  assert.deepEqual(errors, []);
  console.log('PASS invalid legacy copy visible, unrelated storage retained and no runtime exceptions');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (ws) ws.close();
  if (chrome) chrome.kill();
  await new Promise(r => server.close(r));
});
