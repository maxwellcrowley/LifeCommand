import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createSocket } from 'node:dgram';
import { Resolver } from 'node:dns/promises';
import { createSecureContext } from 'node:tls';
import { createFeedTransport, publicAddress, feedURL, LIMITS, resolveDNS } from '../src/transport.mjs';
import { secretBox } from '../src/secrets.mjs';
import { parseFeed } from '../src/parser.mjs';

test('public destination classification and canonical URL representations',()=>{
  for(const host of ['127.0.0.1','0.0.0.0','10.1.2.3','100.64.0.1','169.254.169.254','172.16.1.2','192.168.1.1','192.0.0.1','198.18.0.1','192.0.2.1','224.0.0.1','240.0.0.1','::1','::','fc00::1','fe80::1','ff00::1','::ffff:8.8.8.8','64:ff9b::808:808','2001:db8::1','2002:0808:0808::1','3fff::1']) assert.equal(publicAddress(host),false,host);
  for(const host of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(publicAddress(host),true,host);
  for(const url of ['http://example.com','https://2130706433','https://0177.0.0.1','https://0x7f000001','https://[::ffff:127.0.0.1]','https://user:pass@example.com','https://example.com:444','https://example.com/#secret','https://localhost','https://example.com\\@localhost','https://example.com/'+ 'a'.repeat(4096)]) assert.throws(()=>feedURL(url));
  assert.equal(feedURL('webcal://calendar.example.com/feed').protocol,'https:');
});
test('authenticated encryption binds owner, ID, key version; random nonces and rotation',()=>{
  const key=Buffer.alloc(32,7).toString('base64'), box=secretBox({v1:key},'v1');
  const sealed=box.seal('synthetic-private-address','owner','connection');
  assert.equal(box.open(sealed,'owner','connection'),'synthetic-private-address');
  assert.notEqual(sealed.nonce,box.seal('synthetic-private-address','owner','connection').nonce);
  assert.throws(()=>box.open(sealed,'other','connection'));assert.throws(()=>box.open(sealed,'owner','other'));
  assert.throws(()=>box.open({...sealed,tag:Buffer.alloc(16).toString('base64')},'owner','connection'));
  assert.equal(secretBox({v1:key,v2:Buffer.alloc(32,8).toString('base64')},'v2').open(sealed,'owner','connection'),'synthetic-private-address');
});
test('actual DNS resolver cancellation is bounded against a test-owned UDP blackhole',{timeout:8000},async()=>{
  const socket=createSocket('udp4');await new Promise(r=>socket.bind(0,'127.0.0.1',r));
  const resolver=new Resolver({timeout:10000,tries:1});resolver.setServers([`127.0.0.1:${socket.address().port}`]);
  try {const start=Date.now();assert.deepEqual(await resolveDNS('calendar.example.com',new AbortController().signal,resolver),[]);assert.ok(Date.now()-start<5000,'shared DNS timer cancels pending resolver work');}
  finally{socket.close();}
});
test('real TLS transport: pinning, TLS verification, redirect validation, stream and timeout enforcement', {timeout:20000}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'lifecommand-ics-tls-'));
  const openssl=process.env.OPENSSL ?? (process.platform==='win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-subj','/CN=calendar.example.com','-addext','subjectAltName=DNS:calendar.example.com'],{stdio:'ignore'});
  const cert=readFileSync(join(dir,'cert.pem')),key=readFileSync(join(dir,'key.pem'));
  let hits=0, seen;
  const context=createSecureContext({cert,key});
  const server=https.createServer({cert,key,SNICallback:(name,callback)=>{if(name!=='stalled.example.com')callback(null,context);}},(req,res)=>{
    hits++; seen=req.headers;
    if(req.url==='/redirect') {res.writeHead(302,{location:'https://127.0.0.1/private'});res.end();}
    else if(req.url==='/downgrade') {res.writeHead(302,{location:'http://calendar.example.com/feed'});res.end();}
    else if(req.url==='/loop') {res.writeHead(302,{location:'/loop'});res.end();}
    else if(req.url==='/redirect304') {res.writeHead(302,{location:'/304'});res.end();}
    else if(req.url==='/slow') { /* external request watchdog must destroy socket */ }
    else if(req.url==='/gzip') {res.setHeader('content-encoding','gzip');res.end(gzipSync('a'.repeat(5000)));}
    else if(req.url==='/big') res.end('a'.repeat(5000));
    else if(req.url==='/304') {res.writeHead(304);res.end();}
    else {res.setHeader('etag','"fixture"');res.end('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(443,'127.0.0.1',resolve);});
  try {
    let lookups=0;
    const options={ca:cert,resolveHost:async()=>{lookups++;return [{address:'127.0.0.1',family:4}];},allowedAddress:ip=>ip==='127.0.0.1',limits:{...LIMITS,bytes:1024,idle:150,overall:1000,connect:500}};
    const fetch=createFeedTransport(options);
    assert.match((await fetch('https://calendar.example.com/feed')).text,/VCALENDAR/);
    assert.equal(lookups,1,'pinned lookup is not re-resolved at connection');
    assert.equal(seen.host,'calendar.example.com');assert.equal(seen.authorization,undefined);assert.equal(seen.cookie,undefined);
    await fetch('https://calendar.example.com/feed',{etag:'"old"'});assert.equal(seen['if-none-match'],'"old"');
    const before=hits;
    await assert.rejects(createFeedTransport({...options,allowedAddress:publicAddress})('https://calendar.example.com/feed'),/blocked_destination/);
    assert.equal(hits,before,'production policy blocks before socket reaches fixture');
    await assert.rejects(createFeedTransport({...options,ca:undefined})('https://calendar.example.com/feed'),/provider_unavailable/);
    await assert.rejects(fetch('https://wrong.example.com/feed'),/provider_unavailable/,'certificate hostname verification is retained');
    await assert.rejects(createFeedTransport({...options,allowedAddress:publicAddress,resolveHost:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]})('https://calendar.example.com/feed'),/blocked_destination/,'mixed DNS answers fail before connecting');
    for(const path of ['/redirect','/downgrade']) await assert.rejects(fetch('https://calendar.example.com'+path),/invalid_url/);
    await assert.rejects(fetch('https://calendar.example.com/loop'),/redirect_limit/);
    for(const path of ['/big','/gzip']) await assert.rejects(fetch('https://calendar.example.com'+path),/too_large/);
    await assert.rejects(fetch('https://calendar.example.com/slow'),/timeout/);
    await assert.rejects(fetch('https://stalled.example.com/feed'),/timeout/,'connect deadline aborts stalled TLS handshake');
    assert.equal((await fetch('https://calendar.example.com/304')).unchanged,true);
    await assert.rejects(fetch('https://calendar.example.com/redirect304',{etag:'"fixture"'}),/invalid_feed/,'redirect cannot reuse a validator it was not sent');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
test('parser subprocess semantics and external watchdog, invalid snapshots cannot become empty', async()=>{
  const sub={id:'test',name:'Synthetic',color:'#557D78'},window={from:'2026-03-01',through:'2026-03-31'};
  const wrap=body=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+body+'\r\nEND:VCALENDAR';
  const event='BEGIN:VEVENT\r\nUID:one\r\nDTSTART:20260301T090000\r\nDTEND:20260301T100000\r\nSUMMARY:Folded\\, text\r\n continuation\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20260302T090000\r\nRDATE:20260306T090000\r\nEND:VEVENT';
  const parsed=await parseFeed(wrap(event),sub,window);
  assert.equal(parsed.length,3);assert.equal(parsed[0].start,'2026-03-01T09:00:00.000Z');assert.equal(parsed[0].title,'Folded, textcontinuation');
  assert.deepEqual(await parseFeed(wrap(''),sub,window),[]);
  await assert.rejects(parseFeed('invalid private payload',sub,window),/invalid_feed/);
  await assert.rejects(parseFeed(wrap('').replace('VERSION:2.0','VERSION:9.0'),sub,window),/invalid_feed/);
  await assert.rejects(parseFeed(wrap('METHOD:REQUEST'),sub,window),/invalid_feed/);
  await assert.rejects(parseFeed(wrap(event).replace('END:VCALENDAR',''),sub,window),/invalid_feed/);
  await assert.rejects(parseFeed(wrap(event.replace('RRULE:FREQ=DAILY;COUNT=3','EXRULE:FREQ=DAILY;COUNT=3')),sub,window),/invalid_feed/);
  await assert.rejects(parseFeed(wrap(event),sub,window,new Date(),{timeout:1}),/parser_limit/);
});
