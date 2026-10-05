const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.TODAY_HARNESS_DIST || 'dist');
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
    else if (message.method === 'Page.javascriptDialogOpening') { console.error('Unexpected browser dialog',message.params);void send('Page.handleJavaScriptDialog',{accept:false}); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const ready = async text => { for (let i = 0; i < 100; i++) { if (await evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`)) return; await pause(100); } throw Error('Missing ' + text + ': ' + await evaluate('document.body.innerText')); };
  const click = async text => { assert.ok(await evaluate(`(() => { const el = [...document.querySelectorAll('[role=button],button,a')].find(el => el.innerText === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`), 'Button: ' + text); await pause(150); };
  const fill = async (label, value) => evaluate(`(() => { const el = [...document.querySelectorAll('input')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!el) throw Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const go = async (path, text) => { if(process.env.DEBUG_HARNESS)console.log('GO',path,text); await send('Page.navigate', { url: 'http://127.0.0.1:4199' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}
async function main() {
  await new Promise(r => server.listen(4199, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9259', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--user-data-dir=' + resolve('.test-build/today-projects-chrome-' + process.pid), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await (await fetch('http://127.0.0.1:9259/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(250); } }
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
  const project = createProject({ name: 'Polish project', notes: 'Project-only reference', sectionId: 'home', defaultTaskPoints: 3 });
  data.projects = [project];
  const task = (title, priority, dueDate = today) => createTask({ title, priority, dueDate, projectId: project.id, sectionId: 'home' });
  data.tasks = [task('Low today', 'low'), task('Normal today', 'normal'), { ...task('High today', 'high'), description: 'Compact Today context', notes: 'Private task note' }, task('High second', 'high'), task('Low overdue', 'low', addDays(today, -1)), updateTask(task('Done high', 'high'), { status: 'complete' }), task('Future', 'normal', addDays(today, 1))];
  const event = (title, startTime, source = 'personal') => createEvent({ title, date: today, startTime, source, ...(source === 'family' ? { addedBy: 'Kellyn', category: 'Family Plan' } : {}), reminderEnabled: true });
  data.calendarEvents = [event('Local afternoon', '14:00'), event('Local all day')];
  data.familyEvents = [event('Family morning', '08:00', 'family'), event('Family evening', '18:00', 'family')];
  data.lastRolloverSummary = { rolloverDate: addDays(today, -1), performedAt: new Date().toISOString(), movedTaskIds: [data.tasks[4].id] };
  const read = () => a.evaluate(`JSON.parse(localStorage.getItem('lifecommand:data:v1'))`);
  const choose = async label => {
    if(process.env.DEBUG_HARNESS)console.log('CHOOSE',label);
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
  assert.deepEqual(await taskTitles(), ['High second', 'High today', 'Normal today', 'Low overdue', 'Low today']);
  const body = await a.evaluate('document.body.innerText');
  assert.ok(await a.evaluate(`document.querySelector('[data-testid="today-tasks"]').compareDocumentPosition(document.querySelector('[data-testid="today-schedule"]')) & Node.DOCUMENT_POSITION_FOLLOWING`));
  assert.ok(body.includes('Compact Today context'));
  assert.equal(body.includes('Private task note'), false);
  for (const hidden of ['Next event', 'Rollover summary', 'Reminders', 'Reminder:', "Today's family events", 'Top priorities']) assert.equal(body.includes(hidden), false, hidden);
  const timeline = await a.evaluate(`(() => { const card = [...document.querySelectorAll('[role=heading],h1,h2,h3,h4,h5,h6')].find(el => el.innerText.startsWith('Schedule ·')).parentElement; return { events: [...card.querySelectorAll('[aria-label^="Edit "]')].map(el => el.getAttribute('aria-label')), text: card.innerText }; })()`);
  assert.deepEqual(timeline.events, ['Edit Local all day', 'Edit Family morning', 'Edit Local afternoon', 'Edit Family evening']);
  assert.ok(timeline.text.includes('All day') && timeline.text.includes('Added by Kellyn'));
  await bounds();
  await screenshot('today-polish');
  await choose('Edit task: High today'); await a.ready('Save changes');
  assert.equal(await a.evaluate(`document.querySelector('textarea[aria-label="Task description, optional"]').value`), 'Compact Today context');
  assert.equal(await a.evaluate(`document.querySelector('textarea[aria-label="Task notes, optional"]').value`), 'Private task note');
  await a.go('/', 'High today'); await choose('Complete High today');
  assert.equal((await read()).tasks.find(t => t.title === 'High today').status, 'complete');
  assert.equal((await taskTitles()).includes('High today'), false);
  console.log('PASS Today tasks first, priority order, all-day/combined timeline, attribution, hidden sections, mobile bounds and edit/complete');

  await a.evaluate(`localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify({...JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1')),showCompleted:true}))`);
  await a.go('/projects', 'Polish project'); await choose('Edit project: Polish project'); await a.ready('Project tasks');
  assert.equal(await a.evaluate(`document.querySelector('textarea[aria-label="Project notes (optional)"]').value`), 'Project-only reference');
  assert.deepEqual(await taskTitles(), ['High second', 'Normal today', 'Future', 'Low overdue', 'Low today', 'Done high', 'High today']);
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
  assert.equal((await taskTitles())[1], 'Added directly', 'Dated high-priority work precedes high-priority backlog');
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
  await choose('Project status: Paused'); await a.click('Save project'); await a.ready('Paused · 1');
  await choose('Edit project: Polish project'); await a.ready('Save this project as Active to add tasks.');
  assert.equal(await a.evaluate(`!!document.querySelector('[aria-label="Add task to project"]')`), false);
  console.log('PASS project add/complete/reopen/archive/cancel, ordering, immediate progress, defaults, failed save/retry, double taps, persisted links, inactive projects and mobile bounds');
  // A larger, mixed-section day exercises the shared row treatment and deletion lifecycle.
  const organized = createDefaultAppData();
  organized.settings.autoRollover = false;
  organized.settings.ambientDisplayEnabled = true;
  const cleanupProject = createProject({ name: 'Cleanup project', sectionId: 'home' });
  organized.projects = [cleanupProject];
  organized.tasks = Array.from({ length: 30 }, (_, i) => createTask({ title: `Scan task ${String(i).padStart(2, '0')}`, priority: ['low', 'normal', 'high'][i % 3], sectionId: i % 2 ? 'home' : 'work', dueDate: today, projectId: cleanupProject.id }));
  organized.tasks[29].title = 'Scan task 29 with a long title that wraps across several lines on a narrow phone';
  organized.tasks.push(createTask({ title: 'Backlog cleanup', sectionId: 'home', projectId: cleanupProject.id }));
  organized.tasks.push(createTask({ title: 'Future cleanup', sectionId: 'work', dueDate: addDays(today, 1), projectId: cleanupProject.id }));
  organized.tasks.push(updateTask(createTask({ title: 'Archived cleanup', sectionId: 'home', projectId: cleanupProject.id }), { status: 'archived' }));
  await a.evaluate(`localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify({...JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1')),showCompleted:false}));localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(organized, (await read()).revision + 1)))})`);
  await a.go('/', 'Scan task 00');
  const { groupTasksBySection } = require('../.test-build/src/domain/tasks.js');
  assert.deepEqual(await taskTitles(), groupTasksBySection(organized, organized.tasks.slice(0, 30)).flatMap(group => group.tasks.map(task => task.title)));
  const rowInfo = () => a.evaluate(`Array.from(document.querySelectorAll('[data-testid^="task-row-"]')).map(el => ({ text: el.innerText, color: getComputedStyle(el).borderLeftColor, edit: el.querySelector('[aria-label^="Edit task:"]').innerText }))`);
  const todayRows = await rowInfo();
  assert.equal(todayRows.length, 30);
  assert.ok(todayRows.every(row => row.text.includes('priority') && row.edit === 'Edit'));
  assert.equal(new Set(todayRows.map(row => row.color)).size, 2);
  await bounds(); await screenshot('today-section-scanability');
  await a.go('/review', 'Backlog cleanup');
  let reviewRows = await rowInfo();
  assert.equal(reviewRows.length, 2);
  assert.ok(reviewRows.every(row => row.text.includes('priority') && row.edit === 'Edit'));
  await bounds(); await screenshot('review-section-scanability');
  await a.evaluate(`localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify({...JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1')),showCompleted:true}))`);
  await a.go('/projects', 'Cleanup project'); await choose('Edit project: Cleanup project'); await a.ready('Project tasks');
  const projectRows = await rowInfo();
  assert.equal(projectRows.length, 32);
  assert.equal(projectRows.find(row => row.text.includes('Scan task 00')).color, todayRows.find(row => row.text.includes('Scan task 00')).color);
  await bounds(); await screenshot('project-section-scanability');
  await choose('Complete task: Scan task 00');
  assert.equal(await progress(), 3);
  await choose('Edit task: Scan task 00'); await a.ready('Save changes');
  let deletionRevision = (await read()).revision;
  await a.click('Delete task'); await a.ready('will be deleted.');
  await a.click('Cancel deletion'); assert.equal((await read()).revision, deletionRevision);
  await a.click('Delete task'); await bounds(); await screenshot('task-delete-confirmation');
  await a.evaluate(`window.originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'lifecommand:data:v1') throw Error('Delete write failure'); return window.originalSet.call(this,k,v); }`);
  await a.click('Confirm delete task'); await a.ready('Delete write failure');
  assert.equal((await read()).revision, deletionRevision);
  await a.evaluate('Storage.prototype.setItem = window.originalSet');
  await a.evaluate(`const remove = document.querySelector('[aria-label="Confirm delete task"]'); remove.click(); remove.click();`);
  await a.ready('Project tasks');
  assert.equal((await read()).revision, deletionRevision + 1);
  assert.equal((await read()).tasks.some(t => t.title === 'Scan task 00'), false);
  assert.equal(await progress(), 0);
  await a.go('/', 'Scan task 01'); assert.equal((await taskTitles()).includes('Scan task 00'), false);
  await a.evaluate(`const p=JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1'));p.ambient={...p.ambient,ambientDisplayEnabled:true};localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify(p))`);
  await a.go('/ambient', 'Scan task');
  assert.equal((await a.evaluate('document.body.innerText')).includes('Scan task 00'), false);
  await a.go('/review', 'Backlog cleanup'); await choose('Edit task: Backlog cleanup'); await a.ready('Save changes');
  await a.click('Delete task'); await a.click('Confirm delete task'); await a.ready('Section backlogs');
  assert.equal((await taskTitles()).includes('Backlog cleanup'), false);
  assert.equal(await a.evaluate(`document.querySelector('[aria-label="Section backlogs, Home, 0 tasks"]').getAttribute('aria-expanded')`), 'false');

  // Keep a stale task editor open while the other tab deletes its project.
  const target = await (await fetch('http://127.0.0.1:9259/json/new?about:blank', { method: 'PUT' })).json();
  const b = await connect(target);
  const linked = (await read()).tasks.find(t => t.title === 'Scan task 01');
  await b.go('/task/' + linked.id, 'Save changes');
  await a.go('/projects', 'Cleanup project'); await choose('Edit project: Cleanup project'); await a.ready('Project tasks');
  deletionRevision = (await read()).revision;
  await a.click('Delete project'); await a.ready('All linked tasks will be kept and unlinked');
  await a.click('Cancel deletion'); assert.equal((await read()).revision, deletionRevision);
  await a.click('Delete project'); await bounds(); await screenshot('project-delete-confirmation');
  await a.click('Permanently delete project'); await a.ready('No projects yet');
  let afterDelete = await read();
  assert.equal(afterDelete.revision, deletionRevision + 1);
  assert.equal(afterDelete.projects.length, 0);
  assert.equal(afterDelete.tasks.length, 31);
  assert.ok(afterDelete.tasks.every(t => !t.projectId));
  assert.equal(afterDelete.tasks.find(t => t.title === 'Archived cleanup').status, 'archived');
  await b.ready('Local data changed in another tab');
  await b.click('Save changes');
  assert.equal((await read()).revision, deletionRevision + 1, 'Stale save cannot restore project links');
  await b.click('Reload local data'); await b.ready('Save changes');
  assert.equal(await b.evaluate(`!!document.querySelector('[aria-label="Project \u00b7 optional: Cleanup project"]')`), false);
  b.ws.close();
  await a.go('/', 'Scan task 01'); assert.ok((await rowInfo()).every(row => !row.text.includes('Cleanup project')));
  await a.go('/review', 'Future cleanup'); assert.ok((await rowInfo()).every(row => !row.text.includes('Cleanup project')));
  await a.go('/projects', 'No projects yet');
  console.log('PASS 30-task section grouping, shared Today/Review/Projects rows, mobile bounds, deletion cancel/confirm, failure/retry, double taps, progress, ambient, persisted unlinking, archived tasks and stale cross-tab editor');

  // Multiple projects in every Review category; overdue tasks also appear in Rolled over.
  const grouped = createDefaultAppData();
  grouped.settings.autoRollover = false;
  const alpha = createProject({ name: 'alpha project' });
  const zulu = createProject({ name: 'Zulu project with a long name that wraps on a narrow mobile screen' });
  grouped.projects = [zulu, alpha];
  const makeGroup = (prefix, dueDate) => [
    ['Zulu high', 'high', zulu.id, 'work'],
    ['Alpha low', 'low', alpha.id, 'work'],
    ['No project high', 'high', undefined, 'work'],
    ['Alpha normal', 'normal', alpha.id, 'work'],
    ['Alpha high Z', 'high', alpha.id, 'work'],
    ['Alpha high A', 'high', alpha.id, 'work'],
    ['Home task', 'normal', undefined, 'home'],
  ].map(([title, priority, projectId, sectionId]) => createTask({ title: `${prefix} ${title}`, priority, projectId, sectionId, dueDate }));
  grouped.tasks = [
    ...makeGroup('Missed', addDays(today, -1)).map(task => ({ ...task, rolloverCount: 1 })),
    ...makeGroup('Backlog', undefined),
    ...makeGroup('Future', addDays(today, 1)),
  ];
  await a.evaluate(`localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify({...JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1')),showCompleted:false}));localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(grouped, (await read()).revision + 1)))})`);
  const expected = prefix => ['Alpha high A', 'Alpha high Z', 'Alpha normal', 'Alpha low', 'Zulu high', 'No project high', 'Home task'].map(title => `${prefix} ${title}`);
  const listTitles = category => a.evaluate(`Array.from(document.querySelector('[data-testid="task-list-${category}"]').querySelectorAll('[aria-label^="Edit task:"]')).map(el => el.getAttribute('aria-label').slice(11))`);
  const expanded = label => a.evaluate(`document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}).getAttribute('aria-expanded')`);
  const tab = async (path, ready) => {
    assert.ok(await a.evaluate(`(() => { const el = document.querySelector('a[href="${path}"]'); if (!el) return false; el.click(); return true; })()`));
    await a.ready(ready);
  };
  await a.go('/', 'Missed Alpha high A');
  assert.deepEqual(await listTitles('Today'), expected('Missed'));
  assert.equal(await expanded('Today, Work, 6 tasks'), 'true');
  assert.deepEqual(await a.evaluate(`Array.from(document.querySelector('[data-testid="task-section-work"]').querySelectorAll('[role=heading]')).map(el => el.innerText)`), [`${alpha.name} · 4`, `${zulu.name} · 1`, 'Other tasks · 1']);
  await bounds(); await screenshot('today-project-groups');
  await choose('Today, Work, 6 tasks');
  assert.equal(await expanded('Today, Work, 6 tasks'), 'false');
  assert.deepEqual(await listTitles('Today'), ['Missed Home task']);
  assert.equal(await a.evaluate(`document.querySelector('[data-testid="task-section-work"]').querySelectorAll('[role=heading]').length`), 0);
  // Enter activates the focused web button and reveals its tasks again.
  await a.send('Page.bringToFront');
  await a.evaluate(`document.querySelector('[aria-label="Today, Work, 6 tasks"]').focus()`);
  assert.equal(await a.evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Today, Work, 6 tasks', await a.evaluate(`document.querySelector('[aria-label="Today, Work, 6 tasks"]').outerHTML`));
  await a.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
  await a.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await a.ready('Missed Alpha high A');
  assert.deepEqual(await listTitles('Today'), expected('Missed'));
  await choose('Complete Missed Alpha high A');
  assert.equal(await expanded('Today, Work, 5 tasks'), 'true');
  await choose('Today, Work, 5 tasks');
  await tab('/review', 'Section backlogs');
  const missedRemaining = expected('Missed').filter(title => title !== 'Missed Alpha high A');
  for (const [category, prefix] of [['Overdue', 'Missed'], ['Rolled over', 'Missed'], ['Section backlogs', 'Backlog'], ['Scheduled later', 'Future']]) {
    const titles = prefix === 'Missed' ? missedRemaining : expected(prefix);
    assert.deepEqual(await listTitles(category), titles);
    const label = `${category}, Work, ${titles.length - 1} tasks`;
    assert.equal(await expanded(label), 'true', 'Today collapse must not affect Review');
    const alphaCount = prefix === 'Missed' ? 3 : 4;
    const alphaLabel = `${category}, Work, alpha project, ${alphaCount} tasks`;
    const zuluLabel = `${category}, Work, ${zulu.name}, 1 task`;
    const noProjectLabel = `${category}, Work, Other tasks, 1 task`;
    assert.equal(await expanded(alphaLabel), 'true', 'Review project groups start expanded');
    assert.equal(await expanded(zuluLabel), 'true', 'Review project groups start expanded');
    assert.equal(await expanded(noProjectLabel), 'true', 'Unlinked Review groups start expanded');
    await choose(alphaLabel);
    assert.equal(await expanded(alphaLabel), 'false');
    assert.deepEqual(await listTitles(category), titles.filter(title => !title.includes('Alpha')));
    await choose(label);
    await choose(label);
    assert.equal(await expanded(alphaLabel), 'false', 'Project collapse state survives section collapse and reopen');
    assert.deepEqual(await listTitles(category), titles.filter(title => !title.includes('Alpha')));
    await choose(alphaLabel);
    assert.deepEqual(await listTitles(category), titles);
    await choose(label);
    assert.equal(await expanded(label), 'false');
    assert.deepEqual(await listTitles(category), [`${prefix} Home task`]);
    if (category === 'Overdue') assert.deepEqual(await listTitles('Rolled over'), missedRemaining, 'Same section is independent across Review categories');
    await choose(label);
    assert.deepEqual(await listTitles(category), titles);
  }
  assert.equal(await expanded('Section backlogs, Army, 0 tasks'), 'false');
  await tab('/', 'Missed Home task');
  assert.equal(await expanded('Today, Work, 5 tasks'), 'false', 'Today retains its own state when switching tabs');
  await tab('/review', 'Section backlogs');
  await bounds(); await screenshot('review-project-groups');
  await choose('Scheduled later, Work, 6 tasks');
  await choose('Schedule: Backlog Alpha high A'); await a.click('Tomorrow');
  assert.equal(await expanded('Section backlogs, Work, 5 tasks'), 'true');
  assert.equal(await expanded('Scheduled later, Work, 7 tasks'), 'false', 'Count updates while collapsed');
  assert.deepEqual(await listTitles('Scheduled later'), ['Future Home task']);
  await choose('Scheduled later, Work, 7 tasks');
  assert.ok((await listTitles('Scheduled later')).includes('Backlog Alpha high A'));
  await choose('Edit task: Backlog Alpha high Z'); await a.ready('Save changes');
  await a.click('Delete task'); await a.click('Confirm delete task'); await a.ready('Section backlogs');
  assert.equal(await expanded('Section backlogs, Work, 4 tasks'), 'true');
  assert.equal((await listTitles('Section backlogs')).includes('Backlog Alpha high Z'), false);
  await choose('Overdue, Work, 5 tasks');
  await a.go('/review', 'Overdue');
  for(let i=0;i<100 && await expanded('Overdue, Work, 5 tasks')!=='false';i++) await pause(100);
  assert.equal(await expanded('Overdue, Work, 5 tasks'), 'false', 'Reload preserves collapsed section state');
  console.log('PASS section/project/priority ordering, No project last, Today and all Review category collapse/expand, keyboard activation, independent categories/screens, live completion/deletion/scheduling counts, collapsed count updates, persistent collapse and narrow layouts');

  // Project status groups sort by exactly the percentage rendered on each card.
  const projectsData = createDefaultAppData();
  projectsData.settings.autoRollover = false;
  const weighted = createProject({ name: 'Weighted project with a long name that wraps across a narrow mobile screen', useWeightedProgress: true });
  const simple = createProject({ name: 'alpha simple' });
  const tied = createProject({ name: 'Zulu simple' });
  const paused = createProject({ name: 'Paused project', status: 'paused' });
  const completed = createProject({ name: 'Complete project', status: 'complete' });
  const archived = createProject({ name: 'Archived project', status: 'archived' });
  const off = createProject({ name: 'A tracking disabled', trackCompletion: false });
  const zero = createProject({ name: 'Zero tasks' });
  projectsData.projects = [off, archived, completed, paused, zero, tied, simple, weighted];
  projectsData.tasks = [weighted, simple, tied, paused, completed, archived, off].flatMap(p => [
    updateTask(createTask({ title: `${p.name} done`, projectId: p.id, sectionId: 'home', storyPoints: 9 }), { status: 'complete' }),
    createTask({ title: `${p.name} pending`, projectId: p.id, sectionId: 'home', storyPoints: 1 }),
  ]);
  await a.evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(projectsData, (await read()).revision + 1)))})`);
  const projectGroups = () => a.evaluate(`Array.from(document.querySelectorAll('[data-testid^="project-status-"]')).map(group => ({
    status: group.getAttribute('data-testid').slice(15),
    heading: group.querySelector('[role=heading]').innerText,
    names: Array.from(group.querySelectorAll('[aria-label^="Edit project:"]')).map(el => el.getAttribute('aria-label').slice(14)),
    values: Array.from(group.querySelectorAll('[role=progressbar]')).map(el => Number(el.getAttribute('aria-valuenow')))
  }))`);
  const toggleStatus = async status => { await a.evaluate(`document.querySelector('[data-testid="project-status-${status}"] [aria-expanded]').click()`); await pause(150); };
  await a.go('/projects', 'Active · 5');
  assert.deepEqual(await projectGroups(), [
    { status: 'active', heading: 'Active · 5', names: [weighted.name, simple.name, tied.name, zero.name, off.name], values: [90, 50, 50, 0] },
    { status: 'paused', heading: 'Paused · 1', names: [paused.name], values: [50] },
    { status: 'complete', heading: 'Complete · 1', names: [completed.name], values: [50] },
  ]);
  await a.ready('1 of 2 tasks · 9/10 story points'); await a.ready('Completion tracking is off.');
  assert.equal(await a.evaluate(`Array.from(document.querySelectorAll('[data-testid^="project-status-"] [aria-expanded]')).every(button => button.getAttribute('aria-expanded') === 'true')`), true, 'Visible status groups start expanded');
  await bounds(); await screenshot('project-status-progress-groups');
  await toggleStatus('active');
  assert.equal(await a.evaluate(`document.querySelector('[data-testid="project-status-active"] [role=button]').getAttribute('aria-expanded')`), 'false');
  assert.deepEqual((await projectGroups())[0].names, []);
  assert.equal((await projectGroups())[1].names[0], paused.name, 'Collapsing Active leaves Paused visible');
  await toggleStatus('active');
  assert.deepEqual((await projectGroups())[0].names, [weighted.name, simple.name, tied.name, zero.name, off.name]);
  await a.click('Show archived projects (1)');
  assert.deepEqual((await projectGroups())[3], { status: 'archived', heading: 'Archived · 1', names: [archived.name], values: [50] });
  await toggleStatus('archived');
  assert.deepEqual((await projectGroups())[3].names, []);
  await a.click('Hide archived projects (1)'); assert.equal((await projectGroups()).length, 3);
  await a.click('Show archived projects (1)');
  assert.equal(await a.evaluate(`document.querySelector('[data-testid="project-status-archived"] [role=button]').getAttribute('aria-expanded')`), 'false', 'Archive visibility retains its collapse state');
  await choose(`Edit project: ${weighted.name}`); await a.ready('Project tasks');
  await choose(`Complete task: ${weighted.name} pending`); assert.equal(await progress(), 100);
  await a.click('Save project'); await a.ready('Active · 5');
  assert.equal((await projectGroups())[0].values[0], 100);
  await choose(`Edit project: ${weighted.name}`); await a.ready('Project tasks');
  await a.click('Archive project'); await a.ready('Active · 4');
  assert.equal((await projectGroups())[0].names.includes(weighted.name), false);
  await toggleStatus('archived');
  assert.deepEqual((await projectGroups())[3], { status: 'archived', heading: 'Archived · 2', names: [weighted.name, archived.name], values: [100, 50] });
  await choose(`Edit project: ${weighted.name}`); await a.ready('Unarchive project');
  await a.click('Unarchive project'); await a.ready('Active · 5');
  assert.equal((await projectGroups())[0].names[0], weighted.name);
  await choose(`Edit project: ${paused.name}`); await a.ready('Delete project');
  await a.click('Delete project'); await a.click('Permanently delete project'); await a.ready('Active · 5');
  assert.equal((await projectGroups()).some(group => group.status === 'paused'), false);
  await a.go('/projects', 'Active · 5');
  assert.deepEqual((await projectGroups()).map(group => group.status), ['active', 'complete'], 'Reload hides archived projects');
  console.log('PASS Projects status/count headers, descending displayed weighted/simple progress, alphabetical ties, tracking disabled last, empty groups, archive visibility/reload, task completion, archive/unarchive/delete regrouping and narrow layouts');
  await a.go('/settings', 'Data Management');
  await a.click('Start Fresh'); await a.click('Delete local data and start fresh'); await a.ready('Start Fresh complete.');
  await a.go('/', 'No tasks due today.'); await a.ready('No events today.');
  await a.go('/projects', 'No projects yet'); assert.deepEqual(await projectGroups(), []);
  assert.deepEqual(errors, []);
  console.log('PASS empty Today and no runtime exceptions');
}
const watchdog = setTimeout(() => { console.error('Today/projects harness timed out'); process.exitCode = 1; for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); }, 120000);
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { clearTimeout(watchdog); for (const c of clients) c.ws.close(); chrome?.kill(); server.close(); });
