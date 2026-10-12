const assert = require('node:assert/strict');
function setup(snapshot) {
  const host = 'https://cloud-test.supabase.co';
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  window.syntheticSessions = ids.map((id, index) => {
    const user = { id, email: `synthetic-${index}@example.test`, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };
    const token = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + btoa(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.synthetic';
    return { access_token: token, refresh_token: 'synthetic-only', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  });
  window.syntheticScope = index => 'lifecommand:account:' + encodeURIComponent(`${host}:${ids[index]}`) + ':';
  for (let index = 0; index < 2; index++) {
    const data = structuredClone(snapshot); data.onboardingComplete = true;
    data.sections[0].name = `Synthetic account ${index}`;
    localStorage.setItem(window.syntheticScope(index) + 'lifecommand:data:v1', JSON.stringify(data));
    localStorage.setItem(window.syntheticScope(index) + 'lifecommand:device:presentation:v1', JSON.stringify({ appearance: index ? 'dark' : 'light', focusVisible: index === 0, focusDate: snapshot.tasks[0].dueDate, focusTaskIds: index === 0 ? [snapshot.tasks[0].id] : [], plannerSectionId: index === 0 ? 'home' : 'work', activeSavedViewId: index === 0 ? 'view-a' : 'view-b', collapsed: { 'Settings:organization': index === 1 } }));
  }
  localStorage.setItem('sb-cloud-test-auth-token', JSON.stringify(window.syntheticSessions[0]));
  window.syntheticChannel = new BroadcastChannel('sb-cloud-test-auth-token');
  window.syntheticSwitch = index => {
    const session = window.syntheticSessions[index];
    localStorage.setItem('sb-cloud-test-auth-token', JSON.stringify(session));
    window.syntheticChannel.postMessage({ event: 'SIGNED_IN', session });
  };
  const original = window.fetch.bind(window);
  window.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith(host)) {
      if ((options.method ?? 'GET').toUpperCase() !== 'GET') throw Error('Synthetic workflow forbids remote writes');
      const body = url.includes('/user') ? JSON.parse(localStorage.getItem('sb-cloud-test-auth-token')).user : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.startsWith('https://')) throw Error('External network blocked');
    return original(input, options);
  };
}
exports.source = snapshot => `(${setup.toString()})(${JSON.stringify(snapshot)})`;
exports.run = async ({ evaluate, ready, click, fill, go, pause }) => {
  await go('/settings', 'What do I see?');
  assert.ok(await evaluate(`document.body.innerText.includes('synthetic-0@example.test')`), 'Synthetic account signed in: ' + await evaluate(`document.body.innerText.slice(0,1200)`));
  if (await evaluate(`document.querySelector('[aria-label="How is it organized?"]').getAttribute('aria-expanded')==='false'`)) await click('How is it organized?');
  await ready('Synthetic account 0'); await ready('Focus on');
  const originalA = await evaluate(`localStorage.getItem(syntheticScope(0)+'lifecommand:data:v1')`);
  const originalB = await evaluate(`localStorage.getItem(syntheticScope(1)+'lifecommand:data:v1')`);
  await click('Edit section Synthetic account 0'); await fill('Section name', 'Unsaved account A draft');
  await evaluate('syntheticSwitch(1)'); await ready('synthetic-1@example.test'); await pause(300);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="settings-dialog"]')`), false, 'Old account editor unmounted');
  assert.equal(await evaluate(`document.querySelector('[aria-label="How is it organized?"]').getAttribute('aria-expanded')`), 'false');
  await ready('Focus off');
  assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem(syntheticScope(1)+'lifecommand:device:presentation:v1')).focusTaskIds`), []);
  await ready('dark theme'); await click('How is it organized?'); await click('Edit section Synthetic account 1');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Section name"]').value`), 'Synthetic account 1');
  await click('Cancel section edit'); await evaluate('syntheticSwitch(0)'); await ready('Synthetic account 0');
  await ready('light theme'); await ready('Focus on');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem(syntheticScope(0)+'lifecommand:device:presentation:v1')).focusTaskIds.length`), 1);
  assert.equal(await evaluate(`document.querySelector('[aria-label="How is it organized?"]').getAttribute('aria-expanded')`), 'true');
  await click('Edit section Synthetic account 0');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Section name"]').value`), 'Synthetic account 0', 'Discarded old-account draft cannot leak back');
  await click('Cancel section edit');
  assert.equal(await evaluate(`localStorage.getItem(syntheticScope(0)+'lifecommand:data:v1')`), originalA);
  assert.equal(await evaluate(`localStorage.getItem(syntheticScope(1)+'lifecommand:data:v1')`), originalB);
  console.log('PASS: real account boundary reacts to mocked cross-tab sign-in; editor unmounts, account drafts/appearance/disclosures stay isolated, Focus/planner/view preferences isolated, both snapshots unchanged.');
};
