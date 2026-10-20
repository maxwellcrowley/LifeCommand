import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createService } from '../src/service.mjs';
import { createServer } from '../src/server.mjs';
import { SafeError } from '../src/errors.mjs';
import { secretBox } from '../src/secrets.mjs';

const connectionString = process.env.LIVE_ICS_TEST_DATABASE_URL ?? 'postgres://postgres:disposable-local-ics-only@127.0.0.1:55438/live_ics_test';
const A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
test('durable authenticated admission survives rejected HTTP operations across independent instances', { timeout: 30000 }, async () => {
  const admin = new pg.Pool({ connectionString });
  const pools = [0, 1].map(() => new pg.Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, options: '-c role=live_ics_backend' }));
  const id = randomUUID(), servers = [], endpoints = [];
  let providerCalls = 0;
  const box = secretBox({ v1: Buffer.alloc(32, 1).toString('base64') }, 'v1');
  const counts = async owner => (await admin.query('select requests,fetches from live_ics_private.budgets where owner_id=$1', [owner])).rows[0];
  const snapshot = async () => ({
    row: (await admin.query('select * from public.live_ics_connections where owner_id=$1 and id=$2', [A, id])).rows[0],
    secret: (await admin.query('select * from live_ics_private.secrets where owner_id=$1 and id=$2', [A, id])).rows[0],
  });
  const request = (instance, path = '', method = 'GET', body, token = 'A', raw = false) => fetch(endpoints[instance] + path, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  });
  const error = async (r, status, code) => { assert.equal(r.status, status); assert.deepEqual(await r.json(), { error: code }); };
  try {
    await admin.query('delete from live_ics_private.budgets where owner_id=any($1::uuid[])', [[A, B]]);
    for (const pool of pools) {
      const service = createService({ pool, box, transport: async () => { providerCalls++; return { text: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR' }; } });
      const server = createServer({ service, identity: async token => {
        if (token === 'A') return A; if (token === 'B') return B; throw new SafeError('sign_in', 401);
      } });
      await new Promise(r => server.listen(0, '127.0.0.1', r)); servers.push(server);
      endpoints.push(`http://127.0.0.1:${server.address().port}/v1/calendars`);
    }
    const created = await request(0, '', 'POST', { id, owner_id: B, name: 'Admission fixture', color: '#557D78', url: 'https://calendar.example.com/admission-fixture' });
    assert.equal(created.status, 200); assert.equal((await counts(A)).requests, 1, 'exactly one admission for create, independent of outbound budget');
    assert.equal((await request(1)).status, 200); assert.equal((await counts(A)).requests, 2);
    const before = await snapshot(); assert.equal(before.row.owner_id, A);
    await error(await request(0, `/${id}`, 'PATCH', { name: '' }), 400, 'invalid_fields');
    await error(await request(1, '', 'POST', '{', 'A', true), 400, 'invalid_fields');
    await error(await request(0, `/${randomUUID()}/refresh`, 'POST', {}), 404, 'not_found');
    assert.equal((await counts(A)).requests, 5);
    const outcomes = [];
    // At most 20 outstanding requests, split across two separately pooled servers.
    for (let first = 0; first < 130; first += 20) outcomes.push(...await Promise.all(
      Array.from({ length: Math.min(20, 130 - first) }, async (_, offset) => {
        const r = await request((first + offset) % 2, `/${id}/refresh`, 'POST', {});
        assert.equal(r.status, 429); const code = (await r.json()).error;
        if (code === 'rate_limited') assert.ok(Number(r.headers.get('retry-after')) >= 1);
        return code;
      }),
    ));
    assert.equal(outcomes.filter(c => c === 'cooldown').length, 115);
    assert.equal(outcomes.filter(c => c === 'rate_limited').length, 15);
    assert.deepEqual(await counts(A), { requests: 120, fetches: 1 });
    assert.equal(providerCalls, 1); assert.deepEqual(await snapshot(), before, 'business rollback never partially persists');
    // Exhaustion must win even over validation that would otherwise return 400.
    await error(await request(0, '', 'POST', '{', 'A', true), 429, 'rate_limited');
    await error(await request(1, '', 'GET', undefined, 'invalid'), 401, 'sign_in');
    assert.equal((await counts(A)).requests, 120);
    assert.equal((await request(1, '', 'GET', undefined, 'B')).status, 200);
    assert.equal((await counts(B)).requests, 1, 'account B has independent capacity');
    // Deterministic DB-clock rollover, without waiting for the wall clock.
    await admin.query("update live_ics_private.budgets set window_start=clock_timestamp()-interval '61 seconds' where owner_id=$1", [A]);
    assert.equal((await request(0)).status, 200); assert.equal((await counts(A)).requests, 1);
    await admin.query('update live_ics_private.budgets set requests=119,window_start=clock_timestamp() where owner_id=$1', [A]);
    const edge = await Promise.all([request(0), request(1)]);
    assert.deepEqual(edge.map(r => r.status).sort(), [200, 429]); assert.equal((await counts(A)).requests, 120);
    // Outbound budget is separate and still enforced after successful admission.
    await admin.query("update live_ics_private.budgets set requests=0,window_start=clock_timestamp(),fetches=10,fetch_start=clock_timestamp() where owner_id=$1", [A]);
    await admin.query('update public.live_ics_connections set next_attempt=null where owner_id=$1 and id=$2', [A, id]);
    await error(await request(0, `/${id}/refresh`, 'POST', {}), 429, 'rate_limited');
    assert.deepEqual(await counts(A), { requests: 1, fetches: 10 }); assert.equal(providerCalls, 1);
    // A blocked accounting row must fail closed in bounded time, not execute business work.
    const held = await admin.connect();
    try {
      await held.query('begin'); await held.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [A]);
      const started = Date.now(); const pending = request(1, `/${id}/refresh`, 'POST', {});
      assert.equal((await request(0, '', 'GET', undefined, 'B')).status, 200);
      await error(await pending, 503, 'capacity'); assert.ok(Date.now() - started < 4000);
      assert.equal(providerCalls, 1); assert.equal((await counts(A)).requests, 1);
    } finally { await held.query('rollback'); held.release(); }
    const unavailable = new pg.Pool({ connectionString }); await unavailable.end();
    const broken = createServer({ service: createService({ pool: unavailable, box, transport: async () => { providerCalls++; } }), identity: async () => A });
    await new Promise(r => broken.listen(0, '127.0.0.1', r)); servers.push(broken);
    const refused = await fetch(`http://127.0.0.1:${broken.address().port}/v1/calendars/${id}/refresh`, {
      method: 'POST', headers: { authorization: 'Bearer A', 'content-type': 'application/json' }, body: '{}',
    });
    await error(refused, 503, 'unavailable'); assert.equal(providerCalls, 1, 'database failure never bypasses admission');
    assert.equal((await counts(A)).requests, 1);
  } finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await admin.query('delete from public.live_ics_connections where owner_id=$1 and id=$2', [A, id]);
    await Promise.all(pools.map(p => p.end())); await admin.end();
  }
});
