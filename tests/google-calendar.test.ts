import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createGoogleProvider } from '../src/calendar/googleProvider';
import { CALENDAR_SCOPES, GOOGLE_SCOPES, GoogleAuthError, googleAvailability, type GoogleAuth } from '../src/calendar/googleAuth';
import { createWebGoogleAuth, type TokenOptions, type GoogleIdentitySDK } from '../src/calendar/googleWebAuth';
import { createNativeGoogleAuth, type NativeGoogleSDK } from '../src/calendar/googleNativeAuth';
import { emptyExternalCache, parseExternalCache, reconcileExternal, type ExternalAccount } from '../src/domain/externalCalendars';

const clientId = '123-test.apps.googleusercontent.com';
const window = { from: '2026-09-01', through: '2026-12-01' };
const account: ExternalAccount = { id: 'google:123', provider: 'google', mode: 'google', label: 'me@example.com', syncEnabled: true };
const event = { id: 'same-id', summary: 'Meeting', start: { date: '2026-09-30' }, end: { date: '2026-10-01' } };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const list = (items: unknown[] = [], nextPageToken?: string) => ({ kind: 'calendar#calendarList', items, nextPageToken });
const events = (items: unknown[] = [], nextPageToken?: string) => ({ kind: 'calendar#events', items, nextPageToken });
function authFixture() {
  const calls: string[] = [];
  const auth: GoogleAuth = { prepare: async () => {}, authorize: async () => { calls.push('authorize'); return 'secret-token'; }, accessToken: async () => 'secret-token', invalidate: async token => { assert.equal(token, 'secret-token'); calls.push('invalidate'); }, forget: async () => { calls.push('forget'); } };
  return { auth, calls };
}

test('live connect verifies identity using userinfo and returns a credential-free account', async () => {
  const { auth } = authFixture();
  const provider = createGoogleProvider(auth, async (input, init) => {
    assert.equal(input, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(init?.method, 'GET'); assert.equal(init?.credentials, 'omit');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer secret-token');
    return response({ sub: '123', email: 'me@example.com' });
  });
  assert.deepEqual(await provider.connect(), account);
  const cache = parseExternalCache(JSON.stringify({ ...emptyExternalCache(), accounts: [account] }));
  assert.equal(cache.accounts[0]?.mode, 'google');
  assert.equal(JSON.stringify(cache).includes('secret-token'), false);
});

test('fetches all calendar/event pages, expands recurrence, skips disabled calendars and uses GET only', async () => {
  const { auth } = authFixture(); const urls: URL[] = [];
  const provider = createGoogleProvider(auth, async (input, init) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); assert.equal(init?.body, undefined);
    const url = new URL(String(input)); urls.push(url);
    assert.equal(url.searchParams.has('access_token'), false);
    if (url.hostname === 'openidconnect.googleapis.com') return response({ sub: '123', email: 'me@example.com' });
    if (url.pathname.endsWith('/calendarList')) return response(url.searchParams.has('pageToken')
      ? list([{ id: 'two', summary: 'Second' }, { id: 'disabled', summary: 'Disabled' }])
      : list([{ id: 'name@example.com', summary: 'First' }], 'next-calendars'));
    assert.equal(url.searchParams.get('singleEvents'), 'true'); assert.equal(url.searchParams.get('showDeleted'), 'true');
    assert.equal(url.searchParams.get('timeMin'), new Date('2026-09-01T00:00:00').toISOString());
    assert.equal(url.searchParams.get('timeMax'), new Date('2026-12-02T00:00:00').toISOString());
    assert.ok(!url.pathname.includes('disabled'));
    if (url.pathname.includes('name%40example.com')) return response(url.searchParams.has('pageToken') ? events([{ id: 'cancelled-instance', status: 'cancelled' }]) : events([event], 'next-events'));
    return response(events([event]));
  });
  const snapshots = await provider.fetchSnapshot(account, window, [{ id: 'disabled', accountId: account.id, name: 'Disabled', syncEnabled: false }]);
  assert.equal(snapshots.length, 3); assert.equal(snapshots[0].events.length, 2); assert.equal(snapshots[2].events.length, 0);
  assert.equal(urls.length, 6);
  const cache = reconcileExternal({ ...emptyExternalCache(), accounts: [account] }, snapshots, window);
  assert.equal(cache.events.length, 2, 'Same external ID in different calendars stays distinct');
});

for (const [status, pattern] of [[401, /expired|revoked/], [403, /denied/], [429, /rate limit/], [500, /failed \(500\)/]] as const) {
  test(`HTTP ${status} never returns an empty successful sync or leaks provider error text`, async () => {
    const { auth, calls } = authFixture();
    const provider = createGoogleProvider(auth, async () => response({ error: 'secret-provider-details' }, status));
    await assert.rejects(provider.fetchSnapshot(account, window), pattern);
    assert.equal(calls.includes('invalidate'), status === 401);
  });
}
test('network, malformed response, malformed event, and a failed later page preserve the whole snapshot', async () => {
  for (const fail of ['network', 'malformed', 'event', 'second-page']) {
    const { auth } = authFixture(); let pages = 0;
    const provider = createGoogleProvider(auth, async input => {
      const url = String(input);
      if (url.includes('userinfo')) return response({ sub: '123' });
      if (url.includes('calendarList')) return response(list([{ id: 'one', summary: 'One' }]));
      pages++;
      if (fail === 'network') throw Error('secret-network-details');
      if (fail === 'malformed') return response({});
      if (fail === 'event') return response(events([{ id: 'invalid' }]));
      return pages === 1 ? response(events([event], 'second')) : response({}, 503);
    });
    await assert.rejects(provider.fetchSnapshot(account, window), error => error instanceof Error && !error.message.includes('secret-'));
  }
});
test('repeated page tokens abort, while a valid empty Google collection represents deletion', async () => {
  const { auth } = authFixture();
  const empty = createGoogleProvider(auth, async input => String(input).includes('userinfo') ? response({ sub: '123' }) : response({ kind: 'calendar#calendarList' }));
  assert.deepEqual(await empty.fetchSnapshot(account, window), []);
  const loop = createGoogleProvider(auth, async input => String(input).includes('userinfo') ? response({ sub: '123' }) : response(list([], 'repeat')));
  await assert.rejects(loop.fetchSnapshot(account, window), /safe sync limit/);
});
test('account mismatch rejects before calendar reads and forgets the wrong-account token', async () => {
  const { auth, calls } = authFixture(); let requests = 0;
  const provider = createGoogleProvider(auth, async () => { requests++; return response({ sub: 'different' }); });
  await assert.rejects(provider.fetchSnapshot(account, window), /account changed/);
  assert.equal(requests, 1); assert.deepEqual(calls, ['forget']);
});
test('disconnect only clears credentials, never writes to Google calendars', async () => {
  const { auth, calls } = authFixture();
  await createGoogleProvider(auth, async () => { throw Error('Unexpected request'); }).disconnect();
  assert.deepEqual(calls, ['forget']);
});

function webFixture() {
  let options!: TokenOptions; let opened = false; let clock = 100_000;
  const sdk: GoogleIdentitySDK = { initTokenClient(value) { options = value; return { requestAccessToken() { opened = true; } }; }, hasGrantedAllScopes: (value, ...scopes) => scopes.every(scope => value.scope?.split(' ').includes(scope)) };
  const auth = createWebGoogleAuth(clientId, async () => sdk, () => clock);
  return { auth, get options() { return options; }, get opened() { return opened; }, tick: () => { clock += 3_600_000; }, success: () => options.callback({ access_token: 'browser-token', expires_in: 3600, scope: GOOGLE_SCOPES.join(' '), state: options.state }) };
}
test('web GIS opens directly on the user gesture, requests narrow scopes and validates state', async () => {
  const web = webFixture(); await web.auth.prepare();
  const pending = web.auth.authorize(); assert.equal(web.opened, true);
  assert.equal(web.options.include_granted_scopes, false);
  assert.equal(web.options.scope, GOOGLE_SCOPES.join(' '));
  web.success(); assert.equal(await pending, 'browser-token');
  assert.equal(await web.auth.accessToken(), 'browser-token');
  web.tick(); await assert.rejects(web.auth.accessToken(), /Reconnect/);
  const second = web.auth.authorize(); web.options.callback({ access_token: 'bad', expires_in: 3600, state: 'wrong', scope: GOOGLE_SCOPES.join(' ') });
  await assert.rejects(second, /verified/);
});
test('web denies partial scopes, handles blocked/closed popup and ignores callbacks after disconnect', async () => {
  const web = webFixture(); await web.auth.prepare();
  let pending = web.auth.authorize(); web.options.callback({ access_token: 'bad', expires_in: 3600, scope: CALENDAR_SCOPES[0], state: web.options.state });
  await assert.rejects(pending, /both read-only/);
  pending = web.auth.authorize(); web.options.error_callback({ type: 'popup_failed_to_open' }); await assert.rejects(pending, /Allow/);
  pending = web.auth.authorize(); web.options.error_callback({ type: 'popup_closed' }); await assert.rejects(pending, /closed/);
  pending = web.auth.authorize(); await web.auth.forget(); web.success(); await assert.rejects(pending, /cancelled/);
  await assert.rejects(web.auth.accessToken(), GoogleAuthError);
});
test('web needs explicit reauthorization after runtime recreation; no persistent token store is used', async () => {
  const web = webFixture(); await web.auth.prepare(); const pending = web.auth.authorize(); web.success(); await pending;
  const restarted = webFixture(); await restarted.auth.prepare(); await assert.rejects(restarted.auth.accessToken(), /Reconnect/);
  await web.auth.invalidate('browser-token'); await assert.rejects(web.auth.accessToken(), /Reconnect/);
});
test('missing config, wrong-platform config, Expo Go and SDK load failure are safe', async () => {
  assert.equal(googleAvailability({}, 'web').configured, false);
  assert.equal(googleAvailability({ iosClientId: clientId }, 'web').configured, false);
  assert.equal(googleAvailability({ webClientId: 'not-an-id' }, 'web').configured, false);
  assert.equal(googleAvailability({ webClientId: clientId }, 'android').configured, false);
  assert.equal(googleAvailability({ iosClientId: clientId }, 'ios', true).configured, false);
  let loads = 0;
  const native = createNativeGoogleAuth({ iosClientId: clientId }, 'ios', true, async () => { loads++; throw Error('must not load'); });
  await assert.rejects(native.prepare(), /development build/); assert.equal(loads, 0);
  const web = createWebGoogleAuth(undefined, async () => { loads++; throw Error('must not load'); });
  await assert.rejects(web.prepare(), /Configure/); assert.equal(loads, 0);
});
test('native SDK owns credentials, silently refreshes, clears rejected tokens and signs out', async () => {
  const calls: string[] = []; let configured: Parameters<NativeGoogleSDK['configure']>[0] | undefined;
  const sdk: NativeGoogleSDK = {
    configure: options => { configured = options; }, hasPlayServices: async () => { calls.push('play-services'); return true; },
    signIn: async () => { calls.push('sign-in'); return { type: 'success', data: { scopes: [...CALENDAR_SCOPES] } }; },
    signInSilently: async () => { calls.push('silent'); return { type: 'success', data: { scopes: [...CALENDAR_SCOPES] } }; },
    getTokens: async () => ({ accessToken: 'native-token' }), clearCachedAccessToken: async token => { assert.equal(token, 'native-token'); calls.push('invalidate'); }, signOut: async () => { calls.push('sign-out'); },
  };
  const auth = createNativeGoogleAuth({ webClientId: clientId, androidClientId: clientId }, 'android', false, async () => sdk);
  assert.equal(await auth.authorize(), 'native-token'); assert.equal(configured?.offlineAccess, false);
  assert.deepEqual(configured?.scopes, GOOGLE_SCOPES);
  assert.equal(await auth.accessToken(), 'native-token'); await auth.invalidate('native-token'); await auth.forget();
  assert.deepEqual(calls, ['play-services', 'sign-out', 'sign-in', 'silent', 'invalidate', 'sign-out']);
});

test('native auth cancellation and reset during sign-in cannot yield a usable token', async () => {
  let finish!: (value: Awaited<ReturnType<NativeGoogleSDK['signIn']>>) => void;
  let tokenReads = 0; let signOuts = 0;
  const sdk: NativeGoogleSDK = {
    configure: () => {}, hasPlayServices: async () => true,
    signIn: () => new Promise(resolve => { finish = resolve; }),
    signInSilently: async () => ({ type: 'noSavedCredentialFound', data: null }),
    getTokens: async () => { tokenReads++; return { accessToken: 'must-not-be-returned' }; },
    clearCachedAccessToken: async () => {}, signOut: async () => { signOuts++; },
  };
  const auth = createNativeGoogleAuth({ iosClientId: clientId }, 'ios', false, async () => sdk);
  await auth.prepare();
  const cancelled = auth.authorize();
  await new Promise(resolve => setImmediate(resolve));
  finish({ type: 'cancelled', data: null }); await assert.rejects(cancelled, /cancelled/);
  const stale = auth.authorize();
  await new Promise(resolve => setImmediate(resolve));
  await auth.forget(); finish({ type: 'success', data: { scopes: [...CALENDAR_SCOPES] } });
  await assert.rejects(stale, /cleared/);
  assert.equal(tokenReads, 0); assert.equal(signOuts, 4);
  await assert.rejects(auth.accessToken(), GoogleAuthError);
});

test('a missing native module is retryable and never loads at all without platform config', async () => {
  let loads = 0;
  const auth = createNativeGoogleAuth({}, 'ios', false, async () => { loads++; throw Error('native failure'); });
  await assert.rejects(auth.authorize(), /not configured/); assert.equal(loads, 0);
  const configured = createNativeGoogleAuth({ iosClientId: clientId }, 'ios', false, async () => { loads++; throw Error('native failure'); });
  await assert.rejects(configured.prepare(), /Rebuild/);
  await assert.rejects(configured.prepare(), /Rebuild/); assert.equal(loads, 2);
});
