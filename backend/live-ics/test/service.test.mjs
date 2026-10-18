import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createService } from '../src/service.mjs';
import { createServer, supabaseIdentity } from '../src/server.mjs';
import { secretBox } from '../src/secrets.mjs';
import { SafeError } from '../src/errors.mjs';
const connectionString=process.env.LIVE_ICS_TEST_DATABASE_URL??'postgres://postgres:disposable-local-ics-only@127.0.0.1:55438/live_ics_test';
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const box=secretBox({v1:Buffer.alloc(32,1).toString('base64')},'v1');
const feed='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event\r\nDTSTART;VALUE=DATE:'+new Date().toISOString().slice(0,10).replaceAll('-','')+'\r\nSUMMARY:Fixture\r\nEND:VEVENT\r\nEND:VCALENDAR';
const body=id=>({id,name:'Synthetic',color:'#557D78',url:'https://calendar.example.com/private-fixture'});
test('authentication implementation verifies the token with the fixed Supabase authority',async()=>{
  const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://project.example.com/auth/v1/user');assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(options.redirect,'error');return new Response(JSON.stringify({id:A}),{status:200});};
    const identity=supabaseIdentity('https://project.example.com','public-fixture');assert.equal(await identity('synthetic-token'),A);assert.equal(calls,1);
    globalThis.fetch=async()=>new Response('{}',{status:401});await assert.rejects(identity('synthetic-token'),/sign_in/);
    await assert.rejects(identity(undefined),/sign_in/);
  }finally{globalThis.fetch=original;}
});
test('local PostgreSQL: RLS, owner API, encrypted storage, retries, refresh races and atomic snapshots', {timeout:30000},async t=>{
  const admin=new pg.Pool({connectionString}),pool=new pg.Pool({connectionString,options:'-c role=live_ics_backend'});
  let transport=async()=>({text:feed,etag:'"one"'}),fetches=0;
  const service=createService({pool,box,transport:async(...args)=>{fetches++;return transport(...args);}});
  const unlock=async id=>admin.query('update public.live_ics_connections set next_attempt=null where owner_id=$1 and id=$2',[A,id]);
  try {
    await admin.query('truncate public.live_ics_connections,live_ics_private.budgets,live_ics_private.deleted cascade');
    await admin.query('update live_ics_private.slots set lease=null,lease_until=null');
    const id=randomUUID();let created;
    await t.test('create is accepted only after parse; duplicate request returns one persisted result',async()=>{
      created=await service.refresh(A,id,body(id),'create');assert.equal(created.events.length,1);
      const before=fetches;assert.equal((await service.refresh(A,id,body(id),'create')).id,id);assert.equal(fetches,before);
      assert.equal((await service.list(A)).length,1);assert.deepEqual(await service.list(B),[]);
      const stored=(await admin.query('select secret from live_ics_private.secrets where id=$1',[id])).rows[0].secret;
      assert.ok(!JSON.stringify(stored).includes('private-fixture'));assert.equal(box.open(stored,A,id),body(id).url);
      assert.ok(!JSON.stringify(created).includes('private-fixture'));
    });
    await t.test('direct client database reads are owner-filtered; secret access and DML denied',async()=>{
      const c=await admin.connect();try {
        await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);
        assert.equal((await c.query('select id,events from public.live_ics_connections')).rowCount,0);
        await c.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);assert.equal((await c.query('select id,events from public.live_ics_connections')).rowCount,1);
        await assert.rejects(c.query('select * from live_ics_private.secrets'),/permission denied/);
        await assert.rejects(c.query('delete from public.live_ics_connections'),/permission denied/);
        await c.query('set role anon');await assert.rejects(c.query('select id from public.live_ics_connections'),/permission denied/);
      } finally {await c.query('reset role');c.release();}
    });
    await t.test('API auth, cross-owner indistinguishability, body owner ignored, no private errors',async()=>{
      const server=createServer({service,identity:async token=>{if(token==='identity-A')return A;if(token==='identity-B')return B;throw new SafeError('sign_in',401);}});
      await new Promise(r=>server.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${server.address().port}/v1/calendars`;
      try {
        assert.equal((await fetch(endpoint)).status,401);
        for(const target of [id,randomUUID()]) {const r=await fetch(`${endpoint}/${target}/refresh`,{method:'POST',headers:{authorization:'Bearer identity-B','content-type':'application/json'},body:JSON.stringify({owner_id:A})});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'not_found'});}
        const r=await fetch(endpoint,{headers:{authorization:'Bearer identity-A'}});assert.equal(r.status,200);assert.ok(!(await r.text()).includes('private-fixture'));
      } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
    });
    await t.test('metadata revision, visibility, failed replacement and provider failures keep snapshot',async()=>{
      created=await service.edit(A,id,{name:'Renamed',color:'#3978C5',visible:false,revision:created.revision});assert.equal(created.visible,false);
      await assert.rejects(service.edit(A,id,{name:'Old',color:'#3978C5',visible:true,revision:1}),/changed/);
      await unlock(id);transport=async()=>{throw new SafeError('provider_denied');};
      await assert.rejects(service.refresh(A,id,{url:'https://calendar.example.com/new-private',revision:created.revision},'replace'),/provider_denied/);
      const after=(await service.list(A))[0];assert.deepEqual(after.events,created.events);assert.equal(after.lastSuccess,created.lastSuccess);assert.equal(after.error,'provider_denied');
      assert.equal(box.open((await admin.query('select secret from live_ics_private.secrets where id=$1',[id])).rows[0].secret,A,id),body(id).url);
    });
    await t.test('conditional 304 retains events; invalid feed retains; valid empty clears',async()=>{
      await unlock(id);transport=async(_url,v)=>{assert.equal(v.etag,'"one"');return {unchanged:true};};await service.refresh(A,id);
      await unlock(id);transport=async()=>({text:'malformed'});await assert.rejects(service.refresh(A,id),/invalid_feed/);assert.equal((await service.list(A))[0].events.length,1);
      await unlock(id);transport=async()=>({text:'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'});await service.refresh(A,id);assert.equal((await service.list(A))[0].events.length,0);
      await unlock(id);transport=async()=>({unchanged:true});const before=fetches;await assert.rejects(service.refresh(A,id),/invalid_feed/);assert.equal(fetches-before,2,'a snapshot without validators cannot accept unsolicited 304');
    });
    await t.test('cross-instance coalescing and delete during refresh cannot resurrect',async()=>{
      await unlock(id);let release,entered;const started=new Promise(r=>entered=r);
      transport=()=>{entered();return new Promise(r=>release=r);};const pending=service.refresh(A,id);await started;
      await assert.rejects(service.refresh(A,id),/refreshing/);await service.remove(A,id);release({text:feed});await assert.rejects(pending,/changed/);
      assert.deepEqual(await service.list(A),[]);assert.equal((await admin.query('select * from live_ics_private.secrets where id=$1',[id])).rowCount,0);
      await service.remove(A,id);await assert.rejects(service.refresh(A,id,body(id),'create'),/changed/);
    });
    await t.test('initial missing-cache 304 is retried then rejected, no connection saved',async()=>{
      transport=async()=>({unchanged:true});const missing=randomUUID();const before=fetches;
      await assert.rejects(service.refresh(A,missing,body(missing),'create'),/invalid_feed/);assert.equal(fetches-before,2);assert.deepEqual(await service.list(A),[]);
    });
    await t.test('expired lease can be recovered; older refresh cannot overwrite replacement',async()=>{
      await admin.query('update live_ics_private.budgets set fetches=0,requests=0');
      transport=async()=>({text:feed});const id=randomUUID();const initial=await service.refresh(A,id,body(id),'create');
      await unlock(id);let release,entered;const started=new Promise(r=>entered=r);
      transport=()=>{entered();return new Promise(r=>release=r);};const old=service.refresh(A,id);await started;
      await admin.query("update public.live_ics_connections set lease_until=now()-interval '1 second',next_attempt=null where id=$1",[id]);
      transport=async()=>({text:feed.replace('SUMMARY:Fixture','SUMMARY:Replacement')});
      await service.refresh(A,id,{url:'https://calendar.example.com/replaced',revision:initial.revision},'replace');
      release({text:feed});await assert.rejects(old,/changed/);
      const saved=(await service.list(A)).find(row=>row.id===id);assert.equal(saved.events[0].title,'Replacement');
      assert.equal(box.open((await admin.query('select secret from live_ics_private.secrets where id=$1',[id])).rows[0].secret,A,id),'https://calendar.example.com/replaced');
      await service.remove(A,id);
    });
    await t.test('server limits enforce cooldown, global capacity and durable user budget',async()=>{
      await admin.query('update live_ics_private.budgets set fetches=0,requests=0');transport=async()=>({text:feed});
      const id=randomUUID();await service.refresh(A,id,body(id),'create');await assert.rejects(service.refresh(A,id),/cooldown/);
      await unlock(id);await admin.query("update live_ics_private.slots set lease_until=now()+interval '1 minute'");
      try {await assert.rejects(service.refresh(A,id),/capacity/);} finally {await admin.query('update live_ics_private.slots set lease_until=null');}
      await admin.query('update live_ics_private.budgets set fetches=10,fetch_start=now() where owner_id=$1',[A]);
      await assert.rejects(service.refresh(A,id),/rate_limited/);assert.equal((await service.list(A))[0].events.length,1);await service.remove(A,id);
    });
    await t.test('connection quota survives independent requests and metadata cannot bypass it',async()=>{
      await admin.query('update live_ics_private.budgets set fetches=0,requests=0');transport=async()=>({text:'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR'});
      const ids=Array.from({length:10},()=>randomUUID());for(const id of ids)await service.refresh(A,id,body(id),'create');
      const extra=randomUUID();await assert.rejects(service.refresh(A,extra,body(extra),'create'),/connection_limit/);
      assert.equal((await service.list(A)).length,10);assert.deepEqual(await service.list(B),[]);
      for(const id of ids)await service.remove(A,id);
    });
  } finally {await pool.end();await admin.end();}
});
