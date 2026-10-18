import https from 'node:https';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createInflate } from 'node:zlib';
import ipaddr from 'ipaddr.js';
import { SafeError, fail } from './errors.mjs';

export const LIMITS = Object.freeze({ url: 4096, redirects: 3, dns: 3000, connect: 5000, idle: 5000, overall: 20000, bytes: 2 * 1024 * 1024 });
export function publicAddress(address) {
  try {
    const ip = ipaddr.parse(address);
    // Reject transition/mapped/reserved networks, not just RFC1918. IPv6 only
    // accepts current global unicast, excluding documentation/protocol blocks.
    if (ip.kind() === 'ipv6') return ip.range() === 'unicast' && ip.match(ipaddr.parse('2000::'), 3)
      && !ip.match(ipaddr.parse('2001::'), 23) && !ip.match(ipaddr.parse('2002::'), 16)
      && !ip.match(ipaddr.parse('3fff::'), 20);
    return ip.range() === 'unicast';
  } catch { return false; }
}
export function feedURL(input) {
  try {
    if (typeof input !== 'string' || input.length > LIMITS.url || /[\x00-\x20\x7f\\]/.test(input.trim())) throw Error();
    const url = new URL(input.trim().replace(/^webcal:/i, 'https:'));
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) throw Error();
    if (isIP(host) ? !publicAddress(host) : !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) throw Error();
    if (/(^|\.)(localhost|local|internal|test|invalid|onion)$/i.test(host)) throw Error();
    return url;
  } catch { fail('invalid_url'); }
}
export async function resolveDNS(host, signal, resolver = new Resolver({ timeout: LIMITS.dns, tries: 1 })) {
  if (isIP(host)) return [{ address: host, family: isIP(host) }];
  const cancel = () => resolver.cancel();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, LIMITS.dns);
  try {
    const results = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
    return results.flatMap((r, i) => r.status === 'fulfilled' ? r.value.map(address => ({ address, family: i ? 6 : 4 })) : []);
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
const byteLimit = max => { let size = 0; return new Transform({ transform(chunk, _, done) { size += chunk.length; done(size > max ? new SafeError('too_large') : null, chunk); } }); };

// The injection points are module APIs for deterministic loopback TLS fixtures,
// never environment/config switches. Production always uses resolve/publicAddress.
export function createFeedTransport({ resolveHost = resolveDNS, allowedAddress = publicAddress, ca, limits = LIMITS } = {}) {
  return async function fetchFeed(input, validators = {}, outerSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    outerSignal?.addEventListener('abort', abort, { once: true });
    if (outerSignal?.aborted) abort();
    const timer = setTimeout(abort, limits.overall);
    let url = feedURL(input);
    try {
      for (let hop = 0; hop <= limits.redirects; hop++) {
        controller.signal.throwIfAborted();
        const host = url.hostname.replace(/^\[|\]$/g, '');
        const addresses = await resolveHost(host, controller.signal);
        controller.signal.throwIfAborted();
        if (!addresses.length) fail('provider_unavailable');
        if (addresses.some(a => !allowedAddress(a.address))) fail('blocked_destination');
        const pinned = addresses[0];
        const result = await new Promise((accept, reject) => {
          // A per-request, non-pooled agent avoids proxy environment, stale sockets,
          // re-resolution and cross-host TLS sessions. lookup returns only the
          // validated address; Host/SNI/certificate verification keep original host.
          const agent = new https.Agent({ keepAlive: false, maxCachedSessions: 0, proxyEnv: {} });
          const req = https.request(url, {
            agent, ca, signal: controller.signal, minVersion: 'TLSv1.2', maxHeaderSize: 16384,
            lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
            headers: { Accept: 'text/calendar', 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'LifeCommand-Calendar/1',
              ...(hop === 0 && validators.etag ? { 'If-None-Match': validators.etag } : {}),
              ...(hop === 0 && validators.modified ? { 'If-Modified-Since': validators.modified } : {}) },
          });
          const connectTimer = setTimeout(() => req.destroy(new SafeError('timeout')), limits.connect);
          req.once('socket', socket => socket.once('secureConnect', () => clearTimeout(connectTimer)));
          req.setTimeout(limits.idle, () => req.destroy(new SafeError('timeout')));
          req.once('error', reject);
          req.once('close', () => { clearTimeout(connectTimer); agent.destroy(); });
          req.once('response', async res => {
            try {
              const status = res.statusCode;
              if ([301, 302, 303, 307, 308].includes(status)) { const location = res.headers.location; res.destroy(); accept({ redirect: location }); return; }
              if (status === 304) { res.destroy(); if (hop !== 0) fail('invalid_feed'); accept({ unchanged: true }); return; }
              if (status !== 200) { res.destroy(); fail(status === 401 || status === 403 ? 'provider_denied' : 'provider_unavailable'); }
              const encoding = res.headers['content-encoding'];
              if (encoding && !['identity', 'gzip', 'deflate'].includes(encoding)) { res.destroy(); fail('unsupported_encoding'); }
              const chunks = [];
              const streams = [res, byteLimit(limits.bytes)];
              if (encoding === 'gzip') streams.push(createGunzip());
              if (encoding === 'deflate') streams.push(createInflate());
              streams.push(byteLimit(limits.bytes), new Writable({ write(chunk, _, done) { chunks.push(chunk); done(); } }));
              await pipeline(streams, { signal: controller.signal });
              const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
              accept({ text, etag: res.headers.etag?.slice(0, 1024), modified: res.headers['last-modified']?.slice(0, 128) });
            } catch (error) { req.destroy(); reject(error); }
          });
          req.end();
        });
        if ('redirect' in result) {
          if (!result.redirect || hop === limits.redirects) fail('redirect_limit');
          url = feedURL(new URL(result.redirect, url).href);
        } else return result;
      }
    } catch (error) { if (error instanceof SafeError) throw error; fail(controller.signal.aborted ? 'timeout' : 'provider_unavailable'); }
    finally { clearTimeout(timer); outerSignal?.removeEventListener('abort', abort); }
  };
}
export const fetchFeed = createFeedTransport();
