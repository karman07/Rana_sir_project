export const PERIODS = ['7d', '30d', '90d', '12m', 'all'] as const;
export type PeriodKey = (typeof PERIODS)[number];
export type Bucket = 'day' | 'week' | 'month';

const DAY = 86_400_000;
export interface PeriodRange { key: PeriodKey; from: Date | null; to: Date; bucket: Bucket }

/** A reporting window and how finely to slice it: days for a month or less, weeks for a quarter, months beyond. */
export function resolvePeriod(key: string | undefined, now = new Date()): PeriodRange {
  const k = (PERIODS as readonly string[]).includes(key ?? '') ? (key as PeriodKey) : '30d';
  const start = (days: number) => { const d = new Date(now.getTime() - (days - 1) * DAY); d.setUTCHours(0, 0, 0, 0); return d; };
  if (k === '7d') return { key: k, from: start(7), to: now, bucket: 'day' };
  if (k === '30d') return { key: k, from: start(30), to: now, bucket: 'day' };
  if (k === '90d') { const f = start(90); f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7)); return { key: k, from: f, to: now, bucket: 'week' }; }
  if (k === '12m') { const f = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)); return { key: k, from: f, to: now, bucket: 'month' }; }
  return { key: 'all', from: null, to: now, bucket: 'month' };
}

/** The Mongo expression that turns a date field into this bucket's label. */
export function bucketExpr(field: string, bucket: Bucket) {
  if (bucket === 'month') return { $dateToString: { format: '%Y-%m', date: field } };
  if (bucket === 'week') return { $dateToString: { format: '%Y-%m-%d', date: { $dateTrunc: { date: field, unit: 'week', startOfWeek: 'monday' } } } };
  return { $dateToString: { format: '%Y-%m-%d', date: field } };
}

/** Every bucket label from `from` to now, so a chart has no gaps. `earliest` stands in when the period is "all". */
export function bucketLabels(range: PeriodRange, earliest?: Date | null): string[] {
  const from = range.from ?? earliest ?? range.to;
  const out: string[] = [];
  if (range.bucket === 'month') {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (d <= range.to) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  } else if (range.bucket === 'week') {
    const d = new Date(from); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    while (d <= range.to) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); }
  } else {
    const d = new Date(from); d.setUTCHours(0, 0, 0, 0);
    while (d <= range.to) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  }
  return out;
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
