const assert = require('node:assert/strict');
exports.run = async ({ send, evaluate, ready, click, fill, go, snap, shot, pause, today }) => {
  const phase = process.argv.includes('--before') ? 'before' : 'after';
  // Same fixture, local date, routes, preferences and viewports in both captures.
  // No network/provider writes; the parent harness owns a disposable Chrome profile.
  await go('/', 'Synthetic 00');
  for (const [width, height, device] of [[390,844,'phone'],[820,1180,'tablet'],[1440,1000,'desktop']]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    for (const appearance of ['light','dark']) {
      for (const density of ['compact','comfortable','detailed']) {
        const textSize = device === 'phone' && density === 'detailed' ? 'extra-large' : 'standard';
        await evaluate(`localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify({appearance:${JSON.stringify(appearance)},density:${JSON.stringify(density)},textSize:${JSON.stringify(textSize)},focusVisible:false,collapsed:{}}))`);
        await go('/', 'Synthetic 00');
        await evaluate(`document.querySelector('[data-testid="task-section-home"]').scrollIntoView({block:'start'})`);
        await pause(100); await shot(`groups-${phase}-today-${device}-${appearance}-${density}`);
        assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'No page overflow');
        assert.ok(await evaluate(`[...document.querySelectorAll('[data-testid^="task-row-"]')].every(e=>e.scrollWidth<=e.clientWidth+1)`), 'No task overflow');
      }
    }
  }
  await evaluate(`localStorage.setItem('lifecommand:device:presentation:v1',JSON.stringify({appearance:'light',density:'comfortable',focusVisible:false,collapsed:{}}))`);
  for (const [route, label, name] of [['/calendar','Synthetic appointment','calendar'],['/review','Repeatedly postponed','review']]) {
    await go(route,label); await evaluate(`document.querySelector('[data-testid="task-section-home"]')?.scrollIntoView({block:'start'})`); await shot(`groups-${phase}-${name}`);
  }
  await go('/', 'Synthetic 00'); await click('Add from backlog · '+today); await shot(`groups-${phase}-planner`); await click('Cancel adding backlog tasks');
  if (phase === 'after') {
    await click('Add from backlog for Home · '+today);
    await ready('Plan '+today);
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="Planner section Home, selected"]')`), 'Originating section preselected');
    await click('Select backlog task: Synthetic 12');
    await click('Home: 12 available, 1 selected');
    await click('Planner section Work'); await ready('1 selected outside current filters');
    await click('Cancel adding backlog tasks');
    assert.equal((await snap()).tasks.find(t=>t.id==='task-fixture-12').dueDate,undefined);
    await click('Actions for Synthetic 00'); await ready('Schedule'); await click('Close actions');
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Actions for Synthetic 00', 'More returns focus to its trigger');
    await click('Show more description: Synthetic 00'); await ready('Show less');
    await click('Complete Synthetic 00');
    const undo = await evaluate(`[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).find(s=>s.startsWith('Undo '))`);
    assert.ok(undo); await click(undo); await ready('Synthetic 00');
    await click('Today, Home, 6 remaining tasks, 2 high priority');
    assert.equal(await evaluate(`document.querySelector('[data-testid="task-section-home"] [aria-expanded]').getAttribute('aria-expanded')`),'false');
    await go('/', 'Today');
    assert.equal(await evaluate(`document.querySelector('[data-testid="task-section-home"] [aria-expanded]').getAttribute('aria-expanded')`),'false');
    await go('/projects', 'Garden plan'); await click('Edit project: Garden plan'); await ready('Project tasks');
    await evaluate(`document.querySelector('[data-testid="task-section-home"]')?.scrollIntoView({block:'start'})`);
    await shot('groups-after-project-tasks');
    await click('Actions for Synthetic 00'); await ready('Archive'); await shot('groups-after-task-menu');
    await click('Close actions');
  }
  console.log('PASS: identical 38-task fixture; '+phase+' screenshot matrix and task-group boundaries.');
};
