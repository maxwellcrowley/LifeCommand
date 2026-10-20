// Disposable Chrome + local PostgreSQL + real service/parser. Authentication and
// provider responses are synthetic. Never point this harness at hosted accounts.
import assert from 'node:assert/strict';
import { createServer as staticServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, extname, sep, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { createService } from '../src/service.mjs';
import { createServer } from '../src/server.mjs';
import { secretBox } from '../src/secrets.mjs';
import { SafeError } from '../src/errors.mjs';
const app=resolve('../..'),dist=resolve(app,process.env.LIVE_ICS_BROWSER_DIST??'.test-build/live-ics-web'),evidence=resolve(app,'.test-build/live-ics-browser');mkdirSync(evidence,{recursive:true});
const A='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const connectionString='postgres://postgres:disposable-local-ics-only@127.0.0.1:55438/live_ics_test';
const admin=new pg.Pool({connectionString}),pool=new pg.Pool({connectionString,options:'-c role=live_ics_backend'});
let failFeed=false,floatingFeed=false,offline=false,providerCalls=0,holdFeed,feedEntered;
const date=new Date().toISOString().slice(0,10).replaceAll('-','');
const feed=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:browser-fixture\r\nDTSTART;VALUE=DATE:${date}\r\nSUMMARY:Live fixture event\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const floating=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:unsupported-floating\r\nDTSTART:${date}T090000\r\nDTEND:${date}T100000\r\nSUMMARY:Must never render shifted\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const service=createService({pool,box:secretBox({v1:Buffer.alloc(32,1).toString('base64')},'v1'),transport:async()=>{providerCalls++;if(failFeed)throw new SafeError('provider_denied');if(holdFeed){feedEntered?.();await holdFeed;}return {text:floatingFeed?floating:feed};}});
const api=createServer({service,identity:async token=>{if(token===session.access_token)return A;if(token===sessionB.access_token)return B;throw new SafeError('sign_in',401);}});
const user={id:A,email:'disposable@example.com',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const session={access_token:`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:A,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.synthetic`,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
const sessionB={...session,user:{...user,id:B,email:'second@example.com'},access_token:`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:B,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.synthetic`};
const web=staticServer((req,res)=>{let file=resolve(dist,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(dist+sep))file=resolve(dist,'index.html');if(!extname(file))file+='.html';if(!existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'})[extname(file)]??'application/octet-stream');res.end(readFileSync(file));});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let chrome,ws,id=0;const pending=new Map(),errors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
const until=async(fn,label)=>{for(let i=0;i<160;i++){if(await fn())return;await pause(50);}throw Error('Timed out: '+label);};
const ready=text=>until(()=>evaluate(`document.body?.innerText.includes(${JSON.stringify(text)})`),text);
const click=async label=>{await until(()=>evaluate(`!![...document.querySelectorAll('[role=button],button,a')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.innerText===${JSON.stringify(label)})&&e.getAttribute('aria-disabled')!=='true')`),'enabled '+label);assert.equal(await evaluate(`(()=>{const e=[...document.querySelectorAll('[role=button],button,a')].find(e=>(e.getAttribute('aria-label')===${JSON.stringify(label)}||e.innerText===${JSON.stringify(label)})&&e.getAttribute('aria-disabled')!=='true');if(!e)return false;e.click();return true;})()`),true);};
const fill=(label,value)=>evaluate(`(()=>{const e=document.querySelector('input[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
const go=async path=>{await send('Page.navigate',{url:'http://127.0.0.1:8791'+path});await ready(path==='/settings'?'Settings':'Calendar');};
const screenshot=async name=>{const data=await send('Page.captureScreenshot',{format:'png'});writeFileSync(join(evidence,name+'.png'),Buffer.from(data.data,'base64'));};
async function main(){
  await admin.query('truncate public.live_ics_connections,live_ics_private.budgets,live_ics_private.deleted cascade');
  await new Promise(r=>api.listen(8792,'127.0.0.1',r));await new Promise(r=>web.listen(8791,'127.0.0.1',r));
  const profile=mkdtempSync(join(tmpdir(),'lifecommand-live-ics-browser-'));
  chrome=spawn(process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9394',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let targets;await until(async()=>{try{targets=await(await fetch('http://127.0.0.1:9394/json')).json();return targets.some(t=>t.type==='page');}catch{return false;}},'Chrome');
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  ws.addEventListener('message',async({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
    if(m.method==='Runtime.exceptionThrown')errors.push('Browser runtime exception');
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;try {
        const url=new URL(request.url);let body,status=200;
        if(request.method==='OPTIONS'){status=204;body='';}
        else if(url.hostname==='ics-api.example.com'){
          if(offline){await send('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'});return;}
          const r=await fetch('http://127.0.0.1:8792'+url.pathname,{method:request.method,headers:{authorization:request.headers.Authorization??request.headers.authorization??'','content-type':'application/json'},...(['POST','PATCH'].includes(request.method)?{body:request.postData}: {})});status=r.status;body=await r.text();
        } else if(url.pathname.includes('/auth/v1/token'))body=JSON.stringify(sessionB);
        else if(url.pathname.includes('/auth/v1/user'))body=JSON.stringify(user);
        else if(url.pathname.includes('/auth/v1/logout'))body='{}';
        else if(url.pathname.includes('/rest/v1/'))body='null';
        else {status=400;body='{}';}
        await send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'authorization,content-type,apikey,x-client-info,x-supabase-api-version'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PATCH,DELETE,OPTIONS'}],body:Buffer.from(body).toString('base64')});
      }catch{await send('Fetch.failRequest',{requestId,errorReason:'Failed'}).catch(()=>{});}
    }
  });
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'https://ics-api.example.com/*'},{urlPattern:'https://ics-auth.example.com/*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(!localStorage.getItem('ics-fixture-initialized')){localStorage.setItem('ics-fixture-initialized','yes');localStorage.setItem('sb-ics-auth-auth-token',${JSON.stringify(JSON.stringify(session))});}`});
  await go('/settings');await click('Skip setup');await click('Accounts and connections');await ready('Connect calendar');
  await click('Connect calendar');await fill('Calendar name','Browser calendar');await fill('Private calendar subscription URL','webcal://calendar.example.com/synthetic-fixture');
  failFeed=true;await click('Connect');await ready('The provider refused access.');assert.deepEqual(await service.list(A),[]);
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Calendar name"]').value`),'Browser calendar');
  await screenshot('failed-draft-desktop');failFeed=false;floatingFeed=true;
  for(const timezoneId of ['America/New_York','Asia/Tokyo']) {
    await send('Emulation.setTimezoneOverride',{timezoneId});const before=providerCalls;await click('Connect');
    await until(()=>Promise.resolve(providerCalls===before+1),'floating feed fetched');await ready('Timed events must specify UTC');
    await until(()=>evaluate(`document.querySelector('[aria-label="Connect"]')?.getAttribute('aria-disabled')!=='true'`),'unsupported attempt finished');
    assert.deepEqual(await service.list(A),[]);assert.equal(await evaluate(`document.querySelector('input[aria-label="Calendar name"]').value`),'Browser calendar');
    assert.equal(await evaluate(`document.body.innerText.includes('Must never render shifted')`),false);
  }
  await screenshot('unsupported-time-draft');await send('Emulation.setTimezoneOverride',{timezoneId:''});floatingFeed=false;const beforeConnect=providerCalls;
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="Connect"]');e.click();e.click();})()`);
  await until(async()=> (await service.list(A)).length===1,'saved initial connection');await ready('1 cached events');assert.equal(providerCalls-beforeConnect,1,'double submission coalesces');
  assert.equal(await evaluate(`Object.values(localStorage).some(v=>v.includes('synthetic-fixture'))`),false,'URL never persisted');
  await click('Manage calendar Browser calendar');await click('Edit calendar Browser calendar');assert.equal(await evaluate(`!!document.querySelector('input[aria-label="Private calendar subscription URL"]')`),false);
  await fill('Calendar name','Renamed calendar');await click('Blue calendar color');await click('Save calendar');await ready('Renamed calendar · Shown');
  await click('Manage calendar Renamed calendar');await click('Hide calendar Renamed calendar');await ready('Renamed calendar · Hidden');
  await click('Manage calendar Renamed calendar');await click('Show calendar Renamed calendar');await ready('Renamed calendar · Shown');
  await click('Manage calendar Renamed calendar');await click('Replace URL for Renamed calendar');assert.equal(await evaluate(`document.querySelector('input[aria-label="Private calendar subscription URL"]').value`),'');
  await fill('Private calendar subscription URL','https://calendar.example.com/replacement-fixture');
  const beforeReplacement=(await service.list(A))[0];
  const secretBefore=(await admin.query('select secret,etag,modified from live_ics_private.secrets where owner_id=$1 and id=$2',[A,beforeReplacement.id])).rows[0];
  floatingFeed=true;await admin.query('update public.live_ics_connections set next_attempt=null');await click('Save calendar');await ready('Timed events must specify UTC');
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Private calendar subscription URL"]').value`),'https://calendar.example.com/replacement-fixture');
  assert.deepEqual((await service.list(A))[0].events,beforeReplacement.events);
  assert.deepEqual((await admin.query('select secret,etag,modified from live_ics_private.secrets where owner_id=$1 and id=$2',[A,beforeReplacement.id])).rows[0],secretBefore);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await screenshot('unsupported-replacement-phone');
  floatingFeed=false;await admin.query('update public.live_ics_connections set next_attempt=null');await click('Save calendar');
  await until(async()=>{const row=(await service.list(A))[0];return row.revision>beforeReplacement.revision&&!row.error;},'replacement committed');
  await until(()=>evaluate(`!document.querySelector('input[aria-label="Private calendar subscription URL"]')`),'saved replacement closes draft');
  await go('/calendar');await ready('Live fixture event');await ready('Subscription · Renamed calendar');
  floatingFeed=true;await admin.query('update public.live_ics_connections set next_attempt=null');await click('Refresh calendar subscriptions');await ready('Timed events must specify UTC');
  await ready('Live fixture event');assert.equal(await evaluate(`document.body.innerText.includes('Must never render shifted')`),false);
  floatingFeed=false;await admin.query('update public.live_ics_connections set next_attempt=null');await click('Refresh calendar subscriptions');
  await until(async()=>!(await service.list(A))[0].error,'valid retry clears saved refresh error');
  offline=true;await go('/calendar');await ready('Live fixture event');await ready('Calendar service unavailable.');
  offline=false;await go('/settings');await ready('Renamed calendar · Shown');
  for(const [width,height,scale] of [[1280,900,1],[390,844,1],[320,568,1.5]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    if(scale>1){await click('How does it look?');await click('textSize: extra-large');await until(()=>evaluate(`!!document.querySelector('[aria-label="textSize: extra-large, selected"]')`),'saved extra-large preference');}
    await click('Connect calendar');await fill('Calendar name','Large text draft');
    await until(()=>evaluate(`!!document.querySelector('[data-testid="settings-dialog"]')`),'dialog layout');
    assert.equal(await evaluate(`(()=>{const e=[...document.querySelectorAll('[data-testid="settings-dialog"] [role=button], [data-testid="settings-dialog"] input')];return e.every(x=>{const r=x.getBoundingClientRect();return r.width===0||(r.left>=-1&&r.right<=innerWidth+1&&r.height>=43);});})()`),true,'dialog fits narrow layout');
    await screenshot(`dialog-${width}`);await click('Cancel calendar editing');await click('Keep calendar draft');assert.equal(await evaluate(`document.querySelector('input[aria-label="Calendar name"]').value`),'Large text draft');
    await click('Cancel calendar editing');await click('Discard calendar draft');
  }
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await click('Connect calendar');await screenshot('dialog-dark-large');
  // RN Web activates its modal/focus trap after mounting content. Visible inputs
  // alone do not establish that activation has completed. Wait for its active
  // role and automatic focus entry before exercising keyboard containment.
  await until(()=>evaluate(`!!document.querySelector('[data-testid="settings-dialog"]')?.closest('[role="dialog"]') && !!document.activeElement.closest('[data-testid="settings-dialog"]')`),'modal active with initial focus');
  await evaluate(`document.querySelector('input[aria-label="Calendar name"]').focus()`);
  for(let i=0;i<9;i++){
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const focused=await evaluate(`({inside:!!document.activeElement.closest('[data-testid="settings-dialog"]'),tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label'),role:document.activeElement.getAttribute('role'),tabIndex:document.activeElement.tabIndex})`);
    if(!focused.inside)writeFileSync(join(evidence,`focus-failure-${Date.now()}.json`),JSON.stringify({step:i,...focused}));
    assert.equal(focused.inside,true,'Tab stays in dialog');
  }
  await click('Cancel calendar editing');await click('Discard calendar draft');
  await until(()=>evaluate(`document.activeElement.tagName!=='BODY'`),'modal focus restored');
  await click('Manage calendar Renamed calendar');await click('Disconnect Renamed calendar');await click('Cancel disconnect');assert.equal((await service.list(A)).length,1);
  await click('Manage calendar Renamed calendar');await click('Disconnect Renamed calendar');await click('Confirm disconnect');await until(async()=>!(await service.list(A)).length,'saved deletion');await until(()=>evaluate(`!document.body.innerText.includes('Renamed calendar · Shown')`),'removed cached connection');
  await click('Connect calendar');await fill('Calendar name','Account A calendar');await fill('Private calendar subscription URL','https://calendar.example.com/account-fixture');await click('Connect');await ready('Account A calendar · Shown');
  await admin.query('update public.live_ics_connections set next_attempt=null');
  let release;holdFeed=new Promise(r=>release=r);const entered=new Promise(r=>feedEntered=r);
  await click('Refresh connected calendars');await entered;await click('Sign out');await ready('Active: Guest');await click('Accounts and connections');
  await fill('Cloud email','second@example.com');await fill('Cloud password','synthetic-password');await click('Sign in');
  await until(()=>evaluate(`document.body.innerText.includes('second@example.com')||document.body.innerText.includes('Make LifeCommand yours')`),'second account');
  if(await evaluate(`document.body.innerText.includes('Make LifeCommand yours')`))await click('Skip setup');
  if(await evaluate(`document.querySelector('[aria-label="Accounts and connections"]')?.getAttribute('aria-expanded')!=='true'`))await click('Accounts and connections');
  await ready('Signed in as second@example.com');
  release();holdFeed=undefined;
  await until(async()=>{const row=(await service.list(A))[0];return row.revision>2;},'old-account refresh completes');
  assert.deepEqual(await service.list(B),[]);assert.equal(await evaluate(`document.body.innerText.includes('Account A calendar')`),false,'late callback cannot show previous account');
  assert.equal(await evaluate(`Object.entries(localStorage).filter(([k])=>k.includes(${JSON.stringify(B)})).some(([,v])=>v.includes('Account A calendar'))`),false,'late callback cannot persist into new account');
  await click('Connect calendar');await fill('Calendar name','Reset test calendar');await fill('Private calendar subscription URL','https://calendar.example.com/reset-fixture');await click('Connect');await ready('Reset test calendar · Shown');
  offline=true;await click('Data and recovery');await click('Start Fresh');await click('Delete local data and start fresh');await ready('Start Fresh complete.');
  await until(()=>evaluate(`!document.body.innerText.includes('Reset test calendar · Shown')`),'reset clears mounted cache');
  assert.equal((await service.list(B)).length,1,'Start Fresh is not a remote disconnect');
  assert.deepEqual(errors,[]);writeFileSync(join(evidence,'result.json'),JSON.stringify({passed:true,providerCalls,tests:['failed draft','floating rejection New York/Tokyo','unsupported replacement retains phone draft/source/cache','unsupported refresh retains events','connect/double submit','URL redaction','rename/color','hide/show','replace','Calendar display','offline cache','desktop/phone/extra-large/dark','modal keyboard containment/return','cancel/confirm disconnect','account switch during refresh','Start Fresh clears mounted offline cache only'],physicalDevice:false},null,2));
  console.log('PASS disposable browser workflows, saved PostgreSQL state, offline cache, desktop/phone/large-text bounds');
}
const watchdog=setTimeout(()=>{console.error('Browser watchdog expired');chrome?.kill();process.exit(1);},120000);
try{await main();}catch(error){console.error(error.message);writeFileSync(join(evidence,`failure-${Date.now()}.txt`),error.message);try{if(ws)await screenshot(`failure-${Date.now()}`);}catch{}process.exitCode=1;}
finally{clearTimeout(watchdog);ws?.close();chrome?.kill();web.closeAllConnections();api.closeAllConnections();web.close();api.close();await pool.end();await admin.end();}
