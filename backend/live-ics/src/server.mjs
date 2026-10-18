import http from 'node:http';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { createService } from './service.mjs';
import { secretBox } from './secrets.mjs';
import { SafeError, fail, safeCode } from './errors.mjs';

export function supabaseIdentity(url, key) {
  const base=new URL(url); if (base.protocol!=='https:' || base.username || base.password || base.pathname!=='/') throw Error('Invalid authentication configuration');
  return async token => {
    if (!token || token.length>8192) fail('sign_in',401);
    try {
      const response=await fetch(new URL('/auth/v1/user',base),{headers:{apikey:key,Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
      if (!response.ok) fail('sign_in',401);
      const user=await response.json();
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(user.id)) fail('sign_in',401);
      return user.id;
    } catch { fail('sign_in',401); }
  };
}
export function createServer({service,identity,origins=[]}) {
  let active=0;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json'); res.setHeader('X-Content-Type-Options','nosniff');
    const origin=req.headers.origin;
    if (origin && !origins.includes(origin)) { res.writeHead(403); res.end('{"error":"origin"}'); return; }
    if (origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if (req.method==='OPTIONS') { res.setHeader('Access-Control-Allow-Headers','authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.writeHead(204);res.end();return; }
    if (++active>64) {active--;res.writeHead(503);res.end('{"error":"capacity"}');req.resume();return;}
    try {
      const match=/^\/v1\/calendars(?:\/([\da-f-]{36})(?:\/(refresh|replace))?)?$/.exec(req.url??'');
      if (!match) fail('not_found',404);
      const owner=await identity(req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]);
      let body={};
      if (['POST','PATCH'].includes(req.method)) {
        if (!req.headers['content-type']?.startsWith('application/json')) fail('invalid_fields');
        const chunks=[];let bytes=0;
        for await(const chunk of req) {bytes+=chunk.length;if(bytes>8192) fail('invalid_fields',413);chunks.push(chunk);}
        try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {fail('invalid_fields');}
        if (!body || typeof body!=='object' || Array.isArray(body)) fail('invalid_fields');
      }
      const [,id,action]=match; let result;
      if (req.method==='GET'&&!id) result=await service.list(owner);
      else if (req.method==='POST'&&!id) result=await service.refresh(owner,body.id,body,'create');
      else if (req.method==='POST'&&id&&action) result=await service.refresh(owner,id,body,action);
      else if(req.method==='PATCH'&&id&&!action) result=await service.edit(owner,id,body);
      else if(req.method==='DELETE'&&id&&!action) {await service.remove(owner,id);res.writeHead(204);res.end();return;}
      else fail('not_found',404);
      res.end(JSON.stringify(result));
    } catch(error) {
      // Deliberately no raw error, URL, token, request body or provider payload logs.
      if (!res.destroyed) {res.writeHead(error instanceof SafeError ? error.status : 503);res.end(JSON.stringify({error:safeCode(error)}));}
    } finally {active--;}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.maxHeadersCount=30;server.setTimeout(35000,socket=>socket.destroy());
  return server;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.LIVE_ICS_ENABLED!=='true') throw Error();
    const pool=new pg.Pool({connectionString:process.env.LIVE_ICS_DATABASE_URL,max:20,connectionTimeoutMillis:5000,statement_timeout:5000});
    pool.on('error',()=>process.stderr.write('Live ICS database connection unavailable.\n'));
    const box=secretBox(JSON.parse(process.env.LIVE_ICS_KEYS),process.env.LIVE_ICS_KEY_VERSION);
    const service=createService({pool,box});
    const identity=supabaseIdentity(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY);
    createServer({service,identity,origins:(process.env.LIVE_ICS_ORIGINS??'').split(',').filter(Boolean)})
      .listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1');
  } catch { process.stderr.write('Live ICS server configuration is invalid or disabled.\n');process.exitCode=1; }
}
