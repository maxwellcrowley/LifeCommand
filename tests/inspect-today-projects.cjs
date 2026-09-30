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
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4182' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4182, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9232', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + resolve('.test-build/today-projects-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9232/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { createTask, updateTask } = require('../.test-build/src/domain/tasks.js');
  const { createProject } = require('../.test-build/src/domain/projects.js');
  const { createEvent } = require('../.test-build/src/domain/events.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { localDateKey, addDays } = require('../.test-build/src/domain/dates.js');
  const today = localDateKey(new Date());
  const data = createDefaultAppData();
  data.settings.autoRollover = false;
  data.settings.defaultTaskReminder = 'morning-of';
  const project = createProject({ name: 'Polish project', sectionId: 'home', defaultTaskPoints: 3 });
  data.projects = [project];
  const task = (title, priority, dueDate = today) => createTask({ title, priority, dueDate, projectId: project.id, sectionId: 'home' });
  data.tasks = [task('Low today', 'low'), task('Normal today', 'normal'), task('High today', 'high'), task('High second', 'high'), task('Low overdue', 'low', addDays(today, -1)), updateTask(task('Done high', 'high'), { status: 'complete' }), task('Future', 'normal', addDays(today, 1))];
  const event = (title, startTime, source = 'personal') => createEvent({ title, date: today, startTime, source, ...(source === 'family' ? { addedBy: 'Kellyn', category: 'Family Plan' } : {}), reminderEnabled: true });
  data.calendarEvents = [event('Local afternoon', '14:00'), event('Local all day')];
  data.familyEvents = [event('Family morning', '08:00', 'family'), event('Family evening', '18:00', 'family')];
  data.lastRolloverSummary = { rolloverDate: addDays(today, -1), performedAt: new Date().toISOString(), movedTaskIds: [data.tasks[4].id] };
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem('lifecommand:data:v1'))`);
  const choose = async label => {
    assert.ok(await a.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) return false; el.click(); return true; })()`), label);
    await pause(150);
  };
  const taskTitles = () => a.evaluate(`Array.from(document.querySelectorAll('[aria-label^="Edit task:"]')).map(el => el.getAttribute('aria-label').slice(11))`);
  const bounds = async () => {
    for (const [width, height] of [[320,568], [390,844], [844,390]]) {
      await a.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      assert.deepEqual(await a.evaluate(`Array.from(document.querySelectorAll('input:not([type=checkbox]),[role=button],[role=checkbox],[role=radio]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).map(el => el.getAttribute('aria-label') || el.innerText)`), []);
    }
  };
  const screenshot = async name => {
    await a.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const shot = await a.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve('.test-build/' + name + '.png'), Buffer.from(shot.data, 'base64'));
  };
  await a.go('/settings', 'Data Management');
  await a.evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('lifecommand:')).forEach(k=>localStorage.removeItem(k)); localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))})`);
  await a.go('/', 'Family morning');
  assert.deepEqual(await taskTitles(), ['High today', 'High second', 'Normal today', 'Low today', 'Low overdue']);
  const body = await a.evaluate('document.body.innerText');
  assert.ok(body.indexOf("Today's tasks") < body.indexOf("Today's calendar"));
  for (const hidden of ['Next event', 'Rollover summary', 'Reminders', 'Reminder:', "Today's family events", 'Top priorities']) assert.equal(body.includes(hidden), false, hidden);
  const timeline = await a.evaluate(`(() => { const card = [...document.querySelectorAll('[role=heading],h1,h2,h3,h4,h5,h6')].find(el => el.innerText === "Today's calendar").parentElement; return { events: [...card.querySelectorAll('[aria-label^="Edit "]')].map(el => el.getAttribute('aria-label')), text: card.innerText }; })()`);
  assert.deepEqual(timeline.events, ['Edit Local all day', 'Edit Family morning', 'Edit Local afternoon', 'Edit Family evening']);
  assert.ok(timeline.text.includes('All day') && timeline.text.includes('Added by Kellyn'));
  await bounds();
  await screenshot('today-polish');
  await choose('Edit task: High today'); await a.ready('Save changes');
  await a.go('/', 'High today'); await choose('Complete High today');
  assert.equal((await read()).tasks.find(t => t.title === 'High today').status, 'complete');
  assert.equal((await taskTitles()).includes('High today'), false);
  console.log('PASS Today tasks first, priority order, all-day/combined timeline, attribution, hidden sections, mobile bounds and edit/complete');

  await a.go('/projects', 'Polish project'); await choose('Edit project: Polish project'); await a.ready('Project tasks');
  assert.deepEqual(await taskTitles(), ['High second', 'Normal today', 'Future', 'Low today', 'Low overdue', 'High today', 'Done high']);
  const progress = () => a.evaluate(`Number(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'))`);
  assert.equal(await progress(), 29);
  await a.click('Add task to project'); await a.ready('Title is required.');
  await a.fill('New project task title', 'Added directly');
  await choose('New task priority: high');
  await a.evaluate(`window.originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'lifecommand:data:v1') throw Error('Task write failure'); return window.originalSet.call(this,k,v); }`);
  await a.click('Add task to project'); await a.ready('Task write failure');
  assert.equal((await read()).tasks.length, 7); assert.equal(await progress(), 29);
  await a.evaluate('Storage.prototype.setItem = window.originalSet');
  const revision = (await read()).revision;
  await a.evaluate(`const add = document.querySelector('[aria-label="Add task to project"]'); add.click(); add.click();`);
  await a.ready('Added directly');
  let saved = await read();
  assert.equal(saved.tasks.length, 8); assert.equal(saved.revision, revision + 1);
  const added = saved.tasks.find(t => t.title === 'Added directly');
  assert.deepEqual([added.projectId, added.sectionId, added.priority, added.storyPoints, added.status, added.reminderOffset], [project.id, 'home', 'high', 3, 'backlog', 'morning-of']);
  assert.equal(await progress(), 25);
  assert.equal((await taskTitles())[0], 'Added directly');
  await screenshot('project-tasks-polish');
  await choose('Complete task: Added directly'); assert.equal(await progress(), 38);
  assert.equal((await read()).tasks.find(t => t.id === added.id).status, 'complete');
  await choose('Complete task: Added directly'); assert.equal(await progress(), 25);
  assert.equal((await read()).tasks.find(t => t.id === added.id).status, 'backlog');
  await choose('Archive task: Added directly'); await a.click('Cancel archive'); assert.equal(await progress(), 25);
  await choose('Archive task: Added directly');
  await bounds();
  await a.click('Confirm archive task'); assert.equal(await progress(), 29);
  assert.equal((await read()).tasks.find(t => t.id === added.id).status, 'archived');
  assert.equal((await taskTitles()).includes('Added directly'), false);
  await choose('Archive task: Done high'); await a.click('Confirm archive task'); assert.equal(await progress(), 17);
  await choose('Edit task: High second'); await a.ready('Save changes');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Project · optional: Polish project"]').getAttribute('aria-checked')`), 'true');
  await a.go('/projects', '17%');
  await choose('Edit project: Polish project'); await a.ready('Project tasks');
  assert.equal(await progress(), 17);
  await choose('Project status: Paused'); await a.click('Save project'); await a.ready('Paused projects');
  await choose('Edit project: Polish project'); await a.ready('Save this project as Active to add tasks.');
  assert.equal(await a.evaluate(`!!document.querySelector('[aria-label="Add task to project"]')`), false);
  console.log('PASS project add/complete/reopen/archive/cancel, ordering, immediate progress, defaults, failed save/retry, double taps, persisted links, inactive projects and mobile bounds');
  await a.go('/settings', 'Data Management');
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  await a.go('/', 'No tasks due today.'); await a.ready('No events today.');
  assert.deepEqual(errors, []);
  console.log('PASS empty Today and no runtime exceptions');
}
const watchdog = setTimeout(() => { console.error('Today/projects harness timed out'); process.exitCode = 1; for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); }, 120000);
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); });
