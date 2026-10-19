import { grossForPeriod, kindOf, nextPeriod, periodEnd, periodLabel, periodOf, periodStart, shiftPeriod } from './pay-period';

describe('pay periods', () => {
  it('knows what kind a key is, and its first and last day', () => {
    expect([kindOf('2026-10'), kindOf('2026-W41'), kindOf('2026-10-09')]).toEqual(['MONTH', 'WEEK', 'DAY']);
    expect([periodStart('2026-10'), periodEnd('2026-10')]).toEqual(['2026-10-01', '2026-10-31']);
    expect([periodStart('2026-W41'), periodEnd('2026-W41')]).toEqual(['2026-10-05', '2026-10-11']); // Monday to Sunday
    expect([periodStart('2026-10-09'), periodEnd('2026-10-09')]).toEqual(['2026-10-09', '2026-10-09']);
  });

  it('finds the period a date falls in, including across ISO year boundaries', () => {
    expect(periodOf('2026-10-09', 'WEEK')).toBe('2026-W41');
    expect(periodOf('2026-10-11', 'WEEK')).toBe('2026-W41');
    expect(periodOf('2026-10-12', 'WEEK')).toBe('2026-W42');
    expect(periodOf('2026-01-01', 'WEEK')).toBe('2026-W01'); // a Thursday: week 1
    expect(periodOf('2027-01-01', 'WEEK')).toBe('2026-W53'); // a Friday belonging to the last week of 2026
    expect(periodOf('2026-10-09', 'DAY')).toBe('2026-10-09');
  });

  it('steps forwards and backwards through each kind', () => {
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(nextPeriod('2026-W53')).toBe('2027-W01');
    expect(nextPeriod('2026-10-31')).toBe('2026-11-01');
    expect(shiftPeriod('2026-02', -3)).toBe('2025-11');
    expect(shiftPeriod('2026-W02', -2)).toBe('2025-W52');
  });

  it('labels periods for people', () => {
    expect(periodLabel('2026-10')).toBe('October 2026');
    expect(periodLabel('2026-W41')).toBe('Week of 5 Oct 2026');
    expect(periodLabel('2026-10-09')).toBe('9 Oct 2026');
  });

  it('works out a period\'s pay: hours win for hourly; otherwise weeks and days are shares of the year', () => {
    const hourly = { amount: 50_000, period: 'HOUR' as const, hoursPerWeek: 20 };
    expect(grossForPeriod('WEEK', hourly, 4_333_333, undefined)).toBe(1_000_000);
    expect(grossForPeriod('DAY', hourly, 4_333_333, undefined)).toBe(200_000);
    expect(grossForPeriod('WEEK', hourly, 4_333_333, 12)).toBe(600_000);
    expect(grossForPeriod('MONTH', hourly, 4_333_333, undefined)).toBe(4_333_333);
    const monthly = { amount: 3_000_000, period: 'MONTH' as const };
    expect(grossForPeriod('WEEK', monthly, 3_000_000)).toBe(692_308); // 36,000,000 / 52
    expect(grossForPeriod('DAY', monthly, 3_000_000)).toBe(98_630); // 36,000,000 / 365
  });
});
