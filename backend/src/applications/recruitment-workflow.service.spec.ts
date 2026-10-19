import { ApplicationStatus as S, Role } from '@rms/shared';
import { allowedTransitions, TRANSITIONS } from './recruitment-workflow.service';

const targets = (from: S, role: Role) => allowedTransitions(from, role).map((t) => t.to);

describe('recruitment workflow transitions', () => {
  it('follows the spec path for the happy case', () => {
    const path: [S, S, Role][] = [
      [S.APPLIED, S.ADMIN_REVIEW, Role.ADMIN], [S.ADMIN_REVIEW, S.ADMIN_INTERVIEW, Role.ADMIN], [S.ADMIN_INTERVIEW, S.ADMIN_SHORTLISTED, Role.ADMIN], [S.ADMIN_SHORTLISTED, S.SENT_TO_RECRUITER, Role.ADMIN],
      [S.SENT_TO_RECRUITER, S.RECRUITER_REVIEW, Role.RECRUITER], [S.RECRUITER_REVIEW, S.RECRUITER_APPROVED, Role.RECRUITER], [S.RECRUITER_APPROVED, S.INTERVIEW, Role.RECRUITER],
      [S.INTERVIEW, S.SELECTED, Role.RECRUITER], [S.SELECTED, S.CONTRACT, Role.ADMIN], [S.CONTRACT, S.PLACED, Role.ADMIN],
    ];
    for (const [from, to, role] of path) expect(targets(from, role)).toContain(to);
  });

  it('cannot go from review straight to shortlisted: our interview comes first', () => {
    expect(targets(S.ADMIN_REVIEW, Role.ADMIN)).not.toContain(S.ADMIN_SHORTLISTED);
  });

  it('never lets a candidate skip ahead (APPLIED cannot jump to PLACED)', () => {
    expect(targets(S.APPLIED, Role.ADMIN)).not.toContain(S.PLACED);
    expect(targets(S.APPLIED, Role.RECRUITER)).toEqual([]);
    expect(targets(S.APPLIED, Role.CANDIDATE)).toEqual([S.WITHDRAWN]);
  });

  it('recruiters cannot touch candidates before they are sent, and a recruiter "no" goes back to Admin', () => {
    for (const s of [S.APPLIED, S.ADMIN_REVIEW, S.ADMIN_SHORTLISTED]) expect(targets(s, Role.RECRUITER)).toEqual([]);
    const back = allowedTransitions(S.RECRUITER_REVIEW, Role.RECRUITER).find((t) => t.to === S.ADMIN_REVIEW);
    expect(back).toMatchObject({ reasonRequired: true });
    expect(targets(S.RECRUITER_REVIEW, Role.RECRUITER)).toContain(S.REJECTED); // a recruiter's rejection is immediate
    expect(targets(S.ADMIN_REVIEW, Role.RECRUITER)).toEqual([]); // but only for candidates sent to them
  });

  it('Admin can reject at any live stage, a recruiter only until the hire, and terminal states have no exits', () => {
    expect(targets(S.INTERVIEW, Role.ADMIN)).toContain(S.REJECTED);
    expect(targets(S.INTERVIEW, Role.RECRUITER)).toContain(S.REJECTED);
    expect(targets(S.SELECTED, Role.RECRUITER)).not.toContain(S.REJECTED);
    for (const s of [S.PLACED, S.REJECTED, S.WITHDRAWN]) {
      expect(TRANSITIONS[s]).toEqual([]);
      for (const r of [Role.ADMIN, Role.RECRUITER, Role.CANDIDATE]) expect(targets(s, r)).toEqual([]);
    }
  });

  it('candidates can withdraw until a contract is being prepared', () => {
    expect(targets(S.INTERVIEW, Role.CANDIDATE)).toContain(S.WITHDRAWN);
    expect(targets(S.CONTRACT, Role.CANDIDATE)).not.toContain(S.WITHDRAWN);
  });
});
