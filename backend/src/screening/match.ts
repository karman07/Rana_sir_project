export interface MatchInput {
  candidate: { skills?: string[]; experienceYears?: number | null; expectedSalary?: { amount: number; currency: string } | null };
  job: { technicalSkills?: string[]; experienceMin?: number; experienceMax?: number; salaryMax?: number; currency?: string };
}

export interface MatchResult {
  /** 0-100, a transparent rules-based estimate. Admin's own score is what decides; this is a guide. */
  overall: number;
  skills: { percent: number; matched: string[]; missing: string[] };
  experience: { percent: number; years: number | null; required: string };
  salary: { percent: number | null; note: string };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[.\s]+/g, '');
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Deterministic candidate-to-job match: skills 55%, experience 30%, salary 15% (salary omitted when it cannot be compared). */
export function computeMatch({ candidate, job }: MatchInput): MatchResult {
  const have = (candidate.skills ?? []).map(norm);
  const wanted = job.technicalSkills ?? [];
  const matched = wanted.filter((w) => have.some((h) => h === norm(w) || h.includes(norm(w)) || norm(w).includes(h)));
  const missing = wanted.filter((w) => !matched.includes(w));
  const skillsPct = wanted.length ? matched.length / wanted.length : 1;

  const years = candidate.experienceYears ?? null;
  const min = job.experienceMin ?? 0;
  let expPct = 1;
  if (years === null) expPct = 0.4;
  else if (years < min) expPct = clamp(1 - (min - years) / Math.max(min, 1));
  else if (job.experienceMax !== undefined && years > job.experienceMax + 3) expPct = 0.8;
  const required = job.experienceMax !== undefined ? `${min}–${job.experienceMax} yrs` : `${min}+ yrs`;

  let salaryPct: number | null = null;
  let note = 'Not comparable';
  const es = candidate.expectedSalary;
  if (es && job.salaryMax !== undefined && job.currency && es.currency.toUpperCase() === job.currency.toUpperCase()) {
    if (es.amount <= job.salaryMax) { salaryPct = 1; note = 'Within budget'; }
    else if (es.amount <= job.salaryMax * 1.15) { salaryPct = 0.7; note = 'Slightly above budget'; }
    else { salaryPct = 0.3; note = 'Above budget'; }
  } else if (es && job.currency && es.currency.toUpperCase() !== job.currency.toUpperCase()) note = 'Different currency';

  const parts: [number, number][] = [[skillsPct, 0.55], [expPct, 0.3]];
  if (salaryPct !== null) parts.push([salaryPct, 0.15]);
  const totalW = parts.reduce((a, [, w]) => a + w, 0);
  const overall = Math.round((parts.reduce((a, [v, w]) => a + v * w, 0) / totalW) * 100);

  return {
    overall,
    skills: { percent: Math.round(skillsPct * 100), matched, missing },
    experience: { percent: Math.round(expPct * 100), years, required },
    salary: { percent: salaryPct === null ? null : Math.round(salaryPct * 100), note },
  };
}
