import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveIcsClient, liveIcsEndpoint, parseLiveCalendars, LIVE_ICS_KEY } from '../src/calendar/liveIcsClient';
import { accountStorage } from '../src/data/accountStorage';
import { createRepository } from '../src/data/storage';
const row = { id: 'calendar', name: 'Synthetic', color: '#557D78', hostname: 'calendar.example.com', revision: 1, visible: true, timeFormat: 2,
  lastSuccess: '2026-10-18T12:00:00Z', coverage: { from: '2026-09-17', through: '2027-01-17' }, events: [] };
test('live ICS cache whitelists metadata; secrets and arbitrary provider errors cannot persist', () => {
  const result = parseLiveCalendars([{ ...row, url: 'sensitive-address', secret: 'sensitive-secret', error: 'sensitive-provider-error', coverage: { ...row.coverage, url: 'sensitive-address' } }]);
  assert.ok(!JSON.stringify(result).includes('sensitive'));
  assert.deepEqual(parseLiveCalendars(JSON.parse(JSON.stringify(result))), result);
  assert.equal(parseLiveCalendars([row])[0].events.length, 0);
  assert.throws(() => parseLiveCalendars([{ ...row, events: [{ accountId: 'someone-else' }] }]));
  for (const value of ['http://example.com','https://user:pass@example.com','https://example.com/?secret=1']) assert.equal(liveIcsEndpoint(value), undefined);
});
test('submitted URL is HTTPS API body only; errors redacted; aborted account response cannot start fetch', async () => {
  let count=0;
  const client=createLiveIcsClient('https://api.example.com',async () => 'synthetic-token',async (url,options) => {
    count++; assert.equal(String(url),'https://api.example.com/v1/calendars');assert.ok(String(options?.body).includes('private-fixture'));
    return new Response(JSON.stringify({error:'provider error with private-fixture'}),{status:502});
  });
  await assert.rejects(client('','POST',{url:'https://calendar.example.com/private-fixture'}), error => !String(error).includes('private-fixture'));
  const controller=new AbortController();controller.abort();await assert.rejects(client('','POST',{},controller.signal));assert.equal(count,1);
});
test('account caches survive offline startup separately, exports/imports never transfer subscriptions', async () => {
  const values=new Map<string,string>();
  const storage={getItem:async (key:string)=>values.get(key)??null,setItem:async(key:string,value:string)=>{values.set(key,value);},removeItem:async(key:string)=>{values.delete(key);},getAllKeys:async()=>[...values.keys()]};
  const a=accountStorage(storage,'A'),b=accountStorage(storage,'B');
  await a.setItem(LIVE_ICS_KEY,JSON.stringify([row]));
  assert.equal(await b.getItem(LIVE_ICS_KEY),null);
  assert.equal(parseLiveCalendars(JSON.parse((await a.getItem(LIVE_ICS_KEY))!))[0].name,'Synthetic');
  const repo=createRepository(a);await repo.loadAppData();const exported=await repo.exportAppData();
  assert.ok(!exported.includes('calendar.example.com'));await repo.importAppData(exported);assert.ok(await a.getItem(LIVE_ICS_KEY));
  await repo.resetAppData();assert.equal(await a.getItem(LIVE_ICS_KEY),null);
});
