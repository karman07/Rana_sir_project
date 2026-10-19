import { BadRequestException } from '@nestjs/common';
import { CommissionCalculationService } from './commission-calculation.service';

const svc = new CommissionCalculationService();

describe('CommissionCalculationService', () => {
  it('splits 10% of ₹60,000 into ₹6,000 platform and ₹54,000 candidate', () => {
    expect(svc.calculate(6_000_000, { type: 'PERCENT', basisPoints: 1000 })).toEqual({ grossAmount: 6_000_000, commission: 600_000, candidateAmount: 5_400_000, platformAmount: 600_000 });
  });

  it('handles the spec examples for a salary change (₹50,000 -> ₹70,000 at 10%)', () => {
    expect(svc.calculate(5_000_000, { type: 'PERCENT', basisPoints: 1000 }).commission).toBe(500_000);
    expect(svc.calculate(7_000_000, { type: 'PERCENT', basisPoints: 1000 }).commission).toBe(700_000);
  });

  it('rounds half-up once, and the two sides always add up to the gross', () => {
    for (const gross of [1, 3, 99, 10_001, 123_457, 9_999_999]) {
      for (const bp of [1, 333, 1250, 1500, 9999]) {
        const r = svc.calculate(gross, { type: 'PERCENT', basisPoints: bp });
        expect(r.commission + r.candidateAmount).toBe(gross);
        expect(Number.isInteger(r.commission)).toBe(true);
        expect(r.platformAmount).toBe(r.commission);
      }
    }
    expect(svc.calculate(15, { type: 'PERCENT', basisPoints: 1000 }).commission).toBe(2); // 1.5 -> 2
    expect(svc.calculate(14, { type: 'PERCENT', basisPoints: 1000 }).commission).toBe(1); // 1.4 -> 1
  });

  it('supports fixed commission, capped at the amount being split', () => {
    expect(svc.calculate(8_500_000, { type: 'FIXED', amount: 1_500_000 })).toMatchObject({ commission: 1_500_000, candidateAmount: 7_000_000 });
    expect(svc.calculate(1_000, { type: 'FIXED', amount: 5_000 })).toMatchObject({ commission: 1_000, candidateAmount: 0 });
  });

  it('handles 0% and 100%', () => {
    expect(svc.calculate(100_000, { type: 'PERCENT', basisPoints: 0 })).toMatchObject({ commission: 0, candidateAmount: 100_000 });
    expect(svc.calculate(100_000, { type: 'PERCENT', basisPoints: 10_000 })).toMatchObject({ commission: 100_000, candidateAmount: 0 });
  });

  it('rejects anything that is not whole, non-negative minor units or a sane percentage', () => {
    for (const bad of [1.5, -1, NaN, Infinity, '100' as unknown as number]) expect(() => svc.calculate(bad, { type: 'PERCENT', basisPoints: 1000 })).toThrow(BadRequestException);
    expect(() => svc.calculate(100, { type: 'PERCENT', basisPoints: -1 })).toThrow(BadRequestException);
    expect(() => svc.calculate(100, { type: 'PERCENT', basisPoints: 10_001 })).toThrow(BadRequestException);
    expect(() => svc.calculate(100, { type: 'PERCENT', basisPoints: 12.5 })).toThrow(BadRequestException);
    expect(() => svc.calculate(100, { type: 'FIXED', amount: -5 })).toThrow(BadRequestException);
  });

  it('turns an annual salary into monthly and annual figures', () => {
    const f = svc.forContract({ amount: 60_000_000, period: 'YEAR' }, 'inr', { type: 'PERCENT', basisPoints: 1000 });
    expect(f.currency).toBe('INR');
    expect(f.monthly).toEqual({ grossAmount: 5_000_000, commission: 500_000, candidateAmount: 4_500_000, platformAmount: 500_000 });
    expect(f.annual.grossAmount).toBe(60_000_000);
    expect(f.annual.commission).toBe(6_000_000);
  });

  it('takes a monthly salary as-is and rounds an uneven annual one half-up', () => {
    expect(svc.forContract({ amount: 7_000_000, period: 'MONTH' }, 'INR', { type: 'PERCENT', basisPoints: 1000 }).monthly.commission).toBe(700_000);
    expect(svc.forContract({ amount: 1_000_000, period: 'YEAR' }, 'USD', { type: 'FIXED', amount: 100 }).monthly.grossAmount).toBe(83_333); // 83,333.33 -> 83,333
    expect(svc.forContract({ amount: 1_000_007, period: 'YEAR' }, 'USD', { type: 'FIXED', amount: 0 }).monthly.grossAmount).toBe(83_334); // .58 -> up
  });

  it('works out hourly pay from the rate and weekly hours, and insists on the hours', () => {
    const f = svc.forContract({ amount: 50_000, period: 'HOUR', hoursPerWeek: 20 }, 'INR', { type: 'PERCENT', basisPoints: 1000 }); // 500/hr x 20h
    expect(f.annual.grossAmount).toBe(52_000_000);
    expect(f.monthly.grossAmount).toBe(4_333_333);
    expect(() => svc.forContract({ amount: 50_000, period: 'HOUR' }, 'INR', { type: 'PERCENT', basisPoints: 1000 })).toThrow();
  });

  it('describes rules for display', () => {
    expect(svc.describe({ type: 'PERCENT', basisPoints: 1000 })).toBe('10%');
    expect(svc.describe({ type: 'PERCENT', basisPoints: 1250 })).toBe('12.50%');
  });
});
