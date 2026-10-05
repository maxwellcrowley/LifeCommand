const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.POLISH_DIST || '.test-build/calendar-dist');
const server = createServer((req, res) => {
  let file = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + sep)) file = resolve(root, 'index.html');
  if (!extname(file)) file += '.html';
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser; let ws;
async function main() {
  await new Promise(resolve => server.listen(4188, '127.0.0.1', resolve));
  browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9241', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', '--in-process-gpu', '--disable-features=Vulkan', '--user-data-dir=' + resolve('.test-build/unhide-browser-profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80; i++) { try { targets = await (await fetch('http://127.0.0.1:9241/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'headless browser DevTools is reachable');
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const message = JSON.parse(data); if (!message.id) return; const waiter = pending.get(message.id); pending.delete(message.id); message.error ? waiter.reject(message.error) : waiter.resolve(message.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  const ready = async value => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(value)})`)) return; await pause(100); } throw Error('Missing ' + value + ': ' + await evaluate('document.body.innerText')); };
  const click = async (label, text = false) => {
    const selector = text ? `[role=button],button,a` : `[aria-label]`;
    const expression = `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => ${text ? `el.innerText === ${JSON.stringify(label)}` : `el.getAttribute('aria-label') === ${JSON.stringify(label)}`}); if (!el) return false; el.click(); return true; })()`;
    assert.equal(await evaluate(expression), true, `button ${label}`); await pause(200);
  };
  const navigate = async (path, text) => { await send('Page.navigate', { url: `http://127.0.0.1:4188${path}` }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  await navigate('/', 'LIFECOMMAND');
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { localDateKey } = require('../.test-build/src/domain/dates.js');
  const { externalIdentity, EXTERNAL_CALENDAR_KEY } = require('../.test-build/src/domain/externalCalendars.js');
  const today = localDateKey(new Date()); const from = new Date(); from.setHours(from.getHours() + 1, 0, 0, 0); const through = new Date(from.getTime() + 60 * 60 * 1000);
  const accountId = 'unhide-browser-account'; const calendarId = 'unhide-browser-calendar'; const externalEventId = 'unhide-browser-event';
  const eventKey = externalIdentity(accountId, calendarId, externalEventId);
  const event = { id: eventKey, source: 'google', provider: 'google', accountId, externalCalendarId: calendarId, externalEventId, sourceCalendarName: 'Fixture calendar', title: 'Browser unhide fixture', date: today, startTime: `${String(from.getHours()).padStart(2, '0')}:00`, endTime: `${String(through.getHours()).padStart(2, '0')}:00`, allDay: false, start: from.toISOString(), end: through.toISOString(), lastSyncedAt: new Date().toISOString() };
  const cache = { version: 2, accounts: [{ id: accountId, provider: 'google', mode: 'google', label: 'Fixture account', syncEnabled: true }], calendars: [{ id: calendarId, accountId, name: 'Fixture calendar', syncEnabled: true }], hiddenEventIds: [eventKey], events: [event] };
  const data = createDefaultAppData(); data.settings.ambientDisplayEnabled = true;
  await evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))}); localStorage.setItem('lifecommand:device:presentation:v1', ${JSON.stringify(JSON.stringify({ ambient: { ambientDisplayEnabled: true } }))}); localStorage.setItem(${JSON.stringify(EXTERNAL_CALENDAR_KEY)}, ${JSON.stringify(JSON.stringify(cache))})`);
  await navigate('/calendar', 'Hidden events');
  await click('Show hidden events (1)', true); await ready('Unhide');
  await click('Unhide event: Browser unhide fixture'); await ready('Unhide event?');
  await evaluate(`window.unhideFixtureOriginalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === ${JSON.stringify(EXTERNAL_CALENDAR_KEY)}) throw Error('Fixture visibility save failure'); return window.unhideFixtureOriginalSet.call(this, key, value); }`);
  await click('Confirm unhide event'); await ready('Browser unhide fixture');
  await ready('Fixture visibility save failure');
  assert.match(await evaluate('document.body.innerText'), /Retry/);
  await evaluate('Storage.prototype.setItem = window.unhideFixtureOriginalSet');
  await click('Retry unhide event'); await ready('Browser unhide fixture');
  const restored = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(EXTERNAL_CALENDAR_KEY)}))`);
  assert.deepEqual(restored.hiddenEventIds, []);
  assert.equal(restored.events[0].id, eventKey);
  await navigate('/', 'Browser unhide fixture');
  await navigate('/ambient', 'Browser unhide fixture');
  await navigate('/calendar', 'Browser unhide fixture');
  console.log('PASS headless Calendar Unhide button confirmation, durable visibility, and Today/Calendar/Ambient event display');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { ws?.close(); browser?.kill(); server.close(); });
