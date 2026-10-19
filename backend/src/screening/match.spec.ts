import { computeMatch } from './match';

const job = { technicalSkills: ['Node.js', 'MongoDB', 'AWS'], experienceMin: 4, experienceMax: 8, salaryMax: 4_200_000_00, currency: 'INR' };

describe('computeMatch', () => {
  it('scores a strong candidate high, with a skill breakdown', () => {
    const r = computeMatch({ candidate: { skills: ['nodejs', 'MongoDB', 'aws', 'Docker'], experienceYears: 6, expectedSalary: { amount: 3_500_000_00, currency: 'INR' } }, job });
    expect(r.overall).toBe(100);
    expect(r.skills).toMatchObject({ percent: 100, missing: [] });
    expect(r.salary).toMatchObject({ percent: 100, note: 'Within budget' });
  });

  it('shows what is missing and penalises under-experience', () => {
    const r = computeMatch({ candidate: { skills: ['Node.js'], experienceYears: 2, expectedSalary: { amount: 3_000_000_00, currency: 'INR' } }, job });
    expect(r.skills.matched).toEqual(['Node.js']);
    expect(r.skills.missing).toEqual(['MongoDB', 'AWS']);
    expect(r.skills.percent).toBe(33);
    expect(r.experience.percent).toBe(50);
    expect(r.overall).toBeLessThan(60);
  });

  it('flags salary above budget and ignores salary when currencies differ', () => {
    const base = { skills: ['Node.js', 'MongoDB', 'AWS'], experienceYears: 5 };
    expect(computeMatch({ candidate: { ...base, expectedSalary: { amount: 6_000_000_00, currency: 'INR' } }, job }).salary).toEqual({ percent: 30, note: 'Above budget' });
    const usd = computeMatch({ candidate: { ...base, expectedSalary: { amount: 1, currency: 'USD' } }, job });
    expect(usd.salary).toEqual({ percent: null, note: 'Different currency' });
    expect(usd.overall).toBe(100); // weights renormalised without salary
  });

  it('handles missing data without crashing', () => {
    const r = computeMatch({ candidate: {}, job: {} });
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(r.skills.percent).toBe(100);
  });
});
