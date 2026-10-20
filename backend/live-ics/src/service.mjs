import { randomUUID } from 'node:crypto';
import { feedURL, fetchFeed } from './transport.mjs';
import { parseFeed } from './parser.mjs';
import { fail, safeCode } from './errors.mjs';
const uuid = value => typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
const coverage = () => { const d = new Date(); const day = offset => new Date(d.getTime() + offset * 86400000).toISOString().slice(0,10); return { from: day(-31), through: day(91), timeFormat: 2 }; };
const safe = row => ({ id: row.id, name: row.name, color: row.color, visible: row.visible, hostname: row.hostname,
  revision: row.revision, lastAttempt: row.last_attempt?.toISOString(), lastSuccess: row.last_success?.toISOString(),
  nextAttempt: row.next_attempt?.toISOString(), timeFormat: row.coverage?.timeFormat,
  error: row.error || (row.coverage?.timeFormat === 2 ? undefined : 'time_revalidation'), coverage: row.coverage,
  events: row.coverage?.timeFormat === 2 ? row.events ?? [] : [] });
function metadata(body) {
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80 || !/^#[\da-f]{6}$/i.test(body.color)) fail('invalid_fields');
  return { name: body.name.trim(), color: body.color };
}
export function createService({ pool, box, transport = fetchFeed, parser = parseFeed }) {
  const transaction = async fn => { const c = await pool.connect(); try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); } };
  const row = async (c, owner, id, lock = false) => (await c.query(`select * from public.live_ics_connections where owner_id=$1 and id=$2${lock ? ' for update' : ''}`, [owner,id])).rows[0];
  const budget = async (c, owner, fetching = false) => {
    // Serialize all user mutations/quota checks, including simultaneous creates.
    await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [owner]);
    await c.query('insert into live_ics_private.budgets(owner_id) values($1) on conflict do nothing',[owner]);
    const result = await c.query(`update live_ics_private.budgets set
      requests=case when window_start < now()-interval '1 minute' then 1 else requests+1 end,
      window_start=case when window_start < now()-interval '1 minute' then now() else window_start end,
      fetches=case when fetch_start < now()-interval '1 minute' then $2 else fetches+$2 end,
      fetch_start=case when fetch_start < now()-interval '1 minute' then now() else fetch_start end
      where owner_id=$1 and (requests<120 or window_start<now()-interval '1 minute')
      and ($2=0 or fetches<10 or fetch_start<now()-interval '1 minute') returning owner_id`, [owner,fetching ? 1 : 0]);
    if (!result.rowCount) fail('rate_limited',429);
  };
  const list = async owner => transaction(async c => { await budget(c,owner); return (await c.query('select * from public.live_ics_connections where owner_id=$1 and ready order by name,id',[owner])).rows.map(safe); });
  const remove = async (owner,id) => transaction(async c => {
    if (!uuid(id)) fail('not_found',404); await budget(c,owner);
    await c.query('insert into live_ics_private.deleted(owner_id,id) values($1,$2) on conflict do nothing',[owner,id]);
    await c.query('delete from public.live_ics_connections where owner_id=$1 and id=$2',[owner,id]);
  });
  const edit = async (owner,id,body) => transaction(async c => {
    if (!uuid(id)) fail('not_found',404); const values=metadata(body); await budget(c,owner);
    if (typeof body.visible !== 'boolean') fail('invalid_fields');
    const current=await row(c,owner,id,true); if (!current?.ready) fail('not_found',404);
    if (body.revision !== current.revision) fail('changed',409);
    return safe((await c.query(`update public.live_ics_connections set name=$3,color=$4,visible=$5,revision=revision+1
      where owner_id=$1 and id=$2 returning *`,[owner,id,values.name,values.color,body.visible])).rows[0]);
  });
  const refresh = async (owner,id,body={},mode='refresh') => {
    if (!uuid(id)) fail('not_found',404);
    const replacing = mode === 'replace', creating = mode === 'create';
    const values=creating ? metadata(body) : undefined;
    const submitted=creating || replacing ? feedURL(body.url).href : undefined;
    const job=await transaction(async c => {
      await budget(c,owner);
      let current=await row(c,owner,id,true);
      if (creating && current?.ready) return { done: safe(current) }; // idempotency key
      if (!creating && !current?.ready) fail('not_found',404);
      if (creating && !current) {
        await c.query('delete from public.live_ics_connections where owner_id=$1 and not ready and lease_until<now()',[owner]);
        if ((await c.query('select 1 from live_ics_private.deleted where owner_id=$1 and id=$2',[owner,id])).rowCount) fail('changed',409);
        const count=await c.query('select count(*)::int n from public.live_ics_connections where owner_id=$1',[owner]);
        if (count.rows[0].n>=10) fail('connection_limit');
        current=(await c.query(`insert into public.live_ics_connections(owner_id,id,name,color,generation)
          values($1,$2,$3,$4,$5) returning *`,[owner,id,values.name,values.color,randomUUID()])).rows[0];
      }
      if (current.lease_until > new Date() && !replacing) fail('refreshing',409);
      if (current.next_attempt > new Date()) fail('cooldown',429);
      if (replacing && body.revision !== current.revision) fail('changed',409);
      if (body.automatic && current.coverage?.timeFormat === 2 && current.last_success && Date.now()-current.last_success.getTime()<15*60000) return { done:safe(current) };
      await budget(c,owner,true);
      const lease=randomUUID(), generation=replacing ? randomUUID() : current.generation;
      const slot=await c.query(`update live_ics_private.slots set lease=$1,lease_until=now()+interval '40 seconds'
        where id=(select id from live_ics_private.slots where lease_until is null or lease_until<now() order by id for update skip locked limit 1) returning id`,[lease]);
      if (!slot.rowCount) fail('capacity',503);
      const secret=(await c.query('select * from live_ics_private.secrets where owner_id=$1 and id=$2',[owner,id])).rows[0];
      await c.query(`update public.live_ics_connections set generation=$3,lease=$4,lease_until=now()+interval '40 seconds',
        last_attempt=now(),next_attempt=now()+interval '1 minute' where owner_id=$1 and id=$2`,[owner,id,generation,lease]);
      return { current, lease, generation, secret };
    });
    if (job.done) return job.done;
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),28000);
    try {
      const url=submitted ?? box.open(job.secret.secret,owner,id), window=coverage();
      const sameCoverage=JSON.stringify(window)===JSON.stringify(job.current.coverage);
      const conditional=!replacing && !creating && job.current.events !== null && sameCoverage && !!(job.secret?.etag || job.secret?.modified);
      let result=await transport(url,conditional ? {etag:job.secret.etag,modified:job.secret.modified} : {},controller.signal);
      if (result.unchanged && !conditional) result=await transport(url,{},controller.signal);
      if (result.unchanged && !conditional) fail('invalid_feed');
      const events=result.unchanged ? job.current.events : await parser(result.text,{id,name:job.current.name,color:job.current.color},window,new Date(),{signal:controller.signal});
      // A malicious provider must not echo the subscription credential back in
      // an event UID/title. Reject rather than corrupt stable event identities.
      if (JSON.stringify(events).includes(url)) fail('invalid_feed');
      return await transaction(async c => {
        const current=await row(c,owner,id,true);
        if (!current || current.generation!==job.generation || current.lease!==job.lease || current.lease_until < new Date()) fail('changed',409);
        const secret=box.seal(url,owner,id);
        await c.query(`insert into live_ics_private.secrets(owner_id,id,secret,etag,modified) values($1,$2,$3,$4,$5)
          on conflict(owner_id,id) do update set secret=excluded.secret,etag=excluded.etag,modified=excluded.modified`,[owner,id,secret,result.unchanged ? job.secret.etag : result.etag ?? null,result.unchanged ? job.secret.modified : result.modified ?? null]);
        const saved=(await c.query(`update public.live_ics_connections set ready=true,hostname=$3,events=$4,coverage=$5,
          last_success=now(),error=null,failures=0,lease=null,lease_until=null,revision=revision+1
          where owner_id=$1 and id=$2 returning *`,[owner,id,new URL(url).hostname,JSON.stringify(events),window])).rows[0];
        return safe(saved);
      });
    } catch(error) {
      await transaction(async c => {
        await c.query(`update public.live_ics_connections set error=$5,failures=least(failures+1,6),
          next_attempt=now()+make_interval(secs=>least(3600,60*power(2,least(failures,6)))::int),lease=null,lease_until=null
          where owner_id=$1 and id=$2 and generation=$3 and lease=$4`,[owner,id,job.generation,job.lease,safeCode(error)]);
        // Failed initial validation isn't a connected calendar or a quota leak.
        await c.query('delete from public.live_ics_connections where owner_id=$1 and id=$2 and not ready and generation=$3 and lease is null',[owner,id,job.generation]);
      });
      throw error;
    } finally { clearTimeout(deadline); controller.abort(); await pool.query('update live_ics_private.slots set lease=null,lease_until=null where lease=$1',[job.lease]); }
  };
  return { list, remove, edit, refresh };
}
