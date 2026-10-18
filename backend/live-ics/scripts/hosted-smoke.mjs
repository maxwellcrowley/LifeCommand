// Explicit operator invocation only. Use two disposable accounts and a public
// synthetic calendar you control. Values must come from a private environment.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const names=['LIVE_ICS_SMOKE_API','SUPABASE_URL','SUPABASE_ANON_KEY','LIVE_ICS_SMOKE_EMAIL_A','LIVE_ICS_SMOKE_PASSWORD_A','LIVE_ICS_SMOKE_EMAIL_B','LIVE_ICS_SMOKE_PASSWORD_B','LIVE_ICS_SMOKE_FEED'];
const missing=names.filter(name=>!process.env[name]);
if(missing.length){console.error('Missing smoke-test configuration names: '+missing.join(', '));process.exit(1);}
const env=process.env;
for(const name of ['LIVE_ICS_SMOKE_API','SUPABASE_URL','LIVE_ICS_SMOKE_FEED'])if(new URL(env[name]).protocol!=='https:')throw Error('Smoke tests require HTTPS endpoints.');
const login=async suffix=>{
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:env[`LIVE_ICS_SMOKE_EMAIL_${suffix}`],password:env[`LIVE_ICS_SMOKE_PASSWORD_${suffix}`]}),signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,'disposable sign-in');return response.json();
};
let a,id;
const request=(token,path='',method='GET',body)=>fetch(`${env.LIVE_ICS_SMOKE_API}/v1/calendars${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)});
try {
  a=await login('A');const b=await login('B');assert.notEqual(a.user.id,b.user.id,'independent test identities');
  assert.equal((await request('invalid')).status,401);
  id=randomUUID();const created=await request(a.access_token,'','POST',{id,name:'Disposable ICS smoke',color:'#557D78',url:env.LIVE_ICS_SMOKE_FEED});assert.equal(created.status,200,'initial validated connection');
  const row=await created.json();assert.ok(row.lastSuccess);assert.equal(row.url,undefined);assert.ok(!JSON.stringify(row).includes(env.LIVE_ICS_SMOKE_FEED));
  for(const target of [id,randomUUID()])assert.equal((await request(b.access_token,`/${target}/refresh`,'POST',{})).status,404);
  const rest=(token,path,method='GET',body)=>fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  const isolated=await rest(b.access_token,`live_ics_connections?select=id&id=eq.${id}`);assert.equal(isolated.status,200);assert.deepEqual(await isolated.json(),[]);
  assert.ok((await rest(a.access_token,'secrets?select=*')).status>=400,'secret table not exposed');
  assert.ok((await rest(a.access_token,`live_ics_connections?id=eq.${id}`,'PATCH',{name:'bypass'})).status>=400,'direct DML denied');
  const edited=await request(a.access_token,`/${id}`,'PATCH',{name:'Disposable renamed',color:'#3978C5',visible:false,revision:row.revision});assert.equal(edited.status,200);
  assert.equal((await request(a.access_token,`/${id}/refresh`,'POST',{})).status,429,'manual cooldown');
  assert.equal((await request(a.access_token,`/${id}`,'DELETE')).status,204);assert.equal((await request(a.access_token,`/${id}`,'DELETE')).status,204);
  console.log('PASS hosted authentication, initial feed, owner isolation, read-only grants, metadata, cooldown and idempotent deletion. Device acceptance remains separate.');
}catch{console.error('Hosted smoke failed. Inspect status-only diagnostics privately; do not log tokens, URLs, request bodies or provider content.');process.exitCode=1;}
finally{if(a&&id)await request(a.access_token,`/${id}`,'DELETE').catch(()=>{console.error('Cleanup could not be confirmed; remove the disposable smoke connection through Settings.');process.exitCode=1;});}
