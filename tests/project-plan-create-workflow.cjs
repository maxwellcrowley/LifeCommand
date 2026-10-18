const assert = require('node:assert/strict');
const { createDefaultAppData } = require('../.test-build/src/domain/defaults.js');
const { createProject, changeProject } = require('../.test-build/src/domain/projects.js');
const { persistedSnapshot } = require('../.test-build/src/domain/migrations.js');
const { fingerprint } = require('../.test-build/src/cloud/automatic.js');

exports.run = async ({ send, evaluate, ready, click, fill, go, snap, shot, pause }) => {
  const waitFor = async (predicate, label) => {
    for (let i = 0; i < 100; i++) { if (await predicate()) return; await pause(100); }
    throw Error(label);
  };
  const savedDialog = () => waitFor(() => evaluate(`!document.querySelector('[data-testid="settings-dialog"]')`), 'Plan save did not finish');
  const visible = label => evaluate(`Array.from(document.querySelectorAll('[aria-label]')).some(e => e.getAttribute('aria-label') === ${JSON.stringify(label)} && e.getClientRects().length)`);
  const disabled = label => evaluate(`document.querySelector('[aria-label="' + ${JSON.stringify(label)} + '"]').getAttribute('aria-disabled') === 'true'`);
  const load = async status => {
    const data = createDefaultAppData(); data.onboardingComplete = true;
    data.projects = [{ ...createProject({ name: 'Initial plan review', sectionId: 'work', status }), id: 'create-review' }];
    await evaluate(`localStorage.setItem('lifecommand:data:v1', ${JSON.stringify(JSON.stringify(persistedSnapshot(data, 1)))});`);
    await go('/project/create-review?view=plan', status === 'complete' ? 'Review reopening project' : 'Add project plan');
  };
  for (const [name, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'phone' });
    await load('complete');
    assert.equal(await visible('Add project plan'), false);
    assert.equal(await visible('Add another draft phase'), false);
    const before = (await snap()).projects[0];
    await click('Reopen project to create a plan'); await ready('Review project lifecycle change');
    await click('Cancel project lifecycle preview');
    assert.deepEqual((await snap()).projects[0], before);
    await click('Reopen project to create a plan'); await ready('Review project lifecycle change');
    await shot(`${name}-initial-plan-reopen-confirmation`);
    await click('Confirm project lifecycle change');
    await waitFor(async () => (await snap()).projects[0].status === 'active', 'Project reopening did not save');
    await go('/project/create-review?view=plan', 'Add project plan');
    await click('Add project plan'); await fill('Phase 1 name', 'First phase'); await fill('Phase 2 name', 'Second phase');
    await click('Add another draft phase'); await fill('Phase 4 name', 'Third phase');
    await click('Review plan changes'); await ready('Review plan changes'); await click('Confirm plan changes'); await savedDialog();
    const created = (await snap()).projects[0];
    assert.equal(created.status, 'active'); assert.equal(created.plan.started, false);
    assert.deepEqual(created.plan.phases.map(p => p.name), ['First phase', 'Second phase', 'Third phase']);
    assert.ok(created.plan.phases.every(p => p.state === 'upcoming'));
    for (const reviewed of [false, true]) {
      await load('active'); await click('Add project plan'); await fill('Phase 1 name', 'Keep first phase');
      await click('Add another draft phase'); await fill('Phase 4 name', 'Keep appended phase');
      if (reviewed) { await click('Review plan changes'); await ready('Confirm changes'); }
      const { schemaVersion, revision, taskUndo, ...local } = await snap();
      const complete = changeProject(local, 'create-review', { status: 'complete' }, local.projects[0].updatedAt);
      await evaluate(`(async () => {
        const element = document.querySelector('[aria-label="${reviewed ? 'Confirm plan changes' : 'Phase 1 name'}"]');
        let fiber = element[Object.keys(element).find(k => k.startsWith('__reactFiber$'))];
        while (fiber) {
          const value = fiber.memoizedProps?.value;
          if (value?.acceptCloud) { await value.acceptCloud(${JSON.stringify(complete)}, ${JSON.stringify(fingerprint(local))}); return; }
          fiber = fiber.return;
        }
        throw Error('App data provider unavailable');
      })()`);
      await ready('Reopen the project before creating a plan.');
      assert.equal(await disabled(reviewed ? 'Confirm plan changes' : 'Review plan changes'), true);
      if (reviewed) await click('Back to plan editing');
      assert.equal(await evaluate(`document.querySelector('[aria-label="Phase 1 name"]').value`), 'Keep first phase');
      assert.equal(await evaluate(`document.querySelector('[aria-label="Phase 4 name"]').value`), 'Keep appended phase');
      assert.equal(await disabled('Add another draft phase'), true);
      await click('Add another draft phase'); assert.equal(await visible('Phase 5 name'), false);
      assert.equal((await snap()).projects[0].status, 'complete'); assert.equal((await snap()).projects[0].plan, undefined);
      await shot(`${name}-initial-plan-sync-${reviewed ? 'after-review' : 'draft'}`);
      await click('Cancel plan edit'); await click('Keep editing plan');
      assert.equal(await evaluate(`document.querySelector('[aria-label="Phase 4 name"]').value`), 'Keep appended phase');
      await click('Cancel plan edit'); await click('Discard plan changes');
    }
  }
  console.log('PASS: phone/desktop initial-plan creation requires confirmed reopen; cancellation preserves state; multiphase creation works; accepted completion before/after review retains drafts and blocks append/save.');
};
