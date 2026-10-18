export class SafeError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const fail = (code, status) => { throw new SafeError(code, status); };
export const safeCode = error => error instanceof SafeError ? error.code : 'unavailable';
