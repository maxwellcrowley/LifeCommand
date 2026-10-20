export class SafeError extends Error {
  constructor(code, status = 400, retryAfter) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
export const fail = (code, status, retryAfter) => { throw new SafeError(code, status, retryAfter); };
export const safeCode = error => error instanceof SafeError ? error.code : 'unavailable';
