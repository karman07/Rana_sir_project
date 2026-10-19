import { CommissionCalculationService } from './commission-calculation.service';
import { buildContractDocView, payLine, renderContractPdf } from './contract-document';
import type { ContractTerms } from './schemas/contract-version.schema';

const calc = new CommissionCalculationService();
const terms = (over: Partial<ContractTerms> = {}): ContractTerms => ({
  title: 'Data Analyst', employmentType: 'PART_TIME', salary: { amount: 10_000_000, currency: 'INR', period: 'MONTH' },
  commission: { type: 'PERCENT', basisPoints: 1500 }, startDate: '2026-11-01', ...over,
});
const base = { kind: 'CONTRACT' as const, contractNumber: 'CON-0001', version: 2, candidate: { name: 'Cara', email: 'c@x.dev' }, company: 'Acme', jobTitle: 'Data Analyst' };

describe('contract documents', () => {
  it('give the candidate their own pay and the company the rate it pays', () => {
    const c = buildContractDocView({ ...base, audience: 'CANDIDATE', terms: terms() }, calc);
    const co = buildContractDocView({ ...base, audience: 'COMPANY', terms: terms() }, calc);
    expect(c.pay.amount).toBe(8_500_000);
    expect(co.pay.amount).toBe(10_000_000);
  });

  it('never carry the commission, for either reader', () => {
    for (const audience of ['CANDIDATE', 'COMPANY'] as const) {
      expect(JSON.stringify(buildContractDocView({ ...base, audience, terms: terms() }, calc))).not.toMatch(/commission|basisPoints|platform|1500/i);
    }
  });

  it('scale an hourly rate and handle a fixed commission', () => {
    const hourly = buildContractDocView({ ...base, audience: 'CANDIDATE', terms: terms({ salary: { amount: 50_000, currency: 'USD', period: 'HOUR', hoursPerWeek: 20 }, commission: { type: 'PERCENT', basisPoints: 1000 } }) }, calc);
    expect(hourly.pay).toMatchObject({ amount: 45_000, period: 'HOUR', hoursPerWeek: 20 });
    expect(payLine(hourly.pay)).toBe('USD 450.00 per hour, about 20 hours a week');
    const fixed = buildContractDocView({ ...base, audience: 'CANDIDATE', terms: terms({ commission: { type: 'FIXED', amount: 1_000_000 } }) }, calc);
    expect(fixed.pay.amount).toBe(9_000_000);
  });

  it('render to a real PDF, for an offer and a contract', async () => {
    for (const kind of ['OFFER', 'CONTRACT'] as const) {
      const pdf = await renderContractPdf(buildContractDocView({ ...base, kind, audience: 'CANDIDATE', terms: terms({ notes: 'Flexible hours; José will report to Priya.' }), accepted: kind === 'CONTRACT' ? { by: 'Cara', on: '2026-10-01' } : undefined }, calc));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1500);
    }
  });
});
