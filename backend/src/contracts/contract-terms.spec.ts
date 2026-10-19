import { BadRequestException } from '@nestjs/common';
import { addDays, buildTerms, diffTerms } from './contract-terms';

const dto = { title: 'Backend Engineer', employmentType: 'FULL_TIME' as const, salaryAmount: 5_000_000, currency: 'inr', salaryPeriod: 'MONTH' as const, startDate: '2026-11-01' };

describe('contract terms', () => {
  it('builds valid terms with the default 10% commission', () => {
    const t = buildTerms(dto, undefined, { canSetCommission: false });
    expect(t).toMatchObject({ salary: { amount: 5_000_000, currency: 'INR', period: 'MONTH' }, commission: { type: 'PERCENT', basisPoints: 1000 } });
  });

  it('only Admin can set commission; others keep the existing rule', () => {
    const base = buildTerms({ ...dto, commissionPercent: 12.5 }, undefined, { canSetCommission: true });
    expect(base.commission).toEqual({ type: 'PERCENT', basisPoints: 1250 });
    const byRecruiter = buildTerms({ salaryAmount: 6_000_000, commissionPercent: 1 }, base, { canSetCommission: false });
    expect(byRecruiter.commission).toEqual({ type: 'PERCENT', basisPoints: 1250 });
    expect(byRecruiter.salary.amount).toBe(6_000_000);
    expect(buildTerms({ commissionFixed: 150_000 }, base, { canSetCommission: true }).commission).toEqual({ type: 'FIXED', amount: 150_000 });
  });

  it('lists every problem at once', () => {
    try { buildTerms({}, undefined, { canSetCommission: false }); fail('should throw'); } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ message: expect.arrayContaining(['Job title is required', 'Salary is required', 'Currency is required', 'A valid start date is required']) });
    }
  });

  it('requires an end date for fixed-term roles and orders the dates', () => {
    expect(() => buildTerms({ ...dto, employmentType: 'CONTRACT' }, undefined, { canSetCommission: false })).toThrow(BadRequestException);
    expect(() => buildTerms({ ...dto, endDate: '2026-10-01' }, undefined, { canSetCommission: false })).toThrow(BadRequestException);
    expect(buildTerms({ ...dto, employmentType: 'CONTRACT', endDate: '2027-10-31' }, undefined, { canSetCommission: false }).endDate).toBe('2027-10-31');
  });

  it('diffs two versions field by field', () => {
    const v1 = buildTerms(dto, undefined, { canSetCommission: false });
    const v2 = buildTerms({ salaryAmount: 7_000_000, noticePeriodDays: 60 }, v1, { canSetCommission: false });
    expect(diffTerms(v1, v2)).toEqual([
      { field: 'salary.amount', label: 'Salary', from: 5_000_000, to: 7_000_000 },
      { field: 'noticePeriodDays', label: 'Notice period (days)', from: null, to: 60 },
    ]);
    expect(diffTerms(v1, v1)).toEqual([]);
  });

  it('does date arithmetic in UTC', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
