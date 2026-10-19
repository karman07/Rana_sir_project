/**
 * A pay period is one of: a month ("2026-10"), an ISO week, Monday to Sunday ("2026-W41"), or a day ("2026-10-09").
 * Keys of one kind sort correctly as plain strings, so a contract that is paid weekly only ever holds weekly keys.
 */
export type PayFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type PeriodKind = 'MONTH' | 'WEEK' | 'DAY';

export const PERIOD_RE = /^(\d{4}-(0[1-9]|1[0-2])|\d{4}-W(0[1-9]|[1-4]\d|5[0-3])|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/;
export const PERIOD_MESSAGE = 'Use YYYY-MM, YYYY-Www (a week) or YYYY-MM-DD (a day)';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const FREQ_KIND: Record<PayFrequency, PeriodKind> = { MONTHLY: 'MONTH', WEEKLY: 'WEEK', DAILY: 'DAY' };

export const kindOf = (key: string): PeriodKind => (key.includes('W') ? 'WEEK' : key.length === 10 ? 'DAY' : 'MONTH');
export const kindForFrequency = (f?: string): PeriodKind => FREQ_KIND[(f as PayFrequency) ?? 'MONTHLY'] ?? 'MONTH';

/** Monday of ISO week `w` in ISO year `y`. */
function isoWeekStart(y: number, w: number): Date {
  const jan4 = utc(y, 0, 4);
  const mondayOfWeek1 = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000);
  return new Date(mondayOfWeek1.getTime() + (w - 1) * 7 * 86_400_000);
}

export function periodStart(key: string): string {
  const k = kindOf(key);
  if (k === 'MONTH') return `${key}-01`;
  if (k === 'DAY') return key;
  const [y, w] = key.split('-W').map(Number);
  return iso(isoWeekStart(y, w));
}

export function periodEnd(key: string): string {
  const k = kindOf(key);
  if (k === 'DAY') return key;
  if (k === 'MONTH') { const [y, m] = key.split('-').map(Number); return iso(utc(y, m, 0)); }
  return iso(new Date(new Date(`${periodStart(key)}T00:00:00Z`).getTime() + 6 * 86_400_000));
}

/** The period of the given kind that contains this date. */
export function periodOf(ymd: string, kind: PeriodKind = 'MONTH'): string {
  if (kind === 'MONTH') return ymd.slice(0, 7);
  if (kind === 'DAY') return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86_400_000); // the Thursday decides the ISO year
  const y = thursday.getUTCFullYear();
  const week = 1 + Math.round((thursday.getTime() - isoWeekStart(y, 1).getTime()) / (7 * 86_400_000));
  return `${y}-W${String(week).padStart(2, '0')}`;
}

export function nextPeriod(key: string): string {
  return periodOf(iso(new Date(new Date(`${periodEnd(key)}T00:00:00Z`).getTime() + 86_400_000)), kindOf(key));
}

export function shiftPeriod(key: string, by: number): string {
  let p = key;
  for (let i = 0; i < Math.abs(by); i++) p = by > 0 ? nextPeriod(p) : periodOf(iso(new Date(new Date(`${periodStart(p)}T00:00:00Z`).getTime() - 86_400_000)), kindOf(p));
  return p;
}

const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
/** "October 2026", "Week of 5 Oct 2026" or "9 Oct 2026". */
export function periodLabel(key: string): string {
  const k = kindOf(key);
  if (k === 'MONTH') return fmt(`${key}-01`, { month: 'long', year: 'numeric' });
  if (k === 'DAY') return fmt(key, { day: 'numeric', month: 'short', year: 'numeric' });
  return `Week of ${fmt(periodStart(key), { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * What one period of a contract comes to, before commission. Hours worked, when known, always win for hourly pay.
 * Otherwise a week is a 52nd of the year and a day a 365th, so any mix of periods adds up to the annual figure.
 */
export function grossForPeriod(kind: PeriodKind, salary: { amount: number; period: 'HOUR' | 'MONTH' | 'YEAR'; hoursPerWeek?: number }, monthlyGross: number, hoursWorked?: number): number {
  if (salary.period === 'HOUR') {
    if (hoursWorked !== undefined) return Math.round(salary.amount * hoursWorked);
    const weekly = Math.round(salary.amount * (salary.hoursPerWeek ?? 0));
    return kind === 'MONTH' ? monthlyGross : kind === 'WEEK' ? weekly : Math.round(weekly / 5);
  }
  return kind === 'MONTH' ? monthlyGross : kind === 'WEEK' ? Math.round((monthlyGross * 12) / 52) : Math.round((monthlyGross * 12) / 365);
}
