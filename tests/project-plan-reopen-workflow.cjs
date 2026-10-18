const assert = require('node:assert/strict');
const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
const { createProject } = require('../.test-build/src/domain/projects.js');
const { draftPlan, previewPlanCommand } = require('../.test-build/src/domain/projectPlans.js');
const { planToken } = require('../.test-build/src/domain/planState.js');
const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
const { fingerprint } = require('../.test-build/src/cloud/automatic.js');

exports.run = async ({ send, evaluate, ready, click, fill, go, snap, shot, pause }) => {
  const confirm = async () => {
    await click('Review plan changes'); await click('Confirm plan changes');
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!document.querySelector('[data-testid="settings-dialog"]')`)) return;
      await pause(100);
    }
    throw Error('Plan confirmation did not finish');
  };
  const visible = label => evaluate(`Array.from(document.querySelectorAll('[aria-label]')).some(e => e.getAttribute('aria-label') === ${JSON.stringify(label)} && e.getClientRects().length)`);
  for (const [name, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'phone' });
    const data = createDefaultAppData(); data.onboardingComplete = true;
    data.projects = [{ ...createProject({ name: 'Completion review', sectionId: 'work' }), id: 'reopen-review', plan: draftPlan([{ id: 'only-phase', name: 'Original phase', state: 'upcoming', rule: { mode: 'manual' } }]) }];
    await evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))}); localStorage.removeItem('lifecommand:device:presentation:v1');`);
    await go('/project/reopen-review?view=plan', 'Review and start plan');
    await click('Review and start plan'); await confirm();
    await click('Finish project'); await confirm();
    await ready('Reopen the project before adding phases.');
    assert.equal(await visible('Add phase'), false);
    assert.equal((await snap()).projects[0].status, 'complete');
    await evaluate('window.scrollTo(0,0)'); await shot(`${name}-completed-reopen`);
    await click('Reopen project to add phases'); await confirm();
    assert.equal((await snap()).projects[0].status, 'active');
    assert.equal(await visible('Add phase'), true);
    await click('Add phase'); await fill('Phase name', 'Follow-up phase'); await confirm();
    assert.deepEqual((await snap()).projects[0].plan.phases.map(p => p.state), ['current', 'upcoming']);
    await shot(`${name}-reopened-add-phase`);

    // A fresh one-phase active fixture exercises actual applyCloudData while the editor is mounted.
    const active = previewPlanCommand(data, 'reopen-review', planToken(data, data.projects[0]), { type: 'start' });
    await evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(active, 1)))});`);
    await go('/project/reopen-review?view=plan', 'Original phase');
    await click('Add phase'); await fill('Phase name', 'Keep this draft after sync');
    const local = await snap(); const { schemaVersion, revision, taskUndo, ...current } = local;
    const completed = previewPlanCommand(current, 'reopen-review', planToken(current, current.projects[0]), { type: 'finish' });
    // Read the mounted provider through React's test-only fiber inspection; no production test hook.
    await evaluate(`(async () => {
      const element = document.querySelector('[aria-label="Phase name"]');
      let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber$'))];
      while (fiber) {
        const value = fiber.memoizedProps?.value;
        if (value?.acceptCloud) { await value.acceptCloud(${JSON.stringify(completed)}, ${JSON.stringify(fingerprint(current))}); return; }
        fiber = fiber.return;
      }
      throw Error('App data provider unavailable');
    })()`);
    await ready('Your phase draft is kept in this editor.');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Phase name"]').value`), 'Keep this draft after sync');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Review plan changes"]').getAttribute('aria-disabled')`), 'true');
    assert.equal(await evaluate(`document.body.innerText.includes('A started plan needs exactly one current phase')`), false);
    assert.equal((await snap()).projects[0].status, 'complete');
    await shot(`${name}-add-phase-sync-draft`);
    await click('Cancel plan edit'); await click('Keep editing plan');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Phase name"]').value`), 'Keep this draft after sync');
    await click('Cancel plan edit'); await click('Discard plan changes');
  }
  console.log('PASS: desktop and phone completed-plan availability, explicit reopen/add, accepted cloud completion retains phase draft and disables save.');
};
