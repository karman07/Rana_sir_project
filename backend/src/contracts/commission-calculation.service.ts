import { BadRequestException, Injectable } from '@nestjs/common';

/** Percent rules are stored in basis points (1000 = 10.00%) so there is never a floating-point rate. */
export type CommissionRule = { type: 'PERCENT'; basisPoints: number } | { type: 'FIXED'; amount: number };

export interface CommissionResult {
  grossAmount: number;
  commission: number;
  candidateAmount: number;
  platformAmount: number;
}

export interface SalaryInput { amount: number; period: 'HOUR' | 'MONTH' | 'YEAR'; /** Needed for hourly pay. */ hoursPerWeek?: number }

export interface ContractFinancials {
  currency: string;
  /** Per month, the basis for payments and payslips. */
  monthly: CommissionResult;
  /** Per year, for reporting. */
  annual: CommissionResult;
  rule: CommissionRule;
}

const isMinor = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/**
 * The single place commission and candidate pay are calculated (spec §40, §77).
 * Money is whole minor units (paise/cents); rounding is half-up, applied once, on the commission.
 * The candidate always receives exactly gross minus commission, so the two never drift apart.
 * The frontend only displays what this returns.
 */
@Injectable()
export class CommissionCalculationService {
  calculate(grossAmount: number, rule: CommissionRule): CommissionResult {
    if (!isMinor(grossAmount)) throw new BadRequestException('Gross amount must be a whole number of minor units');
    let commission: number;
    if (rule.type === 'PERCENT') {
      if (!Number.isInteger(rule.basisPoints) || rule.basisPoints < 0 || rule.basisPoints > 10_000) throw new BadRequestException('Commission percentage must be between 0 and 100');
      commission = Math.floor((grossAmount * rule.basisPoints + 5_000) / 10_000);
    } else {
      if (!isMinor(rule.amount)) throw new BadRequestException('Fixed commission must be a whole number of minor units');
      commission = Math.min(rule.amount, grossAmount); // never more than the amount being split
    }
    return { grossAmount, commission, candidateAmount: grossAmount - commission, platformAmount: commission };
  }

  /** Annual salary is paid monthly in twelve equal instalments (half-up), so a month is never off by more than a minor unit. */
  forContract(salary: SalaryInput, currency: string, rule: CommissionRule): ContractFinancials {
    if (!isMinor(salary.amount)) throw new BadRequestException('Salary must be a whole number of minor units');
    if (salary.period === 'HOUR' && !(salary.hoursPerWeek && salary.hoursPerWeek > 0)) throw new BadRequestException('Hourly pay needs the expected hours per week');
    // Hourly: rate x hours/week x 52 weeks a year; a month is a twelfth of that (half-up).
    const annualGross = salary.period === 'YEAR' ? salary.amount : salary.period === 'MONTH' ? salary.amount * 12 : Math.round(salary.amount * salary.hoursPerWeek! * 52);
    const monthlyGross = salary.period === 'MONTH' ? salary.amount : Math.floor((annualGross + 6) / 12);
    return { currency: currency.toUpperCase(), monthly: this.calculate(monthlyGross, rule), annual: this.calculate(annualGross, rule), rule };
  }

  /** The fraction of the contract rate the candidate keeps. Candidates are shown figures scaled by this, so the commission is never visible. */
  candidateShare(salary: SalaryInput, currency: string, rule: CommissionRule): number {
    if (rule.type === 'PERCENT') return 1 - rule.basisPoints / 10_000;
    const f = this.forContract(salary, currency, rule).monthly;
    return f.grossAmount > 0 ? f.candidateAmount / f.grossAmount : 1;
  }

  /** Human-friendly description of a rule, for emails and timelines. */
  describe(rule: CommissionRule): string {
    return rule.type === 'PERCENT' ? `${(rule.basisPoints / 100).toFixed(rule.basisPoints % 100 ? 2 : 0)}%` : 'fixed';
  }
}
