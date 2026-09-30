import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountSessions, type CalendarAuth } from '../src/calendar/auth';
import { createStoredTokenVault } from '../src/calendar/tokenVault';
import { googleAvailability } from '../src/calendar/googleAuth';
import { outlookAvailability } from '../src/calendar/outlookAuth';
import { createDefaultAppData } from '../src/domain/defaults';
import { createExport, validateImport } from '../src/domain/transfer';
import { calendarDays, eventsOnDate, eventSourceLabel } from '../src/domain/events';
import { selectAmbient } from '../src/domain/ambient';
import { emptyExternalCache, reconcileExternal, visibleExternalEvents, type ExternalAccount } from '../src/domain/externalCalendars';

const account = (id: string): ExternalAccount => ({ id, provider: 'google', mode: 'google', label: `${id}@example.com`, syncEnabled: true });
function fixture() {
  const records = new Map<string, string>();
  const storage = { getItem: async (key: string) => records.get(key) ?? null, setItem: async (key: string, value: string) => { records.set(key, value); }, removeItem: async (key: string) => { records.delete(key); } };
  let selected = 'one';
  const auth: CalendarAuth = { prepare: async () => {}, authorize: async () => `secret-${selected}`, accessToken: async () => { throw Error('Reconnect'); }, invalidate: async () => {}, forget: async () => {} };
  return { records, storage, auth, select: (id: string) => { selected = id; }, vault: () => createStoredTokenVault(storage, 'google') };
}

test('missing provider configuration gives an end-user message on every platform', () => {
  for (const platform of ['web', 'ios', 'android']) for (const result of [googleAvailability({}, platform), outlookAvailability({}, platform)]) {
    assert.equal(result.configured, false);
    assert.match(result.reason, /Calendar provider not configured in this build/);
    assert.doesNotMatch(result.reason, /client ID|developer project|environment/);
  }
});

test('private token vault restores account-bound sessions and removes only the disconnected account', async () => {
  const f = fixture(); const first = createAccountSessions(f.auth, f.vault(), () => 1000);
  await first.connect(async () => account('one'));
  f.select('two'); await first.connect(async () => account('two'));
  const restarted = createAccountSessions(f.auth, f.vault(), () => 2000);
  assert.equal(await restarted.token('one'), 'secret-one');
  assert.equal(await restarted.token('two'), 'secret-two');
  await restarted.disconnect('one');
  await assert.rejects(restarted.token('one'), /Reconnect/);
  assert.equal(await restarted.token('two'), 'secret-two');
  await restarted.disconnect();
  assert.equal([...f.records.values()].some(value => value.includes('secret-')), false);
});

test('expiry and provider revocation remove stored credentials; no token crosses accounts', async () => {
  const f = fixture(); let now = 1000;
  f.auth.tokenExpiresAt = () => 2000;
  const sessions = createAccountSessions(f.auth, f.vault(), () => now);
  await sessions.connect(async () => account('one'));
  now = 2001;
  await assert.rejects(sessions.token('one'), /expired/);
  assert.equal(await f.vault().get('one'), undefined);
  now = 1000; await sessions.connect(async () => account('one'));
  await sessions.invalidate('secret-one');
  assert.equal(await f.vault().get('one'), undefined);
  await assert.rejects(sessions.connect(async () => account('two'), 'one'), /different account/);
  assert.equal(await f.vault().get('two'), undefined);
});

test('reset during authorization cannot restore credentials; startup prunes orphaned Keychain entries', async () => {
  const f = fixture(); let resolve!: (value: string) => void;
  f.auth.authorize = () => new Promise(done => { resolve = done; });
  const sessions = createAccountSessions(f.auth, f.vault());
  const connecting = sessions.connect(async () => account('one'));
  await sessions.disconnect(); resolve('late-secret');
  await assert.rejects(connecting, /cleared/);
  assert.equal(await f.vault().get('one'), undefined);
  await f.vault().set('orphan', { value: 'orphan-secret', expiresAt: Date.now() + 1000 });
  await f.vault().retain([]);
  assert.equal(await f.vault().get('orphan'), undefined);
});

test('secure storage failure fails closed with a safe message and remains retryable', async () => {
  const f = fixture(); let fail = true;
  const vault = createStoredTokenVault({ ...f.storage, setItem: async (key, value) => { if (fail) throw Error('native error secret-token'); await f.storage.setItem(key, value); } }, 'google');
  const sessions = createAccountSessions(f.auth, vault);
  await assert.rejects(sessions.connect(async () => account('one')), error => error instanceof Error && /securely/.test(error.message) && !error.message.includes('secret-token'));
  fail = false; await sessions.connect(async () => account('one'));
  assert.equal(await sessions.token('one'), 'secret-one');
});

test('OAuth credentials never enter export/import payloads and cannot be injected into AppData', async () => {
  const f = fixture(); await createAccountSessions(f.auth, f.vault()).connect(async () => account('one'));
  const data = createDefaultAppData();
  const exported = createExport(data);
  assert.doesNotMatch(JSON.stringify(exported), /secret-one|accessToken|refreshToken|oauth|externalCalendars/);
  assert.deepEqual(validateImport(JSON.stringify({ ...exported, accessToken: 'injected-secret' })).data, data);
  for (const field of ['accessToken', 'refreshToken', 'externalCalendars']) {
    const injected = { ...data, [field]: 'injected-secret' };
    assert.throws(() => createExport(injected), /unsupported|object/);
    assert.throws(() => validateImport(JSON.stringify({ ...exported, data: injected })), /unsupported|object/);
  }
  assert.equal(await f.vault().get('one').then(token => token?.value), 'secret-one');
});

test('disabled Google and Outlook calendars disappear from Today, Calendar and Ambient; enabling preserves labels', () => {
  const now = new Date('2026-09-30T09:00:00');
  const window = { from: '2026-09-01', through: '2026-10-30' };
  for (const provider of ['google', 'outlook'] as const) {
    const connected: ExternalAccount = { ...account(provider), provider, mode: provider };
    const cache = reconcileExternal({ ...emptyExternalCache(), accounts: [connected] }, [{ calendar: { id: 'shared', name: 'Kellyn family', color: '#31A3A0' }, events: [{ id: 'outing', summary: 'Family outing', start: { date: '2026-09-30' }, end: { date: '2026-10-01' } }] }], window, now);
    cache.calendars[0].family = true;
    for (const enabled of [true, false, true]) {
      cache.calendars[0].syncEnabled = enabled;
      const data = { ...createDefaultAppData(), externalEvents: visibleExternalEvents(cache) };
      const count = enabled ? 1 : 0;
      assert.equal(eventsOnDate(data, '2026-09-30').length, count);
      assert.equal(calendarDays(data, '2026-09-30', '2026-09-30')[0]?.events.length ?? 0, count);
      assert.equal(selectAmbient(data, now).events.total, count);
      if (enabled) assert.match(eventSourceLabel(data.externalEvents[0]), /Kellyn family.*read-only/);
    }
  }
});
