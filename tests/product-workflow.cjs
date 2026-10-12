const assert = require('node:assert/strict');
exports.fixture = (data, today, createTask, createProject) => {
  data.settings.ambientDisplayEnabled = true;
  data.projects = [createProject({ name: 'Garden plan', sectionId: 'home' }), createProject({ name: 'Release plan', sectionId: 'work' }), createProject({ name: 'Future plan', sectionId: 'health' })];
  data.sections = data.sections.map(s => ({ ...s, color: s.id === 'home' ? '#008080' : s.id === 'work' ? '#800080' : s.id === 'health' ? '#FEFEFE' : s.color }));
  data.tasks = Array.from({ length: 36 }, (_, i) => ({ ...createTask({ title: `Synthetic ${String(i).padStart(2, '0')}${i === 8 ? ' long title for a phone-sized screen that must wrap without clipping its actions' : ''}`, sectionId: i % 2 ? 'work' : 'home', projectId: data.projects[i % 2].id, priority: i % 3 ? 'normal' : 'high', dueDate: i < 12 ? today : undefined, description: 'A synthetic description with enough detail to exercise wrapping, previews and accessible expansion. No personal records are used.' }), id: `task-fixture-${i}`, ...(i >= 30 ? { manualPostponementsSinceCompletion: 3 } : {}) }));
  data.tasks.push({ ...createTask({ title: 'Synthetic upcoming task', sectionId: 'health', projectId: data.projects[2].id, dueDate: '2099-01-01' }), id: 'future-task' });
  data.tasks.push({ ...createTask({ title: 'Synthetic completed task', sectionId: 'home', dueDate: today }), id: 'completed-task', status: 'complete', completedAt: new Date().toISOString() });
  data.calendarEvents = [{ id: 'synthetic-event', source: 'personal', title: 'Synthetic appointment', date: today, startTime: '14:00', endTime: '15:00' }];
};
exports.run = async ({ send, evaluate, ready, click, fill, go, snap, shot, pause, data, today }) => {
  const layout = async () => {
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No horizontal overflow');
    if (await evaluate('!!document.querySelector(\'[data-testid="settings-dialog"]\')')) assert.ok(await evaluate(`(()=>{const r=document.querySelector('[data-testid="settings-dialog-footer"]').getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight+1;})()`), 'Modal footer visible');
  };
  const metrics = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await metrics(1440, 1000);
  console.log('stage: coordinated sections and project cards');
  await go('/settings', 'How is it organized?'); await shot('settings-desktop-light'); await click('How is it organized?');
  await click('Edit section Home'); await fill('Custom section color, six digit hex', '#008080'); await click('Choose section icon'); await fill('Search section icons', 'plants'); await click('Section icon Garden'); await shot('section-preview-teal'); await click('Save section');
  assert.equal((await snap()).sections.find(s => s.id === 'home').icon, 'garden');
  await go('/projects', 'Garden plan'); await ready('Upcoming'); await shot('projects-desktop-light');
  await click('Choose next task for Garden plan'); await click('Choose Synthetic 12 as next task for Garden plan'); await ready('Selected next task');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('lifecommand:device:presentation:v1')).projectNextTaskIds[${JSON.stringify(data.projects[0].id)}]`), 'task-fixture-12');
  await click('Complete next task: Synthetic 12'); await ready('Next due task');
  assert.equal((await snap()).tasks.find(t => t.id === 'task-fixture-12').status, 'complete');
  // Undo is a separate visible target, located by its accessible name.
  const undo = await evaluate(`[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).find(s=>s.startsWith('Undo '))`);
  assert.ok(undo); await click(undo); await ready('Selected next task');
  console.log('stage: planner selection/filter/collapse/failure/retry');
  await go('/', 'Synthetic 00'); await shot('today-desktop-light');
  await click('Add from backlog · ' + today); await click('Select backlog task: Synthetic 12');
  await click('Home: 12 available, 1 selected'); await fill('Filter backlog tasks', 'Synthetic 13'); await ready('1 selected outside current filters');
  await click('Select backlog task: Synthetic 13'); await click('Clear planner filters');
  await shot('planner-desktop-light'); await layout();
  await evaluate(`window.productSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lifecommand:data:v1')throw Error('Synthetic save failure');return window.productSet.call(this,k,v);}`);
  await click('Add selected (2)'); await ready('Retry Add'); assert.equal((await snap()).tasks.find(t => t.id === 'task-fixture-12').dueDate, undefined);
  await evaluate('Storage.prototype.setItem=window.productSet;delete window.productSet'); await click('Retry add selected (2)'); await ready('Synthetic 13');
  for (const id of ['task-fixture-12', 'task-fixture-13']) assert.equal((await snap()).tasks.find(t => t.id === id).dueDate, today);
  await click('Add from backlog · ' + today); await ready('0 selected'); await click('Cancel adding backlog tasks');
  console.log('stage: Focus unique rows and undo');
  await click('Actions for Synthetic 00'); await click('Pin Synthetic 00 for Focus today');
  // Pinning relocates the row and may unmount its menu; close if it remains.
  if (await evaluate(`!!document.querySelector('[aria-label="Close actions"]')`)) await click('Close actions');
  await ready('Focus today · 1/3');
  await ready("Today's tasks · 13"); // 14 visible open tasks, one shown only in Focus.
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Complete Synthetic 00"]').length`), 1);
  await click('Complete Synthetic 00'); await ready('Focus today · 0/3');
  const undoFocus = await evaluate(`[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).find(s=>s.startsWith('Undo '))`); await click(undoFocus); await ready('Focus today · 1/3');
  console.log('stage: Calendar selected-day planner');
  const chosenDay = require('../.test-build/src/domain/dates.js').addDays(today, 5);
  await go('/calendar', 'Synthetic appointment'); await fill('Date, required, YYYY-MM-DD', chosenDay); await click('Add from backlog · ' + chosenDay);
  const home = await evaluate(`[...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label').startsWith('Home:')&&e.getAttribute('aria-expanded')==='false')?.getAttribute('aria-label')`); if(home) await click(home);
  await click('Select backlog task: Synthetic 14'); await click('Add selected (1)');
  assert.equal((await snap()).tasks.find(t=>t.id==='task-fixture-14').dueDate, chosenDay);
  console.log('stage: saved view editor, active filter, persistence');
  await go('/search', 'Active filters'); await click('Edit view filters'); await fill('Saved view name', 'Synthetic high view'); await click('Priorities: high'); await click('Dates: today'); await shot('saved-view-editor'); await click('Save view'); await ready('Active view: Synthetic high view');
  assert.equal((await snap()).savedViews[0].dateMode, 'today');
  await go('/search', 'Active view: Synthetic high view'); await click('Edit view filters'); await fill('Saved view name', 'Synthetic renamed view'); await click('Save view'); await ready('Active view: Synthetic renamed view');
  await click('Clear search filters'); await ready('Active filters');
  console.log('stage: Review groups and atomic bulk');
  await go('/review', 'Repeatedly postponed'); await shot('review-desktop-light'); await click('Select visible Repeatedly postponed tasks'); await click('Schedule selected Review tasks'); await ready('No tasks in this group.');
  // Scheduling backlog items does not reset postponement history; they remain
  // classified until completion. Verify persistence, not an invented history reset.
  for (let i = 30; i < 36; i++) assert.equal((await snap()).tasks.find(t => t.id === `task-fixture-${i}`).dueDate, today);
  await go('/settings', 'Help'); await click('Help'); await click('Reopen optional setup'); await ready('Optional setup · 1 of 4'); await click('Next setup step'); await fill('Setup first task title', 'Synthetic onboarding task'); await click('Capture setup task'); await ready('Task saved.'); await click('Skip setup');
  assert.ok((await snap()).tasks.some(t => t.title === 'Synthetic onboarding task'));
  assert.equal((await snap()).onboardingComplete, true);
  console.log('stage: phone/tablet/dark/density/large-text matrix');
  for (const [width,height,name] of [[390,844,'phone'], [820,1180,'tablet'], [1440,1000,'desktop']]) {
    await metrics(width,height);
    for (const [path,label,screen] of [['/','Synthetic 00','today'], ['/calendar','Synthetic appointment','calendar'], ['/projects','Garden plan','projects'], ['/review','Repeatedly postponed','review'], ['/capture','Capture','capture'], ['/settings','How does it look?','settings']]) { await go(path,label); await layout(); await shot(`${screen}-${name}-light`); }
  }
  await click('How does it look?'); await click('appearance: dark'); await click('textSize: extra-large');
  for (const density of ['compact', 'detailed', 'comfortable']) {
    await click('density: ' + density + (density === 'comfortable' ? '' : '')); await metrics(390,844); await go('/', 'Synthetic 00'); await layout(); await shot(`today-phone-dark-${density}-large`);
    await go('/settings','How does it look?');
  }
  await click('Edit section Home').catch(async () => { await click('How is it organized?'); await click('Edit section Home'); });
  await layout(); await shot('section-editor-phone-dark-large'); await click('Cancel section edit');
  await go('/', 'Synthetic 00'); await click('Add from backlog · ' + today); await click('Planner Day schedule'); await layout(); await shot('planner-phone-dark-schedule'); await click('Cancel adding backlog tasks');
  await metrics(820,1180);
  for (const [path,label,screen] of [['/calendar','Synthetic appointment','calendar'], ['/projects','Garden plan','projects'], ['/review','Repeatedly postponed','review'], ['/capture','Capture','capture'], ['/settings','Help','settings']]) { await go(path,label); await layout(); await shot(screen+'-tablet-dark-large'); }
  await metrics(1920,1080); await go('/ambient','Today Board'); await shot('ambient-tv-dark');
  console.log('stage: synthetic ICS cache visibility, never a live feed');
  const { parseICS, emptySubscriptions, replaceSubscription } = require('../.test-build/src/domain/ics.js');
  const { addDays } = require('../.test-build/src/domain/dates.js');
  const sub = { id: 'browser-ics', name: 'Synthetic ICS', color: '#557D78' };
  const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:synthetic-browser', 'SUMMARY:Synthetic ICS appointment', 'DTSTART;VALUE=DATE:' + today.replaceAll('-',''), 'DTEND;VALUE=DATE:' + addDays(today,1).replaceAll('-',''), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const parsed = await parseICS(text, sub, { from: today, through: today });
  const cache = replaceSubscription(emptySubscriptions(), sub, parsed);
  await evaluate(`localStorage.setItem('lifecommand:subscriptions:v1',${JSON.stringify(JSON.stringify(cache))})`);
  await metrics(1440,1000); await go('/calendar','Synthetic ICS appointment');
  await click('Hide event: Synthetic ICS appointment');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('lifecommand:subscriptions:v1')).hidden.length`), 1);
  assert.ok(await evaluate(`(()=>{const button=[...document.querySelectorAll('[role="button"]')].find(e=>e.innerText==='Show hidden events (1)'); if(!button)return false;button.click();return true;})()`));
  await ready('Hidden from Today'); await click('Unhide event: Synthetic ICS appointment'); await click('Confirm unhide event');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('lifecommand:subscriptions:v1')).hidden.length`), 0);
  await go('/calendar','Synthetic ICS appointment');
  await evaluate(`document.querySelector('[aria-label="Hide event: Synthetic ICS appointment"]').scrollIntoView({block:'center'})`);
  await shot('ics-cache-fixture');
  console.log('PASS: 39 synthetic tasks; coordinated headers; next choice + complete/undo; planner filter/collapse/retry; Focus; views; Review bulk; Help replay; viewport/theme/density screenshots.');
};
