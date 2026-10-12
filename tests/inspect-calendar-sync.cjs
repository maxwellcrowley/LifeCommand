const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.CALENDAR_HARNESS_DIST || '.test-build/calendar-dist');
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
  const fill = async (label, value) => evaluate(`(() => { const el = [...document.querySelectorAll('input,textarea')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) throw Error('Missing input'); Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4187' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); console.log('PASS headless browser connected'); return client;
}
async function main() {
  console.log('Starting isolated headless browser harness');
  await new Promise(r => server.listen(4187, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9237', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', '--in-process-gpu', '--disable-features=Vulkan', '--user-data-dir=' + resolve('.test-build/calendar-sync-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9237/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
  assert.ok(targets, 'Chrome DevTools reachable');
  console.log('PASS browser DevTools reachable');
  const a = await connect(targets.find(t => t.type === 'page'));
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { createTask } = require('../.test-build/src/domain/tasks.js');
  const { createProject } = require('../.test-build/src/domain/projects.js');
  const { createEvent } = require('../.test-build/src/domain/events.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { localDateKey, addDays } = require('../.test-build/src/domain/dates.js');
  const { EXTERNAL_CALENDAR_KEY } = require('../.test-build/src/domain/externalCalendars.js');
  const today = localDateKey(new Date());
  const chosenDay = addDays(today, 5);
  const data = createDefaultAppData();
  data.settings.autoRollover = false;
  data.settings.ambientDisplayEnabled = true;
  const project = createProject({ name: 'Scheduling project', sectionId: 'home', defaultTaskPoints: 3 });
  const alphaProject = createProject({ name: 'Alpha calendar', sectionId: 'work' });
  const zuluProject = createProject({ name: 'Zulu calendar', sectionId: 'work' });
  data.projects = [project, alphaProject, zuluProject];
  data.tasks = ['Today one', 'Today two', 'Project quick', 'Review quick'].map(title => createTask({ title, sectionId: 'home', projectId: project.id, priority: 'high', storyPoints: 5, description: 'Preserve notes', notes: 'Private task note', owner: 'shared' }));
  data.tasks.push(
    createTask({ title: 'Day one', sectionId: 'work', projectId: alphaProject.id, priority: 'low', storyPoints: 5, description: 'Preserve notes', notes: 'Private task note', owner: 'shared' }),
    createTask({ title: 'Day two', sectionId: 'work', projectId: zuluProject.id, priority: 'high', storyPoints: 5, description: 'Preserve notes', notes: 'Private task note', owner: 'shared' }),
    createTask({ title: 'Calendar alpha high', sectionId: 'work', projectId: alphaProject.id, priority: 'high', dueDate: chosenDay, description: 'Calendar description', notes: 'Calendar private note' }),
    createTask({ title: 'Calendar work general', sectionId: 'work', priority: 'normal', dueDate: chosenDay, description: 'General calendar description', notes: 'General private note' }),
  );
  data.calendarEvents = [createEvent({ title: 'Local afternoon', date: today, startTime: '14:00', source: 'personal' })];
  data.familyEvents = [createEvent({ title: 'Family morning', date: today, startTime: '08:00', source: 'family', addedBy: 'Kellyn', category: 'School' })];
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem('lifecommand:data:v1'))`);
  const readCache = () => a.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(EXTERNAL_CALENDAR_KEY)}))`);
  const choose = async label => {
    assert.ok(await a.evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) return false; el.click(); return true; })()`), label);
    await pause(180);
  };
  const body = () => a.evaluate('document.body.innerText');
  const bounds = async () => {
    for (const [width, height] of [[320,568], [390,844], [844,390]]) {
      await a.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await pause(100);
      assert.deepEqual(await a.evaluate(`Array.from(document.querySelectorAll('input:not([type=checkbox]),textarea,[role=button],[role=checkbox]')).filter(el => { const r=el.getBoundingClientRect(); return r.width>0 && (r.left < -1 || r.right > innerWidth+1 || r.height < 44); }).map(el => el.getAttribute('aria-label') || el.innerText)`), []);
    }
  };
  await a.go('/settings', 'Calendar Connections');
  console.log('PASS test app loaded');
  await a.evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('lifecommand:')).forEach(k=>localStorage.removeItem(k)); localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))})`);
  await a.go('/', 'Family morning');
  await choose(`Add from backlog · ${today}`);
  await a.ready('Add backlog tasks to');
  await choose('Select backlog task: Today one');
  const todayProject = 'Home, Scheduling project: 4 available, 1 selected';
  await choose(todayProject); assert.equal(await a.evaluate(`document.querySelector('[aria-label=${JSON.stringify(todayProject)}]')?.getAttribute('aria-expanded')`), 'false');
  await choose(todayProject); assert.equal(await a.evaluate(`document.querySelector('[aria-label="Select backlog task: Today one"]')?.getAttribute('aria-checked')`), 'true');
  await a.fill('Filter backlog tasks', 'Today two'); await a.ready('Today two');
  assert.ok((await body()).includes('1 selected'));
  await a.fill('Filter backlog tasks', ''); await a.ready('Today one');
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Select backlog task: Today one"]')?.getAttribute('aria-checked')`), 'true');
  await choose('Select backlog task: Today two');
  await bounds();
  await a.evaluate(`window.originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'lifecommand:data:v1') throw Error('Bulk write failure'); return window.originalSet.call(this,k,v); }`);
  await a.click('Add'); await a.ready('Bulk write failure');
  assert.ok((await read()).tasks.filter(task => ['Today one', 'Today two'].includes(task.title)).every(task => !task.dueDate));
  await a.evaluate('Storage.prototype.setItem = window.originalSet');
  const revision = (await read()).revision;
  await a.click('Retry Add');
  await a.ready("Today's tasks · 2");
  let saved = await read(); assert.equal(saved.revision, revision + 1);
  for (const title of ['Today one', 'Today two']) {
    const task = saved.tasks.find(task => task.title === title);
    assert.deepEqual([task.dueDate, task.projectId, task.sectionId, task.priority, task.storyPoints, task.description, task.notes, task.status], [today, project.id, 'home', 'high', 5, 'Preserve notes', 'Private task note', 'scheduled']);
  }
  await a.go('/calendar', 'Events and scheduled tasks');
  await a.fill('Date, required, YYYY-MM-DD', chosenDay); await choose('Add from backlog · ' + chosenDay);
  await choose('Select backlog task: Day one'); await choose('Select backlog task: Day two');
  await a.click('Add'); await a.ready('Day one');
  await a.go('/calendar', 'Events and scheduled tasks');
  await a.fill('Date, required, YYYY-MM-DD', chosenDay); await a.ready('Day two');
  assert.equal((await read()).tasks.find(task => task.title === 'Day two').dueDate, chosenDay);
  const calendarSection = `Calendar tasks ${chosenDay}, Work, 4 tasks`;
  assert.equal(await a.evaluate(`document.querySelector('[aria-label=${JSON.stringify(calendarSection)}]')?.getAttribute('aria-expanded')`), 'true');
  assert.deepEqual(await a.evaluate(`Array.from(document.querySelectorAll('[data-testid^="task-project-group-Calendar tasks ${chosenDay}-work-"]')).map(el => el.getAttribute('data-testid'))`), [
    `task-project-group-Calendar tasks ${chosenDay}-work-${alphaProject.id}`,
    `task-project-group-Calendar tasks ${chosenDay}-work-${zuluProject.id}`,
    `task-project-group-Calendar tasks ${chosenDay}-work-no-project`,
  ]);
  assert.ok((await body()).indexOf('Calendar alpha high') < (await body()).indexOf('Day one'), 'Calendar project tasks sort high-to-low');
  assert.ok((await body()).includes('Calendar description'));
  assert.ok(!(await body()).includes('Calendar private note'));
  await choose(calendarSection); await a.ready('Scheduled tasks | 4');
  assert.ok(!(await body()).includes('Calendar alpha high'));
  await choose(calendarSection); await a.ready('Calendar alpha high');
  console.log('PASS Today/Calendar multi-select, atomic save failure/retry, metadata preservation and reload');

  await a.go('/projects', 'Scheduling project'); await choose('Edit project: Scheduling project'); await a.ready('Project tasks');
  await choose('Schedule: Project quick'); await a.click('Today');
  assert.equal((await read()).tasks.find(task => task.title === 'Project quick').dueDate, today);
  assert.ok((await body()).includes('Project tasks')); assert.ok(!(await body()).includes('Save changes'));
  await choose('Schedule: Project quick'); await a.click('Tomorrow');
  assert.equal((await read()).tasks.find(task => task.title === 'Project quick').dueDate, addDays(today, 1));
  await choose('Schedule: Project quick'); await a.click('Pick date');
  await a.fill('Due date, YYYY-MM-DD', chosenDay); await a.click('Save date');
  assert.equal((await read()).tasks.find(task => task.title === 'Project quick').dueDate, chosenDay);
  await choose('Schedule: Project quick'); await a.click('Clear date / Backlog');
  assert.equal((await read()).tasks.find(task => task.title === 'Project quick').dueDate, undefined);
  await bounds();
  await a.go('/review', 'Section backlogs');
  await choose('Schedule: Review quick'); await a.click('Tomorrow');
  assert.equal((await read()).tasks.find(task => task.title === 'Review quick').dueDate, addDays(today, 1));
  await choose('Schedule: Review quick'); await a.click('Pick date');
  await a.fill('Due date, YYYY-MM-DD', chosenDay); await a.click('Save date');
  assert.equal((await read()).tasks.find(task => task.title === 'Review quick').dueDate, chosenDay);
  await choose('Schedule: Review quick'); await a.click('Clear date / Backlog');
  assert.equal((await read()).tasks.find(task => task.title === 'Review quick').status, 'backlog');
  await choose('Schedule: Review quick'); await a.click('Today');
  assert.equal((await read()).tasks.find(task => task.title === 'Review quick').dueDate, today);
  console.log('PASS Projects/Review Today, Tomorrow, Pick date and Clear date without task editor');

  await a.go('/settings', 'Calendar Connections');
  const connectionText = await body();
  assert.ok(connectionText.includes('External events are read-only in LifeCommand'));
  const manualEnabled = await a.evaluate(`!!document.querySelector('[aria-label="Connect manual test calendar"]')`);
  if (manualEnabled) {
  await a.click('Connect manual test calendar'); await a.ready('Connected · manual test provider');
  await a.click('Sync now'); await a.ready('Last synced:');
  let cache = await readCache(); assert.equal(cache.events.length, 1);
  await a.click('Sync now'); assert.equal((await readCache()).events.length, 1);
  await bounds();
  await a.go('/', 'Demo imported meeting');
  const text = await body();
  assert.ok(text.indexOf('Family morning') < text.indexOf('Demo imported meeting') && text.indexOf('Demo imported meeting') < text.indexOf('Local afternoon'));
  assert.equal(await a.evaluate(`!!document.querySelector('[aria-label="Edit Demo imported meeting"]')`), false);
  assert.ok(text.includes('read-only') && text.includes('Demo calendar (manual)'));
  await choose('Hide event: Demo imported meeting');
  assert.ok(!(await body()).includes('Demo imported meeting'));
  await a.go('/settings','Calendar Connections');await a.click('Sync now');
  await a.go('/','Local afternoon');assert.ok(!(await body()).includes('Demo imported meeting'));
  await a.go('/calendar', 'Events and scheduled tasks');
  console.log('PASS calendar route loaded for hidden-event interaction');
  await a.click('Show hidden events (1)'); await a.ready('Unhide all hidden events');
  await choose('Unhide event: Demo imported meeting'); await a.ready('Unhide event?');
  await choose('Confirm unhide event'); await a.ready('Demo imported meeting');
  assert.ok(!(await body()).includes('Hidden from Today, Calendar, and Ambient'));
  cache = await readCache(); assert.ok(!cache.hiddenEventIds?.includes(cache.events[0].id));
  await a.go('/', 'Demo imported meeting'); await a.go('/calendar', 'Demo imported meeting');
  assert.ok(!(await body()).includes('Hidden from Today, Calendar, and Ambient'));
  assert.equal((await readCache()).accounts.length,1);
  await a.go('/settings','Calendar Connections');await a.click('Sync now');
  await a.go('/calendar', 'Demo imported meeting');
  await a.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
  await a.go('/ambient', 'Demo imported meeting');
  assert.ok((await body()).includes('read-only'));
  await a.go('/settings', 'Calendar Connections');
  await choose('Import calendar: Demo calendar (manual)');
  await a.go('/', 'Local afternoon'); assert.ok(!(await body()).includes('Demo imported meeting'));
  await a.go('/calendar', 'Local afternoon'); assert.ok(!(await body()).includes('Demo imported meeting'));
  await a.go('/ambient', 'Local afternoon'); assert.ok(!(await body()).includes('Demo imported meeting'));
  await a.go('/settings', 'Calendar Connections'); await choose('Import calendar: Demo calendar (manual)');
  await a.click('Sync now');
  const edited = [{ calendar: { id: 'manual-primary', name: 'Demo calendar (manual)' }, events: [{ id: 'demo-meeting', summary: 'Updated imported meeting', start: { dateTime: new Date(`${today}T10:00:00`).toISOString() }, end: { dateTime: new Date(`${today}T11:00:00`).toISOString() } }] }];
  await a.fill('Manual calendar snapshot JSON', JSON.stringify(edited)); await a.click('Sync now');
  assert.equal((await readCache()).events[0].title, 'Updated imported meeting');
  const beforeFailure = await readCache();
  await a.fill('Manual calendar snapshot JSON', '{broken'); await a.click('Sync now'); await a.ready('Enter a valid manual');
  assert.deepEqual(await readCache(), beforeFailure);
  edited[0].events = [{ id: 'demo-meeting', status: 'cancelled' }];
  await a.fill('Manual calendar snapshot JSON', JSON.stringify(edited)); await a.click('Sync now');
  assert.equal((await readCache()).events.length, 0);
  await a.click('Load sample snapshot'); await a.click('Sync now');
  await a.fill('Manual calendar snapshot JSON', '[]'); await a.click('Sync now');
  assert.equal((await readCache()).events.length, 0);
  await a.click('Load sample snapshot'); await a.click('Sync now'); await a.click('Disconnect account');
  assert.equal((await readCache()).accounts.length, 0);
  saved = await read();
  assert.deepEqual(saved.calendarEvents.map(event => event.title), ['Local afternoon']);
  assert.deepEqual(saved.familyEvents.map(event => event.title), ['Family morning']);
  assert.equal(saved.tasks.length, data.tasks.length);
  console.log('PASS manual connection, import/dedupe/update/cancel/delete, toggles, errors, persistence and source labels in Today/Calendar/Ambient');
  } else console.log('SKIP manual provider assertions: the current web bundle has it disabled.');
  if (manualEnabled) { await a.click('Connect manual test calendar'); await a.click('Sync now'); }
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  assert.equal(await readCache(), null);
  await a.go('/', 'No events today.'); await a.ready('No tasks due today.');
  assert.deepEqual(errors, []);
  console.log('PASS Start Fresh clears imported data and all screens have no runtime exceptions');
}
const watchdog = setTimeout(() => { console.error('Calendar sync harness timed out'); process.exitCode = 1; for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); }, 120000);
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); });
