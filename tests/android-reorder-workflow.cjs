const assert = require('node:assert/strict');
exports.run = async ({ send, evaluate, ready, click, go, snap, shot, pause }) => {
  const until = async (predicate, message) => {
    for (let i = 0; i < 80; i++) { if (await predicate()) return; await pause(100); }
    throw Error(message);
  };
  for (const width of [390, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false });
    await go('/project/plan-garden?view=plan', 'Garden studio');
    await until(() => evaluate(`!!document.querySelector('[data-testid="plan-phase-garden-1"]')`), 'Plan visible');
    if (!await evaluate(`!!document.querySelector('[aria-label="Move phase Build down"]')`)) {
      await evaluate(`document.querySelector('[data-testid="plan-phase-garden-1"] [role="button"]').click()`);
    }
    await until(() => evaluate(`!!document.querySelector('[aria-label="Move phase Build down"]')`), 'Expanded phase controls');
    const before = await snap();
    await click('Move phase Build down');
    await ready('Reorder phase');
    await click('Review plan changes');
    await ready('Confirm changes');
    await click('Confirm plan changes');
    await until(async () => (await snap()).projects.find(p => p.id === 'plan-garden').plan.phases[2].id === 'garden-1', 'Saved reorder did not finish');
    await until(() => evaluate(`!document.querySelector('[data-testid="settings-dialog"]')`), 'Confirmation did not close');
    assert.deepEqual((await snap()).projects[0].plan.history, before.projects[0].plan.history);
    await until(() => evaluate(`Array.from(document.querySelectorAll('[aria-live="polite"]')).some(e => e.textContent.includes('Build: position 3 of 3'))`), 'AX-ORDER: saved position is not announced');
    await until(() => evaluate(`document.activeElement?.getAttribute('aria-label')?.startsWith('Phase Build, position 3 of 3,')`), 'AX-ORDER: focus did not return to moved phase');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Move phase Build down"]').getAttribute('aria-disabled')`), 'true');
    await shot(`acceptance-reorder-${width}`);
    // Return to the original order through the same confirmed action, so each viewport tests a real save.
    await click('Move phase Build up'); await ready('Reorder phase');
    await click('Review plan changes'); await ready('Confirm changes'); await click('Confirm plan changes');
    await until(async () => (await snap()).projects[0].plan.phases[1].id === 'garden-1', 'Reverse reorder did not save');
    await until(() => evaluate(`!document.querySelector('[data-testid="settings-dialog"]')`), 'Reverse confirmation did not close');
    console.log(`PASS AX-ORDER browser ${width}px: durable order, live message, focus, boundary; no native claim`);
  }
};
