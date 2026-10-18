import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SafeError } from './errors.mjs';
export function parseFeed(text, subscription, window, now = new Date(), { timeout = 3000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL('./parser-worker.cjs', import.meta.url)), [], { execArgv: ['--max-old-space-size=96'], env: { TZ: 'UTC', PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let settled = false;
    const finish = (error, events) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); child.kill(); error ? reject(error) : resolve(events); };
    const abort = () => finish(new SafeError('parser_limit'));
    const timer = setTimeout(abort, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', abort); child.once('exit', abort);
    child.once('message', result => finish(result.error ? new SafeError('invalid_feed') : undefined, result.events));
    if (signal?.aborted) abort(); else child.send({ text, subscription, window, now: now.toISOString() });
  });
}
