const { createServer } = require('node:http');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = resolve(process.env.USABILITY_DIST || 'dist');
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
  const go = async (path, text) => { await send('Page.navigate', { url: 'http://127.0.0.1:4198' + path }); await ready(text); };
  await send('Runtime.enable'); await send('Page.enable');
  const client = { ws, send, evaluate, ready, click, fill, go }; clients.push(client); return client;
}

async function main() {
  await new Promise(r => server.listen(4198, '127.0.0.1', r));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9258', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-networking', '--user-data-dir=' + resolve('.test-build/usability-chrome'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets;
  for (let i=0;i<100;i++) { try { targets=await (await fetch('http://127.0.0.1:9258/json',{signal:AbortSignal.timeout(1000)})).json();break; } catch { await pause(250); } }
  assert.ok(targets,'Headless Chrome ready');
  const a=await connect(targets.find(t=>t.type==='page'));
  const label = async text => { assert.ok(await a.evaluate(`(() => { const e=[...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(text)}); if(!e)return false; e.click();return true; })()`),text); await pause(250); };
  const snap=()=>a.evaluate(`JSON.parse(localStorage.getItem('lifecommand:data:v1'))`);
  const screenshot=async name=>{const r=await a.send('Page.captureScreenshot',{format:'png'});writeFileSync(resolve('.test-build/'+name+'.png'),Buffer.from(r.data,'base64'));};
  await a.go('/','LIFECOMMAND'); await a.evaluate('localStorage.clear()');
  await a.go('/','Make LifeCommand yours');
  assert.equal((await snap()).tasks.length,0);assert.equal((await snap()).onboardingComplete,false);
  await label('Skip setup'); await a.ready("Today's tasks");assert.equal((await snap()).onboardingComplete,true);
  const {createDefaultAppData}=require('../.test-build/src/domain/defaults.js');
  const {createTask}=require('../.test-build/src/domain/tasks.js');
  const {createProject}=require('../.test-build/src/domain/projects.js');
  const {persistedSnapshot}=require('../.test-build/src/domain/migrations.js');
  const {localDateKey}=require('../.test-build/src/domain/dates.js');
  const data=createDefaultAppData(),today=localDateKey(new Date());data.settings.autoRollover=false;
  const project=createProject({name:'House plan',sectionId:'home',defaultTaskPoints:3});data.projects=[project];
  const task=createTask({title:'Private appointment prep',sectionId:'home',projectId:project.id,dueDate:today,priority:'high'});
  data.tasks=[task,createTask({title:'Keep unrelated work',sectionId:'home',dueDate:today}),createTask({title:'Backlog three points',sectionId:'work',storyPoints:3})];
  await a.evaluate(`localStorage.setItem('lifecommand:data:v1',${JSON.stringify(JSON.stringify(persistedSnapshot(data,20)))});localStorage.removeItem('lifecommand:device:presentation:v1')`);
  await a.go('/','Private appointment prep');
  await label('Actions for Private appointment prep');await label('Set low priority');assert.equal((await snap()).tasks.find(t=>t.id===task.id).priority,'low');
  await label('Undo update task');assert.equal((await snap()).tasks.find(t=>t.id===task.id).priority,'high');
  await label('Actions for Private appointment prep');await label('Delete task');await label('Confirm delete task');
  assert.ok(!(await snap()).tasks.some(t=>t.id===task.id));
  await a.go('/','Undo delete task');await label('Undo delete task');assert.equal((await snap()).tasks.length,3);
  await label('Today, Home, 2 tasks');await a.go('/',"Today's tasks");assert.ok(!(await a.evaluate('document.body.innerText')).includes('Private appointment prep'));
  await label('Today, Home, 2 tasks');await a.ready('Private appointment prep');
  await label('Add from backlog · '+today);await label('Select backlog task: Backlog three points');await a.ready('1 tasks · 3 story points selected');await label('Cancel');
  await a.go('/settings','Personal sections');await label('Create section');await a.fill('Section name','Garden');await label('Save section');await a.ready('Garden');
  assert.ok((await snap()).sections.some(s=>s.name==='Garden'));
  await label('density: compact');await label('textSize: extra-large');
  await a.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await a.go('/','Private appointment prep');
  assert.ok(await a.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),'mobile horizontal overflow');
  await a.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await a.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.notEqual(await a.evaluate('document.activeElement.tagName'),'BODY','keyboard focus');
  const ax=await a.send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.role?.value==='button' && n.name?.value==='Search and saved views'),'accessible search action');
  await screenshot('upgrade-mobile-large-text');
  await label('Search and saved views');await a.ready('Saved views');await a.fill('Search tasks, projects and events','unrelated');await a.ready('Tasks · 1');
  await a.fill('Saved view name','My work');await label('Save view');await a.ready('Load view My work');assert.equal((await snap()).savedViews[0].query,'unrelated');
  await a.go('/','Private appointment prep');await label('Edit task: Private appointment prep');await a.ready('Save changes');await a.fill('Task title, required','Unsaved title');await pause(400);
  await a.send('Runtime.evaluate',{expression:'history.back()'});await a.ready('Discard unsaved changes?');await label('Keep editing');assert.ok((await snap()).tasks.some(t=>t.title==='Private appointment prep'));
  await a.fill('Task title, required','Private appointment prep');await pause(250);
  await a.go('/settings','Ambient device profile');await label('Ambient profile tv');await label('Hide sensitive titles in ambient display');
  await a.evaluate(`(() => {const e=document.querySelector('[aria-label="Enable ambient display"]');if(!e)throw Error('ambient toggle');e.click();})()`);await pause(250);
  await a.go('/ambient','Private item');assert.ok(!(await a.evaluate('document.body.innerText')).includes('Private appointment prep'));
  const privateAX=await a.send('Accessibility.getFullAXTree');assert.ok(!privateAX.nodes.some(n=>n.name?.value?.includes('Private appointment prep')));
  await screenshot('upgrade-ambient-private');
  await a.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await a.go('/','Private appointment prep');await screenshot('upgrade-desktop');
  assert.ok(!errors.length,JSON.stringify(errors));
  console.log('PASS: empty/skipped onboarding; personal sections; priority and delete undo across restart; collapse persistence; bulk points; mobile large text; keyboard and AX semantics; saved search; discard warning; ambient title privacy; desktop layout.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{for(const c of clients)c.ws.close();if(chrome)chrome.kill();server.close();});
