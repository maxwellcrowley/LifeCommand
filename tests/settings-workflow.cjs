const assert = require('node:assert/strict');

module.exports = async ({ send, evaluate, ready, click, fill, go, snap, shot, pause, data }) => {
  const visible = label => evaluate(`!![...document.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)} && e.getClientRects().length)`);
  const modal = () => evaluate(`!!document.querySelector('[data-testid="settings-dialog"]')`);
  const focused = () => evaluate(`document.activeElement?.getAttribute('aria-label')`);
  const escape = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await pause(200); };
  const layout = async () => {
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'No horizontal overflow');
    if (await modal()) assert.ok(await evaluate(`(()=>{const r=document.querySelector('[data-testid="settings-dialog-footer"]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;})()`), 'Fixed footer remains reachable');
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await go('/settings', 'What do I see?');
  for (const label of ['What do I see?', 'How is it organized?', 'How does it look?', 'How does it behave?', 'Accounts and connections', 'Data and recovery']) {
    assert.equal(await evaluate(`document.querySelector('[aria-label="${label}"]').getAttribute('aria-expanded')`), 'false');
  }
  assert.equal(await visible('Section name'), false);
  await shot('overview-desktop-light');
  await click('How is it organized?'); await click('Create section');
  console.log('stage: validation and picker draft');
  assert.equal(await focused(), 'Section name', 'Name field receives opening focus');
  await click('Save section'); await ready('Use a section name between'); assert.ok(await modal());
  await fill('Section name', 'Synthetic garden');
  await click('Choose section icon'); await fill('Search section icons', 'plants'); await click('Section icon Garden');
  await click('Choose section icon'); await click('Choose section icon');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Section icon Garden"]').getAttribute('aria-checked')`), 'true');
  await fill('Custom section color, six digit hex', '#FDFDFD'); await layout(); await shot('editor-desktop-light');
  await escape(); await ready('Discard section changes?'); await click('Keep editing section');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Section name"]').value`), 'Synthetic garden');
  // Only the isolated profile's active snapshot write fails. No real storage involved.
  await evaluate(`window.settingsOriginalSet=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k==='lifecommand:data:v1')throw Error('Synthetic save failure');return window.settingsOriginalSet.call(this,k,v);}`);
  await click('Save section'); await ready('Retry save'); assert.ok(await modal());
  assert.equal((await snap()).sections.some(s => s.name === 'Synthetic garden'), false);
  await evaluate(`Storage.prototype.setItem=window.settingsOriginalSet; delete window.settingsOriginalSet`);
  console.log('stage: retry failed save');
  await click('Save section'); await ready('Saved.'); assert.equal(await modal(), false);
  assert.equal(await focused(), 'Create section', 'Focus returns to create trigger');
  const section = (await snap()).sections.find(s => s.name === 'Synthetic garden');
  assert.equal(section.icon, 'garden'); assert.equal(section.color, '#FDFDFD');
  await click('Edit section Synthetic garden'); await fill('Section name', 'Work'); await click('Save section'); await ready('A section already has this name.');
  console.log('stage: cancel, edit and reorder');
  await click('Cancel section edit'); await click('Discard section changes');
  assert.equal(await focused(), 'Edit section Synthetic garden');
  assert.equal((await snap()).sections.find(s => s.id === section.id).name, 'Synthetic garden');
  await click('Edit section Synthetic garden'); await fill('Custom section color, six digit hex', 'invalid'); await click('Save section'); await ready('Choose a valid section color.');
  await fill('Custom section color, six digit hex', '#010203'); await click('Save section'); await ready('Saved.');
  await click('Reorder sections'); await click('Move Synthetic garden up'); await ready('Section order saved.');
  const reordered = (await snap()).sections; assert.equal(reordered[reordered.length - 2].id, section.id);
  await click('Reorder sections');
  await click('Edit section Synthetic garden'); await click('Section management'); await click('Archive Synthetic garden');
  await click('Save section'); await ready('Saved.'); assert.equal((await snap()).sections.find(s => s.id === section.id).archived, true);
  console.log('stage: restore section');
  await click('Edit section Synthetic garden'); await click('Section management'); await click('Restore Synthetic garden');
  await click('Save section'); await ready('Saved.'); assert.equal((await snap()).sections.find(s => s.id === section.id).archived, false);
  console.log('stage: confirmation and reload');
  await click('Edit section Home'); await click('Section management'); await click('Move contents to Work'); await ready('Move section contents?'); await click('Cancel reassignment'); await click('Cancel section edit');
  await go('/settings', 'Synthetic garden');
  assert.equal(await evaluate(`document.querySelector('[aria-label="How is it organized?"]').getAttribute('aria-expanded')`), 'true');
  await click('How is it organized?'); await click('How does it behave?');
  await fill('Rollover time, 24-hour HH:MM', '04:25'); await click('How does it behave?'); await click('How does it behave?');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Rollover time, 24-hour HH:MM"]').value`), '04:25', 'Disclosure retains an unsaved draft');
  await click('How does it behave?'); await click('How does it look?'); await click('appearance: dark'); await click('textSize: extra-large');
  await click('How does it look?'); await shot('overview-desktop-dark-large');
  await click('How is it organized?'); await click('Edit section Synthetic garden'); await layout(); await shot('editor-desktop-dark-large');
  await click('Cancel section edit');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click('How is it organized?'); await evaluate('window.scrollTo(0,0)'); await layout(); await shot('overview-phone-dark-large');
  await click('How is it organized?'); await click('Edit section Synthetic garden'); await click('Choose section icon'); await layout(); await shot('editor-phone-dark-large');
  // Exercise hardware keyboard navigation separately from touch emulation.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('[aria-label="Section name"]').focus()`);
  for (let i = 0; i < 60; i++) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await pause(20);
    assert.ok(await evaluate(`!!document.activeElement.closest('[data-testid="settings-dialog"]')`), 'Keyboard focus stays inside editor, Tab ' + i + ': ' + await evaluate(`JSON.stringify({active:document.activeElement.tagName,dialogs:document.querySelectorAll('[role="dialog"]').length,focused:document.hasFocus()})`));
  }
  await escape(); assert.equal(await modal(), false); assert.equal(await focused(), 'Edit section Synthetic garden');
  await click('How is it organized?'); await click('How does it look?'); await click('appearance: light'); await click('textSize: standard'); await click('How does it look?');
  await shot('overview-phone-light'); await click('How is it organized?'); await click('Create section'); await layout(); await shot('editor-phone-light');
  await fill('Section name', 'Unsaved section'); await click('Cancel section edit'); await click('Discard section changes');
  assert.equal((await snap()).sections.some(s => s.name === 'Unsaved section'), false);
  assert.deepEqual((await snap()).tasks, JSON.parse(JSON.stringify(data.tasks)), 'Section presentation preserves tasks');
  assert.deepEqual((await snap()).projects, JSON.parse(JSON.stringify(data.projects)), 'Section presentation preserves projects');
  assert.deepEqual((await snap()).settings, JSON.parse(JSON.stringify(data.settings)), 'Canceled behavior draft does not change account settings');
  console.log('PASS: six summarized groups; create/edit/cancel/archive/restore/reorder; validation; save failure/retry; dirty Escape confirmation; picker draft preservation; opening/return/trapped focus; fixed footer; reload; light/dark desktop/phone/large text; unchanged task/project/settings data.');
};
