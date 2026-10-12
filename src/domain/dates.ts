export function localDateKey(date: Date): string {
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isDateKey(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === value;
}

export function addDays(value: string, days: number): string {
  if (!isDateKey(value)) throw new Error('Use a valid YYYY-MM-DD date.');
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

// Resolve an IANA wall clock without depending on the device timezone. Recurring
// tasks use 09:00/18:00 (outside DST folds/gaps); offsets are applied afterwards.
export function zonedClock(date: string, clock: string, timeZone: string): Date {
  const target = Date.parse(`${date}T${clock}:00Z`);
  let instant = target;
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const actual = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const delta = target - actual;
    if (!delta) return new Date(instant);
    instant += delta;
  }
  return new Date(instant);
}
