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
