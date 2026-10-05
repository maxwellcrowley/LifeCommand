const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.POLISH_DIST || '.test-build/polish-final');
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
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4207' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}

async function main() {
  await new Promise(r => server.listen(4207, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9267', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--disable-background-networking', '--user-data-dir=' + resolve('.test-build/polish-chrome-' + process.pid), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80; i++) { try { targets = await (await fetch('http://127.0.0.1:9267/json', { signal: AbortSignal.timeout(1000) })).json(); break; } catch { await pause(100); } }
  assert.ok(targets, 'Headless Chrome ready');
  const a = await connect(targets.find(t => t.type === 'page'));
  const label = async text => { for(let i=0;i<100;i++){const clicked=await a.evaluate(`(() => { const e=[...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(text)}); if(!e||e.disabled||e.getAttribute('aria-disabled')==='true')return false; e.click();return true; })()`);if(clicked){await pause(150);return;}await pause(50);}throw Error('Missing enabled action: '+text); };
  const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
  const { createTask } = require('../.test-build/src/domain/tasks.js');
  const { createProject } = require('../.test-build/src/domain/projects.js');
  const { createEvent } = require('../.test-build/src/domain/events.js');
  const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
  const { localDateKey } = require('../.test-build/src/domain/dates.js');
  const data = createDefaultAppData(), today = localDateKey(new Date());
  data.settings.autoRollover = false; data.onboardingComplete = true;
  const project = createProject({ name: 'Household plans and appointments', sectionId: 'home' }); data.projects = [project];
  data.tasks = Array.from({ length: 30 }, (_, i) => ({ ...createTask({ title: `Today ${String(i).padStart(2, '0')} ${i === 0 ? '— a long task title that must wrap without hiding any actions' : 'daily planning task'}`, description: i === 0 ? 'A useful description with longer context that remains available in the editor.' : undefined, notes: 'Private editor notes', sectionId: i % 2 ? 'work' : 'home', dueDate: today, projectId: i % 3 ? project.id : undefined, priority: ['high', 'normal', 'low'][i % 3] }), id: 'synthetic-' + i }));
  data.tasks.push(...Array.from({ length: 1000 }, (_, i) => createTask({ title: `Backlog fixture ${i}`, sectionId: 'home' })));
  data.calendarEvents = [createEvent({ title: 'All-day household plan', date: today, source: 'personal' }), createEvent({ title: 'Morning appointment', date: today, source: 'work', startTime: '08:00', endTime: '09:00' }), createEvent({ title: 'Overlapping appointment', date: today, source: 'personal', startTime: '08:30', endTime: '10:00' }), createEvent({ title: 'Evening appointment', date: today, source: 'personal', startTime: '23:00', endTime: '23:30' })];
  const before = process.env.POLISH_BEFORE === '1';
  const prefix = before ? 'polish-before' : 'polish-after';
  const injection = `
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => { const url = String(input); if (/^https?:/.test(url) && !url.startsWith(location.origin)) return Promise.reject(Error('External provider blocked by synthetic QA')); return originalFetch(input, options); };
    if (!sessionStorage.getItem('fixture-ready')) { localStorage.clear(); localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 40)))}); sessionStorage.setItem('fixture-ready','true'); }
  `;
  await a.send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
  const start = Date.now(); await a.go('/', "Today's tasks"); await a.ready(data.tasks[0].title);
  console.log('startup with 1030 tasks ms:', Date.now() - start);
  const shot = async name => { const r = await a.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve('.test-build/' + prefix + '-' + name + '.png'), Buffer.from(r.data, 'base64')); };
  const metric = async (width, height) => { await a.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); await pause(200); };
  for (const [name, width, height] of [['small-phone',320,740],['phone',390,844],['tablet',820,1180],['desktop',1440,1000]]) {
    await metric(width,height); assert.ok(await a.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), name + ' horizontal overflow');
    await shot(name);
    if (!before) {
      const panes = await a.evaluate(`['today-tasks','today-schedule'].map(id=>{const r=document.querySelector('[data-testid="'+id+'"]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};})`);
      if (width === 1440) assert.ok(Math.abs(panes[0].y - panes[1].y) < 2 && panes[1].x > panes[0].x);
      else assert.ok(panes[1].y > panes[0].y);
    }
  }
  if (before) return;
  await metric(390,844);
  await label('Jump to schedule');
  assert.ok(await a.evaluate(`document.querySelector('[data-testid="today-schedule"]').getBoundingClientRect().top < 180`), 'schedule jump');
  await shot('phone-schedule');
  await label('Jump to tasks');
  const scrolling = await a.evaluate(`(async()=>{const el=[...document.querySelectorAll('div')].find(e=>e.scrollHeight>e.clientHeight+300&&getComputedStyle(e).overflowY==='auto');if(!el)throw Error('No scrolling surface');const prior=el.scrollTop,times=[];let last=performance.now();for(let i=0;i<40;i++){await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-last);last=now;el.scrollTop+=30;}el.scrollTop=prior;times.sort((a,b)=>a-b);return {medianFrameMs:times[20],p95FrameMs:times[38]};})()`);
  console.log('30-task scrolling frame intervals:',JSON.stringify(scrolling));
  await a.evaluate(`([...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify('Edit task: '+data.tasks[0].title)})).scrollIntoView({block:'center'})`);
  const scrollPosition = () => a.evaluate(`Math.max(...[...document.querySelectorAll('div')].map(e=>e.scrollTop))`);
  const priorScroll = await scrollPosition();
  await label('Edit task: ' + data.tasks[0].title); await a.ready('Save changes'); await label('Cancel'); await a.ready("Today's tasks");
  assert.ok(Math.abs(await scrollPosition() - priorScroll) < 100, 'editor Cancel preserves scroll');
  await label('Complete ' + data.tasks[0].title); await a.ready('Saved in Completed today.');
  assert.ok((await a.evaluate('document.body.innerText')).includes('29 tasks remaining'));
  await label('Completed today, 1'); await label('Reopen ' + data.tasks[0].title); await a.ready('Reopened in today’s tasks.');
  assert.ok((await a.evaluate('document.body.innerText')).includes('30 tasks remaining'));
  assert.ok(!(await a.evaluate('document.body.innerText')).includes('Private editor notes'));
  await label('Add task'); await a.ready('Save task');
  assert.equal(await a.evaluate(`document.querySelector('input[aria-label="Due date, YYYY-MM-DD"]')?.value ?? [...document.querySelectorAll('input')].find(e=>e.value===${JSON.stringify(today)})?.value`), today);
  await a.fill('Task title, required', 'Synthetic capture failure and retry');
  await a.evaluate(`window.originalSet=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k==='lifecommand:data:v1')throw Error('Synthetic disk full'); return window.originalSet.call(this,k,v);}`);
  await a.click('Save task'); await a.ready('Synthetic disk full');
  assert.equal(await a.evaluate(`document.querySelector('input[aria-label="Task title, required"]').value`), 'Synthetic capture failure and retry');
  await a.evaluate('Storage.prototype.setItem=window.originalSet'); await a.click('Save task'); await a.ready("Today's tasks"); await a.ready('Synthetic capture failure and retry');
  // Display settings, dark mode and extra-large text remain independent of records.
  await a.go('/settings', 'This device'); await label('appearance: dark'); await label('textSize: extra-large');
  await a.go('/', data.tasks[0].title); await metric(320,740);
  assert.equal(await a.evaluate(`JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1')).appearance`),'dark');
  assert.ok(await a.evaluate(`[...document.querySelectorAll('div')].some(e=>getComputedStyle(e).backgroundColor==='rgb(17, 25, 29)')`),'dark palette rendered');
  assert.ok(await a.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')); await shot('dark-large-text');
  const ax = await a.send('Accessibility.getFullAXTree');
  assert.ok(ax.nodes.some(n => n.role?.value === 'checkbox' && n.name?.value === 'Complete ' + data.tasks[0].title));
  assert.ok(ax.nodes.some(n => n.role?.value === 'button' && n.name?.value === 'Jump to schedule'));
  // One failed initial read must neither seed defaults nor strand future saves.
  await a.send('Page.addScriptToEvaluateOnNewDocument', { source: `if(!sessionStorage.getItem('failed-hydration')) {const get=Storage.prototype.getItem; Storage.prototype.getItem=function(key){ if(key==='lifecommand:data:v1'&&!sessionStorage.getItem('failed-hydration')){sessionStorage.setItem('failed-hydration','true');throw Error('Synthetic hydration failure');}return get.call(this,key);};}` });
  await a.go('/', 'Synthetic hydration failure'); await a.click('Retry local data'); await a.ready("Today's tasks"); await a.ready(data.tasks[0].title);
  await label('Complete ' + data.tasks[0].title); await a.ready('Saved in Completed today.');
  const begin = Date.now(); await label('Search and saved views'); await a.ready('Saved views'); await a.fill('Search tasks, projects and events','fixture 999'); await a.ready('Backlog fixture 999'); console.log('search navigation and input ms:',Date.now()-begin);
  const cal = Date.now(); await a.go('/calendar','Calendar'); await a.ready('Morning appointment'); console.log('calendar navigation ms:',Date.now()-cal);
  await a.go('/settings','This device'); await label('textSize: standard');
  const savedBeforeReset = await a.evaluate(`localStorage.getItem('lifecommand:data:v1')`);
  await label('Hide Today section Home'); await label('Hide Today calendar'); await label('Reset Today layout');
  assert.equal(await a.evaluate(`localStorage.getItem('lifecommand:data:v1')`),savedBeforeReset,'layout reset preserves saved records');
  for (const [width,height] of [[390,844],[820,1180],[1440,1000]]) {
    await metric(width,height); await a.go('/',data.tasks[1].title); await shot('dark-'+width);
    assert.ok(await a.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));
  }
  await a.go('/settings','Ambient device profile'); await label('Ambient profile tv'); await label('Hide sensitive titles in ambient display');
  await label('Enable ambient display'); await metric(1920,1080); await a.go('/ambient','Private item'); await shot('ambient-1920');
  assert.ok(!(await a.evaluate('document.body.innerText')).includes(data.tasks[1].title));
  await a.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  // Advance the app's existing clock through midnight without editing stored dates.
  await a.send('Page.addScriptToEvaluateOnNewDocument',{source:`const Clock=Date;window.__clockOffset=0;window.Date=class extends Clock{constructor(...args){super(...(args.length?args:[Clock.now()+window.__clockOffset]));}static now(){return Clock.now()+window.__clockOffset;}};const tick=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>tick(fn,ms===15000?100:ms,...args);`});
  await a.go('/', data.tasks[1].title);
  const nextDay = new Date(); nextDay.setHours(24,0,1,0);
  await a.evaluate(`window.__clockOffset=${nextDay.getTime()}-Date.now();document.dispatchEvent(new Event('visibilitychange'));`);
  await a.ready('No events today.'); assert.ok((await a.evaluate('document.body.innerText')).includes('0 events remaining'));
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS: synthetic responsive panes, jump/focus, counts, complete/reopen, context capture, failed-save draft retry, hydration failure/retry/mutation, large text/dark/AX, search, calendar, ambient privacy at 1920x1080, midnight refresh.');
}
const watchdog=setTimeout(()=>{console.error('Polish harness timed out');process.exitCode=1;for(const c of clients)c.ws.close();chrome?.kill();server.close();},180000);
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{clearTimeout(watchdog);for(const c of clients)c.ws.close();chrome?.kill();server.close();});

