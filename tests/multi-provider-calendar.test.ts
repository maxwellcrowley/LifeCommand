import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CalendarAuthError, createAccountSessions, type CalendarAuth } from '../src/calendar/auth';
import { createMemoryTokenVault } from '../src/calendar/tokenVault';
import { createGoogleProvider } from '../src/calendar/googleProvider';
import { createOutlookProvider, normalizeOutlookEvent } from '../src/calendar/outlookProvider';
import { createOutlookAuth, outlookAvailability, OUTLOOK_SCOPES, type OutlookToken } from '../src/calendar/outlookAuth';
import { calendarDays, changeEvent, createEvent, eventKey, eventsOnDate, eventSourceColor, eventSourceLabel, insertEvent } from '../src/domain/events';
import { selectAmbient } from '../src/domain/ambient';
import { createDefaultAppData } from '../src/domain/defaults';
import { disconnectExternalAccount, emptyExternalCache, parseExternalCache, reconcileExternal, visibleExternalEvents, type ExternalAccount } from '../src/domain/externalCalendars';
import { createCalendarStore } from '../src/calendar/storage';

const window = { from: '2026-09-01', through: '2026-12-01' };
const now = new Date('2026-09-30T08:00:00');
const google: ExternalAccount = { id: 'google:one', provider: 'google', mode: 'google', label: 'one@example.com', syncEnabled: true };
const other: ExternalAccount = { ...google, id: 'google:two', label: 'two@example.com' };
const outlook: ExternalAccount = { id: 'outlook:one', provider: 'outlook', mode: 'outlook', label: 'outlook@example.com', syncEnabled: true };
const calendar = { id: 'shared-family', name: 'Household', color: '#31A3A0' };
const event = { id: 'shared-event', summary: 'Family outing', start: { date: '2026-09-30' }, end: { date: '2026-10-01' } };
const connected = () => ({ ...emptyExternalCache(), accounts: [google, other, outlook] });
const response = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, headers });
const timed = { id: 'timed', subject: 'Outlook meeting', isAllDay: false, start: { dateTime: '2026-09-30T14:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-09-30T15:00:00.0000000', timeZone: 'UTC' } };
function authFixture() {
  let token = 'one'; const forgotten: string[] = []; const invalidated: string[] = [];
  const auth: CalendarAuth = { prepare: async () => {}, authorize: async () => token, accessToken: async () => token, forget: async () => { forgotten.push(token); }, invalidate: async value => { invalidated.push(value); } };
  return { auth, select: (value: string) => { token = value; }, forgotten, invalidated };
}

test('v1 single-account cache migrates without losing imports, flags or identity; unknown fields cannot persist tokens', () => {
  const saved = reconcileExternal({ ...emptyExternalCache(), accounts: [google] }, [{ calendar, events: [event] }], window, now);
  const migrated = parseExternalCache(JSON.stringify({ version: 1, account: { ...saved.accounts[0], accessToken: 'secret' }, calendars: saved.calendars, events: saved.events }));
  assert.deepEqual(migrated, saved);
  assert.equal(JSON.stringify(migrated).includes('secret'), false);
  assert.throws(() => parseExternalCache(JSON.stringify({ ...saved, accounts: [google, google] })), /account cache/);
  assert.throws(() => parseExternalCache(JSON.stringify({ ...saved, events: [{ ...saved.events[0], provider: 'outlook' }] })), /Imported event/);
});

test('sync, deletion, disabling and disconnect are scoped to one account, including overlapping calendar IDs', () => {
  let cache = connected();
  for (const account of cache.accounts) cache = reconcileExternal(cache, [{ calendar, events: [event] }], window, now, account.id);
  assert.equal(cache.events.length, 3);
  const saved = parseExternalCache(JSON.stringify(cache));
  assert.equal(saved.events[2].provider, 'outlook');
  const deleted = reconcileExternal(saved, [], window, now, google.id);
  assert.deepEqual(deleted.events.map(event => event.accountId), [other.id, outlook.id]);
  const disconnected = disconnectExternalAccount(saved, outlook.id);
  assert.equal(disconnected.accounts.length, 2); assert.equal(disconnected.events.length, 2);
  const disabled = { ...saved, calendars: saved.calendars.map(item => ({ ...item, syncEnabled: item.accountId === outlook.id })) };
  assert.deepEqual(visibleExternalEvents(disabled).map(event => event.provider), ['outlook']);
  assert.throws(() => reconcileExternal(saved, [], window, now), /Connect/, 'Multi-account sync needs an explicit account');
});

test('shared Google events appear once; newest import wins and Family mode survives deduplication', () => {
  let cache = reconcileExternal(connected(), [{ calendar, events: [event] }], window, now, google.id);
  cache.calendars[0].family = true; cache.calendars[0].colorOverride = '#3978C5';
  cache = reconcileExternal(cache, [{ calendar, events: [{ ...event, summary: 'Updated outing' }] }], window, new Date(now.getTime() + 1000), other.id);
  const visible = visibleExternalEvents(cache);
  assert.equal(visible.length, 1); assert.equal(visible[0].title, 'Updated outing'); assert.equal(visible[0].family, true);
  assert.match(eventSourceLabel(visible[0]), /Google.*Household.*two@example.com.*read-only/);
  cache.calendars[1].syncEnabled = false;
  assert.equal(eventSourceColor(visibleExternalEvents(cache)[0]), '#3978C5');
  cache = reconcileExternal(cache, [{ calendar: { ...calendar, color: '#C7952D' }, events: [event] }], window, now, google.id);
  assert.equal(cache.calendars.find(item => item.accountId === google.id)?.colorOverride, '#3978C5');
  assert.equal(cache.calendars.find(item => item.accountId === google.id)?.family, true);
});

test('both providers join Today, Calendar and Ambient; Family mode includes only explicitly selected shared calendars', () => {
  let local = insertEvent(createDefaultAppData(), createEvent({ title: 'Local work', date: '2026-09-30', source: 'work', startTime: '11:00' }));
  local = insertEvent(local, createEvent({ title: 'Local family', date: '2026-09-30', source: 'family', addedBy: 'Max', category: 'School', startTime: '09:00' }));
  const original = JSON.stringify(local);
  let cache = reconcileExternal(connected(), [{ calendar, events: [event] }], window, now, google.id);
  cache = reconcileExternal(cache, [{ calendar, events: [{ ...event, id: 'outlook', summary: 'Outlook morning', start: { dateTime: new Date('2026-09-30T10:00:00').toISOString() }, end: { dateTime: new Date('2026-09-30T10:30:00').toISOString() } }] }], window, now, outlook.id);
  cache.calendars.find(item => item.accountId === google.id)!.family = true;
  const data = { ...local, externalEvents: visibleExternalEvents(cache) };
  const expected = ['Family outing', 'Local family', 'Outlook morning', 'Local work'];
  assert.deepEqual(eventsOnDate(data, '2026-09-30').map(event => event.title), expected);
  assert.deepEqual(calendarDays(data, '2026-09-30', '2026-09-30')[0].events.map(event => event.title), expected);
  assert.equal(selectAmbient(data, now).events.total, 4);
  assert.deepEqual(selectAmbient({ ...data, settings: { ...data.settings, ambientMode: 'family' } }, now).events.items.map(event => event.title).sort(), ['Family outing', 'Local family']);
  for (const event of data.externalEvents) assert.throws(() => changeEvent(local, eventKey(event), 'archive', undefined), /no longer available/);
  assert.equal(JSON.stringify(local), original);
});

test('multi-account cache saves remain atomic and reject stale cross-tab edits', async () => {
  let raw: string | null = null;
  const store = createCalendarStore({ getItem: async () => raw, setItem: async (_key, value) => { raw = value; } });
  const saved = await store.save(emptyExternalCache(), connected());
  await store.save(saved, disconnectExternalAccount(saved, google.id));
  await assert.rejects(store.save(saved, reconcileExternal(saved, [{ calendar, events: [event] }], window, now, google.id)), /changed/);
  assert.equal((await store.load()).accounts.some(item => item.id === google.id), false);
});

test('Google account-bound token sessions sync multiple logins and disconnect independently; reconnect cannot replace identity', async () => {
  const fixture = authFixture(); const requests: string[] = [];
  const provider = createGoogleProvider(fixture.auth, async (input, init) => {
    const token = (init!.headers as Record<string, string>).Authorization.slice(7); requests.push(token);
    return String(input).includes('userinfo') ? response({ sub: token }) : response({ kind: 'calendar#calendarList', items: [] });
  });
  const one = await provider.connect(); fixture.select('two'); const two = await provider.connect();
  await provider.fetchSnapshot(one, window); await provider.fetchSnapshot(two, window);
  assert.deepEqual(requests, ['one', 'two', 'one', 'one', 'two', 'two']);
  await assert.rejects(provider.connect(one.id), /different account/);
  await provider.disconnect(two.id);
  await provider.fetchSnapshot(one, window);
  assert.equal(requests.at(-1), 'one');
});

test('Outlook normalization handles UTC fractional timestamps, all-day dates and tombstones; rejects ambiguous local times', () => {
  assert.equal(normalizeOutlookEvent(timed).start?.dateTime, '2026-09-30T14:00:00.0000000Z');
  const allDay = { ...timed, isAllDay: true, start: { dateTime: '2026-09-30T00:00:00.0000000', timeZone: 'Pacific Standard Time' }, end: { dateTime: '2026-10-02T00:00:00.0000000', timeZone: 'Pacific Standard Time' } };
  assert.equal(normalizeOutlookEvent(allDay).start?.date, '2026-09-30');
  assert.equal(normalizeOutlookEvent(allDay).end?.date, '2026-10-02');
  assert.deepEqual(normalizeOutlookEvent({ id: 'gone', isCancelled: true }), { id: 'gone', status: 'cancelled' });
  assert.deepEqual(normalizeOutlookEvent({ id: 'gone', '@removed': { reason: 'deleted' } }), { id: 'gone', status: 'cancelled' });
  assert.throws(() => normalizeOutlookEvent({ ...timed, start: { ...timed.start, timeZone: 'Eastern Standard Time' } }), /UTC/);
  assert.throws(() => normalizeOutlookEvent({ ...allDay, start: { ...allDay.start, dateTime: '2026-09-30T07:00:00' } }), /timezone/);
});

test('Outlook adapter expands calendarView pages, reads calendar colors and restores all-day original dates using GET only', async () => {
  const fixture = authFixture(); const urls: URL[] = [];
  const provider = createOutlookProvider(fixture.auth, async (input, init) => {
    assert.equal(init?.method, 'GET'); assert.equal(init?.body, undefined); assert.equal(init?.redirect, 'error');
    const url = new URL(String(input)); urls.push(url);
    assert.equal(url.searchParams.has('access_token'), false);
    if (url.pathname === '/oidc/userinfo') return response({ sub: 'one', email: 'outlook@example.com' });
    if (url.pathname === '/v1.0/me/calendars') return response({ value: [{ id: 'calendar', name: 'Work', hexColor: '#0078D4' }, { id: 'disabled', name: 'Disabled' }] });
    assert.ok(!url.pathname.includes('disabled'));
    if (url.pathname.includes('/events/')) {
      assert.match((init!.headers as Record<string, string>).Prefer, /Pacific Standard Time/);
      return response({ id: 'day', isAllDay: true, subject: 'All day', start: { dateTime: '2026-09-30T00:00:00.0000000', timeZone: 'Pacific Standard Time' }, end: { dateTime: '2026-10-01T00:00:00.0000000', timeZone: 'Pacific Standard Time' } });
    }
    if (url.searchParams.has('$skiptoken')) return response({ value: [{ id: 'cancelled', isCancelled: true }, { id: 'day', isAllDay: true, originalStartTimeZone: 'Pacific Standard Time' }] });
    assert.equal(url.searchParams.get('startDateTime'), new Date('2026-09-01T00:00:00').toISOString());
    return response({ value: [timed, timed], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars/calendar/calendarView?$skiptoken=next' });
  });
  assert.deepEqual(await provider.connect(), outlook);
  const snapshots = await provider.fetchSnapshot(outlook, window, [{ id: 'disabled', accountId: outlook.id, name: 'Disabled', syncEnabled: false }]);
  assert.equal(snapshots[0].calendar.color, '#0078D4'); assert.equal(snapshots[1].events.length, 0);
  const cache = reconcileExternal({ ...emptyExternalCache(), accounts: [outlook] }, snapshots, window, now);
  assert.equal(cache.events.length, 2); assert.equal(cache.events[1].start, '2026-09-30');
  assert.equal(urls.length, 6);
});

test('Outlook updates, cancellations and omitted deletions replace only that account snapshot', async () => {
  const fixture = authFixture(); let rows: unknown[] = [timed];
  const provider = createOutlookProvider(fixture.auth, async input => {
    const url = String(input);
    return url.includes('userinfo') ? response({ sub: 'one' }) : url.includes('calendarView') ? response({ value: rows }) : response({ value: [{ id: 'one', name: 'Work' }] });
  });
  let cache = reconcileExternal(connected(), [{ calendar, events: [event] }], window, now, google.id);
  const sync = async () => { cache = reconcileExternal(cache, await provider.fetchSnapshot(outlook, window), window, now, outlook.id); };
  await sync(); rows = [{ ...timed, subject: 'Changed' }]; await sync();
  assert.equal(cache.events.at(-1)?.title, 'Changed');
  rows = [{ id: timed.id, isCancelled: true }]; await sync(); assert.equal(cache.events.length, 1);
  rows = [timed]; await sync(); rows = []; await sync(); assert.equal(cache.events.length, 1);
  assert.equal(cache.events[0].accountId, google.id);
});

test('Outlook rejects bad pages, hostile pagination, revoked consent and account mismatch without returning a partial snapshot', async () => {
  for (const failure of ['hostile', 'malformed', 'loop', '401', '403', '429', '500', 'identity']) {
    const fixture = authFixture(); let calls = 0;
    const provider = createOutlookProvider(fixture.auth, async input => {
      calls++; const url = String(input);
      assert.ok(!url.includes('attacker'));
      if (url.includes('userinfo')) return response({ sub: failure === 'identity' ? 'wrong' : 'one' });
      if (/^\d+$/.test(failure)) return response({ error: 'secret-details' }, Number(failure));
      if (failure === 'malformed') return response({});
      return response({ value: [], '@odata.nextLink': failure === 'hostile' ? 'https://attacker.example/v1.0/me/calendars' : url });
    });
    await assert.rejects(provider.fetchSnapshot(outlook, window), error => error instanceof Error && !error.message.includes('secret-details'));
    assert.ok(calls <= 2);
  }
});

test('Outlook reports sanitized Graph HTTP/provider failures without conflating them with a missing credential', async () => {
  for (const [status, code, expected] of [[401, 'InvalidAuthenticationToken', /rejected the access token.*401.*InvalidAuthenticationToken/i], [403, 'ErrorAccessDenied', /denied calendar access.*403.*ErrorAccessDenied/i], [429, 'TooManyRequests', /rate limit.*429.*TooManyRequests/i], [500, 'InternalServerError', /request failed.*500.*InternalServerError/i]] as const) {
    const fixture = authFixture();
    const auth = { ...fixture.auth, diagnostic: () => ({ stage: 'token-exchange' as const, grantedScopes: ['openid', 'calendars.read'], expiresAt: '2026-09-30T09:00:00.000Z', tokenPresent: true }) };
    const provider = createOutlookProvider(auth, async input => String(input).includes('userinfo')
      ? response({ sub: 'one' }) : response({ error: { code, message: 'provider details must not surface' } }, status));
    await assert.rejects(provider.fetchSnapshot(outlook, window), error => error instanceof Error && expected.test(error.message) && !error.message.includes('provider details')
      && (!(error instanceof CalendarAuthError) || (error.diagnostic?.endpoint === '/v1.0/me/calendars' && error.diagnostic.providerCode === code && error.diagnostic.tokenPresent)));
  }
  const unavailable: CalendarAuth = { ...authFixture().auth, accessToken: async () => { throw new CalendarAuthError('expired'); } };
  const sessions = createAccountSessions(unavailable, createMemoryTokenVault());
  await assert.rejects(sessions.token(outlook.id), /No active calendar authorization/);
});

test('Outlook keeps the initial Graph 401 diagnostics while invalidating only the rejected stored credential', async () => {
  const fixture = authFixture();
  const vault = createMemoryTokenVault();
  const received: boolean[] = [];
  let revoked = false;
  const auth: CalendarAuth = {
    ...fixture.auth,
    accessToken: async () => {
      if (revoked) throw new CalendarAuthError('revoked');
      return 'one';
    },
    invalidate: async value => { await fixture.auth.invalidate(value); revoked = true; },
    diagnostic: () => ({ stage: 'token-exchange', grantedScopes: ['https://graph.microsoft.com/calendars.read'], expiresAt: '2026-09-30T09:00:00.000Z', tokenPresent: true }),
  };
  const provider = createOutlookProvider(auth, async (input, init) => {
    const url = new URL(String(input));
    const authorization = (init?.headers as Record<string, string>).Authorization;
    received.push(authorization === 'Bearer one');
    if (url.pathname === '/oidc/userinfo') return response({ sub: 'one' });
    return response({ error: { code: 'InvalidAuthenticationToken', innerError: { code: 'TokenExpired' }, message: 'must never be surfaced' } }, 401, { 'content-type': 'application/json; charset=utf-8' });
  }, vault);
  const account = await provider.connect();
  let first: CalendarAuthError | undefined;
  await assert.rejects(provider.fetchSnapshot(account, window), error => {
    if (error instanceof CalendarAuthError) first = error;
    return error instanceof CalendarAuthError;
  });
  assert.deepEqual(received, [true, true, true]);
  assert.deepEqual(first?.diagnostic, {
    stage: 'graph-request', endpoint: '/v1.0/me/calendars', host: 'graph.microsoft.com', httpStatus: 401,
    providerCode: 'InvalidAuthenticationToken', providerInnerCode: 'TokenExpired', responseContentType: 'application/json', responseBodyState: 'readable',
    grantedScopes: ['https://graph.microsoft.com/calendars.read'], expiresAt: '2026-09-30T09:00:00.000Z', tokenPresent: true,
    exchangedTokenMatchesStored: true, sentTokenMatchesStored: true,
  });
  assert.doesNotMatch(first?.message ?? '', /must never be surfaced/);
  await assert.rejects(provider.fetchSnapshot(account, window), error => error instanceof CalendarAuthError && error.diagnostic?.stage === 'credential-lookup' && error.diagnostic.tokenPresent === false);
  assert.deepEqual(fixture.invalidated, ['one']);
});

test('Outlook config is safe when missing; allows only configured public redirect flows and no write scopes', () => {
  const config = { clientId: '11111111-1111-1111-1111-111111111111', redirectUri: 'https://app.example.com/oauth/microsoft' };
  assert.equal(outlookAvailability({}, 'web').configured, false);
  assert.equal(outlookAvailability(config, 'web').configured, true);
  assert.equal(outlookAvailability({ ...config, redirectUri: 'http://attacker.example/oauth/microsoft' }, 'web').configured, false);
  assert.equal(outlookAvailability({ ...config, tenant: '../attacker' }, 'web').configured, false);
  assert.equal(outlookAvailability({ ...config, redirectUri: 'lifecommand://oauth/microsoft' }, 'ios').configured, true);
  assert.equal(outlookAvailability(config, 'ios', true).configured, false);
  assert.deepEqual(OUTLOOK_SCOPES, ['openid', 'profile', 'email', 'https://graph.microsoft.com/Calendars.Read']);
});

test('Outlook auth opens a prepared request on the user gesture, checks scopes/expiry and cancels late results after reset', async () => {
  let opened = false; let resolve!: (value: OutlookToken) => void; let clock = 1000;
  const auth = createOutlookAuth({ configured: true, reason: '' }, async () => ({ authorize: () => { opened = true; return new Promise(done => { resolve = done; }); } }), () => clock);
  await auth.prepare(); const pending = auth.authorize(); assert.equal(opened, true);
  resolve({ accessToken: 'one', expiresIn: 3600, scope: 'Calendars.Read' }); assert.equal(await pending, 'one');
  assert.deepEqual(auth.diagnostic?.(), { stage: 'token-exchange', grantedScopes: ['calendars.read'], expiresAt: '1970-01-01T00:59:31.000Z', tokenPresent: true });
  assert.equal(await auth.accessToken(), 'one'); clock += 3_569_000; assert.equal(await auth.accessToken(), 'one'); clock += 1_000; await assert.rejects(auth.accessToken(), CalendarAuthError);
  await auth.prepare(); const legacy = auth.authorize(); resolve({ accessToken: 'legacy', expiresIn: 3600, scope: 'Calendars.ReadBasic' }); await assert.rejects(legacy, /Grant/);
  await auth.prepare(); const partial = auth.authorize(); resolve({ accessToken: 'bad', expiresIn: 3600, scope: 'openid' }); await assert.rejects(partial, /Grant/);
  await auth.prepare(); const reset = auth.authorize(); await auth.forget(); resolve({ accessToken: 'late', expiresIn: 3600, scope: 'Calendars.Read' }); await assert.rejects(reset, /cleared/);
  await assert.rejects(auth.accessToken(), CalendarAuthError);
  await assert.rejects(createOutlookAuth({ configured: false, reason: 'Missing config' }, async () => { throw Error('Should not load'); }).prepare(), /Missing config/);
});
