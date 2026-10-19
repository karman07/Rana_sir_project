import { EmploymentType } from '@rms/shared';
import type { JobSpec } from './schemas/job-spec.schema';

/**
 * Completeness rules applied when a request is submitted for review (drafts may be partial).
 * Returns human-readable messages; an empty list means the spec is submittable.
 */
export function validateForSubmission(spec: Partial<JobSpec> | undefined): string[] {
  const s = spec ?? {};
  const e: string[] = [];
  const need = (ok: unknown, msg: string) => { if (!ok) e.push(msg); };

  need(s.title?.trim(), 'Job title is required');
  need(s.location?.trim(), 'Location is required');
  need(s.workMode, 'Choose remote, hybrid or on-site');
  need(s.employmentType, 'Employment type is required');
  need(s.openings && s.openings >= 1, 'Number of openings is required');

  const r = s.requirements;
  need(r?.experienceMin !== undefined, 'Minimum experience is required');
  if (r?.experienceMin !== undefined && r.experienceMax !== undefined && r.experienceMax < r.experienceMin) {
    e.push('Maximum experience cannot be below the minimum');
  }
  need((r?.technicalSkills?.length ?? 0) > 0, 'Add at least one technical skill');

  const c = s.compensation;
  need(c?.currency, 'Currency is required');
  need(c?.salaryMin !== undefined && c?.salaryMax !== undefined, 'Salary range is required');
  if (c?.salaryMin !== undefined && c.salaryMax !== undefined && c.salaryMax < c.salaryMin) {
    e.push('Maximum salary cannot be below the minimum');
  }

  const fixedTerm = s.employmentType === EmploymentType.CONTRACT || s.employmentType === EmploymentType.TEMPORARY;
  if (fixedTerm) need(s.contract?.durationMonths, 'Contract duration is required for contract and temporary roles');

  need((s.details?.description?.trim().length ?? 0) >= 30, 'Add a description of at least 30 characters');
  need(s.details?.responsibilities?.trim(), 'Responsibilities are required');
  return e;
}
