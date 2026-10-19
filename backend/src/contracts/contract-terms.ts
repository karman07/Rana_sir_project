import { BadRequestException } from '@nestjs/common';
import { EmploymentType } from '@rms/shared';
import type { CommissionRule } from './commission-calculation.service';
import type { TermsDto } from './dto/contract.dto';
import type { ContractTerms } from './schemas/contract-version.schema';

/** Platform default until commission rules become configurable (Part 13): 10%. */
export const DEFAULT_COMMISSION: CommissionRule = { type: 'PERCENT', basisPoints: 1000 };

const LABELS: Record<string, string> = {
  title: 'Job title', employmentType: 'Employment type', 'salary.amount': 'Salary', 'salary.currency': 'Currency', 'salary.period': 'Pay basis', 'salary.hoursPerWeek': 'Hours per week',
  'commission': 'Commission', startDate: 'Start date', endDate: 'End date', probationMonths: 'Probation (months)', workingHours: 'Working hours',
  noticePeriodDays: 'Notice period (days)', renewalTerms: 'Renewal terms', notes: 'Notes',
};

/** Whether the contract has a fixed end (and therefore must say when). */
export const isFixedTerm = (t: Pick<ContractTerms, 'employmentType'>) => t.employmentType === EmploymentType.CONTRACT || t.employmentType === EmploymentType.TEMPORARY || t.employmentType === EmploymentType.INTERNSHIP;

/**
 * Merges the submitted fields over a base set of terms and validates the result.
 * Commission is only taken from Admin; for anyone else the existing (or default) rule is kept.
 */
export function buildTerms(dto: TermsDto, base: ContractTerms | undefined, opts: { canSetCommission: boolean; defaultRule?: CommissionRule }): ContractTerms {
  const problems: string[] = [];
  const rule: CommissionRule =
    opts.canSetCommission && dto.commissionFixed !== undefined ? { type: 'FIXED', amount: dto.commissionFixed }
    : opts.canSetCommission && dto.commissionPercent !== undefined ? { type: 'PERCENT', basisPoints: Math.round(dto.commissionPercent * 100) }
    : base?.commission ?? opts.defaultRule ?? DEFAULT_COMMISSION;

  const t: ContractTerms = {
    title: dto.title ?? base?.title ?? '',
    employmentType: dto.employmentType ?? base?.employmentType ?? '',
    salary: {
      amount: dto.salaryAmount ?? base?.salary.amount ?? 0,
      currency: (dto.currency ?? base?.salary.currency ?? '').toUpperCase(),
      period: dto.salaryPeriod ?? base?.salary.period ?? 'MONTH',
      hoursPerWeek: (dto.salaryPeriod ?? base?.salary.period) === 'HOUR' ? dto.hoursPerWeek ?? base?.salary.hoursPerWeek : undefined,
    },
    commission: rule,
    startDate: dto.startDate ?? base?.startDate ?? '',
    endDate: dto.endDate !== undefined ? dto.endDate || undefined : base?.endDate,
    probationMonths: dto.probationMonths ?? base?.probationMonths,
    workingHours: dto.workingHours ?? base?.workingHours,
    noticePeriodDays: dto.noticePeriodDays ?? base?.noticePeriodDays,
    renewalTerms: dto.renewalTerms ?? base?.renewalTerms,
    notes: dto.notes ?? base?.notes,
  };

  if (!t.title.trim()) problems.push('Job title is required');
  if (!t.employmentType) problems.push('Employment type is required');
  if (!(t.salary.amount > 0)) problems.push('Salary is required');
  if (t.salary.period === 'HOUR' && !t.salary.hoursPerWeek) problems.push('Hours per week is required for hourly pay');
  if (!/^[A-Z]{3}$/.test(t.salary.currency)) problems.push('Currency is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate) || Number.isNaN(Date.parse(t.startDate))) problems.push('A valid start date is required');
  if (t.endDate && (Number.isNaN(Date.parse(t.endDate)) || t.endDate < t.startDate)) problems.push('The end date cannot be before the start date');
  if (isFixedTerm(t) && !t.endDate) problems.push('Contract, temporary and internship roles need an end date');
  if (problems.length) throw new BadRequestException({ message: problems, code: 'VALIDATION_FAILED' });
  return t;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-by-field differences between two sets of terms (the "previous values / new values" of a version). */
export function diffTerms(a: ContractTerms, b: ContractTerms): { field: string; label: string; from: unknown; to: unknown }[] {
  const flat = (t: ContractTerms): Record<string, unknown> => ({
    title: t.title, employmentType: t.employmentType, 'salary.amount': t.salary.amount, 'salary.currency': t.salary.currency, 'salary.period': t.salary.period, 'salary.hoursPerWeek': t.salary.hoursPerWeek,
    commission: t.commission, startDate: t.startDate, endDate: t.endDate, probationMonths: t.probationMonths, workingHours: t.workingHours,
    noticePeriodDays: t.noticePeriodDays, renewalTerms: t.renewalTerms, notes: t.notes,
  });
  const fa = flat(a), fb = flat(b);
  return Object.keys(LABELS).filter((k) => !sameJson(fa[k], fb[k])).map((k) => ({ field: k, label: LABELS[k], from: fa[k] ?? null, to: fb[k] ?? null }));
}

export const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);
export const addDays = (isoDate: string, days: number) => new Date(Date.parse(isoDate) + days * 86_400_000).toISOString().slice(0, 10);
