import { bucketLabels, median, pct, resolvePeriod } from './periods';

const NOW = new Date('2026-10-08T12:00:00Z');

describe('reporting periods', () => {
  it('slice a short window by day, a quarter by week and a year by month', () => {
    expect(resolvePeriod('7d', NOW)).toMatchObject({ bucket: 'day' });
    expect(resolvePeriod('90d', NOW).bucket).toBe('week');
    expect(resolvePeriod('12m', NOW).bucket).toBe('month');
    expect(resolvePeriod('all', NOW)).toMatchObject({ from: null, bucket: 'month' });
    expect(resolvePeriod('nonsense', NOW).key).toBe('30d');
  });

  it('give a dense list of buckets with no gaps', () => {
    const days = bucketLabels(resolvePeriod('7d', NOW));
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toBe('2026-10-08');
    const months = bucketLabels(resolvePeriod('12m', NOW));
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-11');
    const weeks = bucketLabels(resolvePeriod('90d', NOW));
    expect(weeks.every((w) => new Date(`${w}T00:00:00Z`).getUTCDay() === 1)).toBe(true); // weeks start on Monday
    expect(bucketLabels(resolvePeriod('all', NOW), new Date('2026-07-15T00:00:00Z'))).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
  });

  it('compute a median and a percentage without dividing by zero', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 0)).toBeNull();
  });
});
