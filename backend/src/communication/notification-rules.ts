import { DomainEvent, NotificationType as N, Role } from '@rms/shared';
import type { DomainEventPayload } from '../common/events/event-bus.service';

export interface Person { id: string; name: string; email: string; role: string }

export interface Delivery {
  to: Person;
  notification?: { title: string; description?: string; type: N; link?: string };
  email?: { template: string; vars: Record<string, string | undefined> };
}

/** Lookups the rules need; implemented by the listener against the database. */
export interface RuleContext {
  admins(): Promise<Person[]>;
  user(id?: string | null): Promise<Person | null>;
  application(id: string): Promise<{ id: string; number: string; candidate: Person | null; recruiter: Person | null; jobTitle: string; companyName: string } | null>;
  company(id: string): Promise<{ id: string; name: string; createdBy: Person | null } | null>;
}

type Rule = (p: DomainEventPayload, ctx: RuleContext, event: string) => Promise<Delivery[]>;

const d = (p: DomainEventPayload) => (p.data ?? {}) as Record<string, string | undefined>;
const compact = <T,>(xs: (T | null | undefined)[]) => xs.filter((x): x is T => !!x);
const first = (s?: string) => s?.split(' ')[0];

/** Deep links by role. Recruiter candidate pages arrive in Part 10; the path is stable. */
const link = {
  adminApprovals: '/admin/approvals',
  adminJobRequest: (id: string) => `/admin/job-requests/${id}`,
  adminApplication: (id: string) => `/admin/applications/${id}`,
  recruiterJob: (id: string) => `/recruiter/jobs/${id}`,
  recruiterCandidate: (id: string) => `/recruiter/candidates/${id}`,
  candidateApplication: (id: string) => `/candidate/applications/${id}`,
};

const interviewDelivery = (template: string, title: (p: DomainEventPayload) => string, opts: { admins?: boolean } = {}): Rule => async (p, ctx) => {
  const data = d(p);
  const [candidate, recruiter] = await Promise.all([ctx.user(data.candidateId), ctx.user(data.recruiterId)]);
  const when = `${data.interviewDate} · ${data.interviewTime}`;
  const vars = { jobTitle: data.jobTitle, interviewDate: data.interviewDate, interviewTime: data.interviewTime, previousDate: data.previousDate, previousTime: data.previousTime, reason: p.reason };
  const out: Delivery[] = [];
  if (candidate) out.push({ to: candidate, notification: { title: title(p), description: `${data.jobTitle} · ${when}`, type: N.INTERVIEW, link: '/candidate/interviews' }, email: { template, vars: { ...vars, link: '/candidate/interviews' } } });
  // Our own first interview is between the candidate and Admin: the hiring recruiter isn't told about it.
  if (recruiter && data.stage !== 'ADMIN') out.push({ to: recruiter, notification: { title: title(p), description: `${candidate?.name ?? 'Candidate'} · ${data.jobTitle} · ${when}`, type: N.INTERVIEW, link: '/recruiter/interviews' }, email: { template, vars: { ...vars, link: '/recruiter/interviews' } } });
  if (opts.admins) out.push(...(await toAdmins(ctx, () => ({ notification: { title: title(p), description: `${candidate?.name ?? 'Candidate'} · ${data.jobTitle} · ${when}`, type: N.INTERVIEW, link: '/admin/interviews' } }))));
  return out;
};

const toAdmins = async (ctx: RuleContext, build: (admin: Person) => Omit<Delivery, 'to'>): Promise<Delivery[]> =>
  (await ctx.admins()).map((a) => ({ to: a, ...build(a) }));

const jobRequestDelivery = (template: string, title: string, type = N.RECRUITMENT): Rule => async (p, ctx) => {
  if (p.entity.type !== 'JobRequest') return [];
  const rec = await ctx.user(d(p).recruiterId);
  if (!rec) return [];
  const url = link.recruiterJob(p.entity.id);
  return [{
    to: rec,
    notification: { title: `${title}: ${d(p).title ?? 'your opening'}`, description: p.reason, type, link: url },
    email: { template, vars: { jobTitle: d(p).title, companyName: d(p).companyName, reason: p.reason, link: url } },
  }];
};

const recruiterAccount = (template: string, title: string): Rule => async (p, ctx) => {
  const rec = await ctx.user(p.entity.id);
  if (!rec) return [];
  return [{ to: rec, notification: { title, description: p.reason, type: N.RECRUITMENT, link: '/recruiter/dashboard' }, email: { template, vars: { reason: p.reason, link: '/recruiter/dashboard' } } }];
};

const companyDecision = (decision: string): Rule => async (p, ctx) => {
  const c = await ctx.company(p.entity.id);
  if (!c?.createdBy) return [];
  return [{
    to: c.createdBy,
    notification: { title: `${c.name}: ${decision.toLowerCase()}`, description: p.reason, type: N.RECRUITMENT, link: '/recruiter/companies' },
    email: { template: 'company-decision', vars: { companyName: c.name, decision, reason: p.reason, link: '/recruiter/companies' } },
  }];
};

const recruiterReturned = (verb: string): Rule => async (p, ctx) => {
  const a = await ctx.application(p.entity.id);
  if (!a?.candidate) return [];
  return toAdmins(ctx, () => ({
    notification: { title: `${a.recruiter?.name ?? 'Recruiter'} ${verb} ${a.candidate!.name}`, description: p.reason, type: N.RECRUITMENT, link: link.adminApprovals },
    email: { template: 'recruiter-rejected-candidate', vars: { recruiterName: a.recruiter?.name, candidateName: a.candidate!.name, jobTitle: a.jobTitle, reason: p.reason, link: link.adminApplication(a.id) } },
  }));
};

type ContractSide = { title: string; description?: string; email?: string; emailVars?: Record<string, string | undefined> };
/** Contract notifications go to up to four audiences, each with their own deep link. */
const contractDeliveries = (p: DomainEventPayload, ctx: RuleContext, sides: { candidate?: ContractSide; recruiter?: ContractSide; admins?: ContractSide; creator?: ContractSide }) => (async () => {
  const data = d(p);
  const id = data.contractId ?? p.entity.id;
  const base = { jobTitle: data.jobTitle, companyName: data.companyName, contractStartDate: data.contractStartDate, contractEndDate: data.contractEndDate, salary: data.salary };
  const out: Delivery[] = [];
  const mk = (to: Person, side: ContractSide, path: string, own?: Record<string, string | undefined>): Delivery => ({
    to, notification: { title: side.title, description: side.description, type: N.CONTRACT, link: path },
    ...(side.email ? { email: { template: side.email, vars: { ...base, ...own, ...side.emailVars, link: path } } } : {}),
  });
  if (sides.candidate) { const u = await ctx.user(data.candidateId); if (u) out.push(mk(u, sides.candidate, `/candidate/contracts/${id}`, { salary: data.candidateSalary ?? data.salary })); }
  if (sides.recruiter) { const u = await ctx.user(data.recruiterId); if (u) out.push(mk(u, sides.recruiter, `/recruiter/contracts/${id}`)); }
  if (sides.creator && data.createdByRole === 'RECRUITER') { const u = await ctx.user(data.createdById); if (u && !(sides.recruiter && u.id === data.recruiterId)) out.push(mk(u, sides.creator, `/recruiter/contracts/${id}`)); }
  if (sides.admins) out.push(...(await toAdmins(ctx, () => ({ notification: { title: sides.admins!.title, description: sides.admins!.description, type: N.CONTRACT, link: `/admin/contracts/${id}` } }))));
  return out;
})();


type PaymentSide = { title: string; description?: string; email?: string; emailVars?: Record<string, string | undefined> };
/**
 * Payment notifications keep the money private: the company side hears about what it owes, the candidate about their own pay,
 * and only Admin hears about everything. Commission is never mentioned outside Admin.
 */
const paymentDeliveries = (p: DomainEventPayload, ctx: RuleContext, sides: { candidate?: PaymentSide; recruiter?: PaymentSide; admins?: PaymentSide }) => (async () => {
  const data = d(p);
  const id = data.paymentId ?? p.entity.id;
  const out: Delivery[] = [];
  const mk = (to: Person, side: PaymentSide, path: string): Delivery => ({
    to, notification: { title: side.title, description: side.description, type: N.PAYMENT, link: path },
    ...(side.email ? { email: { template: side.email, vars: { ...side.emailVars, link: path } } } : {}),
  });
  if (sides.candidate) { const u = await ctx.user(data.candidateId); if (u) out.push(mk(u, sides.candidate, `/candidate/payments/${id}`)); }
  if (sides.recruiter) { const u = await ctx.user(data.recruiterId); if (u) out.push(mk(u, sides.recruiter, `/recruiter/payments/${id}`)); }
  if (sides.admins) out.push(...(await toAdmins(ctx, () => ({ notification: { title: sides.admins!.title, description: sides.admins!.description, type: N.PAYMENT, link: `/admin/payments/${id}` } }))));
  return out;
})();


type SalarySide = { title: string; description?: string; email?: string; emailVars?: Record<string, string | undefined> };
/** Salary notifications: the candidate hears only what Admin has published; recruiters hear about their own reports. */
const salaryDeliveries = (p: DomainEventPayload, ctx: RuleContext, sides: { candidate?: SalarySide; recruiter?: SalarySide; admins?: SalarySide }) => (async () => {
  const data = d(p);
  const id = data.salaryId ?? p.entity.id;
  const out: Delivery[] = [];
  const mk = (to: Person, side: SalarySide, path: string): Delivery => ({
    to, notification: { title: side.title, description: side.description, type: N.SALARY, link: path },
    ...(side.email ? { email: { template: side.email, vars: { ...side.emailVars, link: path } } } : {}),
  });
  if (sides.candidate) { const u = await ctx.user(data.candidateId); if (u) out.push(mk(u, sides.candidate, `/candidate/salary/${id}`)); }
  if (sides.recruiter) { const u = await ctx.user(data.recruiterId); if (u) out.push(mk(u, sides.recruiter, `/recruiter/salary/${id}`)); }
  if (sides.admins) out.push(...(await toAdmins(ctx, () => ({ notification: { title: sides.admins!.title, description: sides.admins!.description, type: N.SALARY, link: `/admin/salary/${id}` } }))));
  return out;
})();

/**
 * Which domain event notifies whom (spec §33, §90). Each delivery creates an in-app notification and queues an
 * email; the audit entry is written by the audit listener from the same event.
 */
export const RULES: Partial<Record<string, Rule>> = {
  [DomainEvent.CANDIDATE_REGISTERED]: async (p, ctx) => {
    const u = await ctx.user(p.actor.id);
    return u ? [{ to: u, notification: { title: 'Welcome to Talentbridge', description: 'Complete your profile to start applying.', type: N.SYSTEM, link: '/candidate/profile' }, email: { template: 'welcome', vars: { link: '/candidate/dashboard' } } }] : [];
  },
  [DomainEvent.RECRUITER_REGISTERED]: async (p, ctx) => {
    const u = await ctx.user(p.entity.id);
    const welcome: Delivery[] = u ? [{ to: u, email: { template: 'welcome', vars: { link: '/recruiter/dashboard' } } }] : [];
    const admins = await toAdmins(ctx, () => ({
      notification: { title: `New recruiter: ${d(p).name}`, description: d(p).agencyName ? `${d(p).agencyName} is waiting for approval` : 'Waiting for approval', type: N.RECRUITMENT, link: link.adminApprovals },
      email: { template: 'recruiter-registered-admin', vars: { recruiterName: d(p).name, agencyName: d(p).agencyName ?? '—', link: link.adminApprovals } },
    }));
    return [...welcome, ...admins];
  },
  [DomainEvent.RECRUITER_ACCOUNT_APPROVED]: recruiterAccount('recruiter-account-approved', 'Your recruiter account is approved'),
  [DomainEvent.RECRUITER_ACCOUNT_REJECTED]: recruiterAccount('recruiter-account-rejected', 'Update on your recruiter account'),
  [DomainEvent.RECRUITER_ACCOUNT_CHANGES_REQUESTED]: recruiterAccount('recruiter-account-rejected', 'Changes needed on your recruiter account'),

  [DomainEvent.COMPANY_SUBMITTED]: async (p, ctx) => {
    if (p.actor.role === Role.ADMIN) return [];
    const who = await ctx.user(p.actor.id);
    return toAdmins(ctx, () => ({
      notification: { title: `New company: ${d(p).name}`, description: who ? `Submitted by ${who.name}` : undefined, type: N.RECRUITMENT, link: link.adminApprovals },
      email: { template: 'company-submitted-admin', vars: { companyName: d(p).name, recruiterName: who?.name, link: link.adminApprovals } },
    }));
  },
  [DomainEvent.COMPANY_APPROVED]: companyDecision('Approved'),
  [DomainEvent.COMPANY_REJECTED]: companyDecision('Rejected'),
  [DomainEvent.COMPANY_CHANGES_REQUESTED]: companyDecision('Changes requested'),
  [DomainEvent.COMPANY_LINK_APPROVED]: async (p, ctx) => {
    const rec = await ctx.user(d(p).recruiterId);
    return rec ? [{ to: rec, notification: { title: `You can now post for ${d(p).companyName}`, type: N.RECRUITMENT, link: '/recruiter/jobs/new' }, email: { template: 'company-decision', vars: { companyName: d(p).companyName, decision: 'Approved', link: '/recruiter/jobs/new' } } }] : [];
  },
  [DomainEvent.COMPANY_LINK_REJECTED]: async (p, ctx) => {
    const rec = await ctx.user(d(p).recruiterId);
    return rec ? [{ to: rec, notification: { title: `Access to ${d(p).companyName} was declined`, description: p.reason, type: N.RECRUITMENT, link: '/recruiter/companies' }, email: { template: 'company-decision', vars: { companyName: d(p).companyName, decision: 'Declined', reason: p.reason, link: '/recruiter/companies' } } }] : [];
  },

  [DomainEvent.JOB_CREATED]: async (p, ctx) => {
    if (p.entity.type !== 'JobRequest') return [];
    return toAdmins(ctx, () => ({
      notification: { title: `Job request: ${d(p).title}`, description: `${d(p).recruiterName} · ${d(p).companyName}`, type: N.RECRUITMENT, link: link.adminJobRequest(p.entity.id) },
      email: { template: 'job-submitted', vars: { jobTitle: d(p).title, companyName: d(p).companyName, recruiterName: d(p).recruiterName, link: link.adminJobRequest(p.entity.id) } },
    }));
  },
  [DomainEvent.JOB_RESUBMITTED]: async (p, ctx) => {
    if (p.entity.type !== 'JobRequest') return [];
    return toAdmins(ctx, () => ({
      notification: { title: `Resubmitted: ${d(p).title}`, description: `${d(p).recruiterName} updated this request`, type: N.RECRUITMENT, link: link.adminJobRequest(p.entity.id) },
      email: { template: 'job-submitted', vars: { jobTitle: `${d(p).title} (resubmitted)`, companyName: d(p).companyName, recruiterName: d(p).recruiterName, link: link.adminJobRequest(p.entity.id) } },
    }));
  },
  [DomainEvent.JOB_APPROVED]: jobRequestDelivery('job-approved', 'Approved'),
  [DomainEvent.JOB_CHANGES_REQUESTED]: jobRequestDelivery('job-changes-requested', 'Changes requested'),
  [DomainEvent.JOB_REJECTED]: jobRequestDelivery('job-rejected', 'Not approved'),
  [DomainEvent.JOB_CHANGE_REQUESTED]: async (p, ctx) => {
    const who = await ctx.user(p.actor.id);
    const closing = d(p).type === 'CLOSE';
    const url = `/admin/job-changes/${p.entity.id}`;
    return toAdmins(ctx, () => ({
      notification: { title: `${closing ? 'Close' : 'Edit'} request: ${d(p).jobTitle}`, description: `${who?.name ?? 'A recruiter'} · ${p.reason ?? ''}`, type: N.RECRUITMENT, link: url },
      email: { template: 'job-change-requested', vars: { jobTitle: d(p).jobTitle, request: closing ? 'close this opening' : `change ${d(p).changedFields || 'this opening'}`, recruiterName: who?.name ?? 'A recruiter', reason: p.reason, link: url } },
    }));
  },
  [DomainEvent.JOB_CHANGE_DECIDED]: async (p, ctx) => {
    const rec = await ctx.user(d(p).recruiterId);
    if (!rec) return [];
    const url = link.recruiterJob(String(d(p).jobRequestId)), approved = d(p).decision === 'approved', closing = d(p).type === 'CLOSE';
    const what = closing ? 'closure' : 'edit';
    return [{ to: rec, notification: { title: `Your ${what} request was ${approved ? 'approved' : 'declined'}: ${d(p).jobTitle}`, description: p.reason, type: N.RECRUITMENT, link: url }, email: { template: 'job-change-decided', vars: { jobTitle: d(p).jobTitle, what, decision: approved ? 'approved' : 'declined', reason: p.reason, link: url } } }];
  },
  [DomainEvent.JOB_CHANGE_CANCELLED]: async (p, ctx) => {
    const who = await ctx.user(p.actor.id);
    return toAdmins(ctx, () => ({ notification: { title: `Request withdrawn: ${d(p).jobTitle}`, description: `${who?.name ?? 'The recruiter'} withdrew ${d(p).changeNumber}`, type: N.RECRUITMENT, link: link.adminApprovals } }));
  },

  [DomainEvent.APPLICATION_CREATED]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a?.candidate) return [];
    const mine = link.candidateApplication(a.id);
    return [
      { to: a.candidate, notification: { title: `Application received: ${a.jobTitle}`, description: `Reference ${a.number}`, type: N.RECRUITMENT, link: mine }, email: { template: 'application-received', vars: { jobTitle: a.jobTitle, companyName: a.companyName, applicationId: a.number, link: mine } } },
      ...(await toAdmins(ctx, () => ({
        notification: { title: `New application: ${a.candidate!.name}`, description: `${a.jobTitle} · ${a.number}`, type: N.RECRUITMENT, link: link.adminApplication(a.id) },
        email: { template: 'application-received-admin', vars: { candidateName: a.candidate!.name, jobTitle: a.jobTitle, applicationId: a.number, link: link.adminApplication(a.id) } },
      }))),
    ];
  },
  [DomainEvent.CANDIDATE_SHORTLISTED]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a?.candidate) return [];
    const url = link.candidateApplication(a.id);
    return [{ to: a.candidate, notification: { title: `You're shortlisted for ${a.jobTitle}`, type: N.RECRUITMENT, link: url }, email: { template: 'application-shortlisted', vars: { jobTitle: a.jobTitle, link: url } } }];
  },
  [DomainEvent.CANDIDATE_SENT_TO_RECRUITER]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a) return [];
    const out: Delivery[] = [];
    if (a.recruiter && a.candidate) out.push({
      to: a.recruiter, notification: { title: `New candidate: ${a.candidate.name}`, description: a.jobTitle, type: N.RECRUITMENT, link: link.recruiterCandidate(a.id) },
      email: { template: 'candidate-sent-to-recruiter', vars: { candidateName: a.candidate.name, jobTitle: a.jobTitle, link: link.recruiterCandidate(a.id) } },
    });
    if (a.candidate) out.push({ to: a.candidate, notification: { title: 'Your profile was shared with the hiring company', description: a.jobTitle, type: N.RECRUITMENT, link: link.candidateApplication(a.id) } });
    return out;
  },
  [DomainEvent.RECRUITER_APPROVED]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a?.candidate) return [];
    return toAdmins(ctx, () => ({
      notification: { title: `${a.recruiter?.name ?? 'Recruiter'} approved ${a.candidate!.name}`, description: a.jobTitle, type: N.RECRUITMENT, link: link.adminApplication(a.id) },
      email: { template: 'recruiter-approved-candidate', vars: { recruiterName: a.recruiter?.name, candidateName: a.candidate!.name, jobTitle: a.jobTitle, link: link.adminApplication(a.id) } },
    }));
  },
  [DomainEvent.APPLICATION_STATUS_CHANGED]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    const to = (p.newState as { status?: string } | undefined)?.status;
    if (!a?.candidate || !to) return [];
    const mine = link.candidateApplication(a.id);
    if (to === 'REJECTED') return [{ to: a.candidate, notification: { title: `Update on ${a.jobTitle}`, description: 'Your application will not move forward.', type: N.RECRUITMENT, link: mine }, email: { template: 'candidate-rejected', vars: { jobTitle: a.jobTitle, link: '/candidate/jobs' } } }];
    if (to === 'ADMIN_REVIEW' && p.actor.role === Role.RECRUITER) {
      return toAdmins(ctx, () => ({
        notification: { title: `${a.recruiter?.name ?? 'Recruiter'} returned ${a.candidate!.name}`, description: p.reason, type: N.RECRUITMENT, link: link.adminApplication(a.id) },
        email: { template: 'recruiter-rejected-candidate', vars: { recruiterName: a.recruiter?.name, candidateName: a.candidate!.name, jobTitle: a.jobTitle, reason: p.reason, link: link.adminApplication(a.id) } },
      }));
    }
    const labels: Record<string, string> = { INTERVIEW: 'You are in the interview stage', CONTRACT: 'Your contract is being prepared', PLACED: "You're placed — welcome aboard!", ADMIN_REVIEW: 'Our team is reviewing your application', ADMIN_INTERVIEW: 'Our team will interview you' };
    return labels[to] ? [{ to: a.candidate, notification: { title: labels[to], description: a.jobTitle, type: N.RECRUITMENT, link: mine } }] : [];
  },
  // The recruiter's rejection is final; Admin is only kept informed.
  [DomainEvent.RECRUITER_REJECTED]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a?.candidate) return [];
    return toAdmins(ctx, () => ({ notification: { title: `${a.recruiter?.name ?? 'Recruiter'} rejected ${a.candidate!.name}`, description: p.reason, type: N.RECRUITMENT, link: link.adminApplication(a.id) } }));
  },
  [DomainEvent.RECRUITER_REQUESTED_CHANGES]: recruiterReturned('asked for changes on'),
  [DomainEvent.CANDIDATES_REQUESTED]: async (p, ctx) =>
    toAdmins(ctx, () => ({
      notification: { title: `${d(p).recruiterName} wants more candidates`, description: `${d(p).count} for ${d(p).jobTitle}`, type: N.RECRUITMENT, link: link.adminApprovals },
      email: { template: 'more-candidates-requested', vars: { recruiterName: d(p).recruiterName, jobTitle: d(p).jobTitle, count: d(p).count, reason: p.reason, link: link.adminApprovals } },
    })),
  [DomainEvent.CANDIDATES_REQUEST_DECIDED]: async (p, ctx) => {
    const rec = await ctx.user(d(p).recruiterId);
    if (!rec) return [];
    const msg = d(p).decision === 'handled' ? `We're sourcing more candidates for ${d(p).jobTitle}.` : `We couldn't take your request for more candidates for ${d(p).jobTitle}. ${p.reason ?? ''}`;
    return [{ to: rec, notification: { title: `Request ${d(p).decision}: ${d(p).jobTitle}`, description: msg, type: N.RECRUITMENT, link: '/recruiter/jobs' }, email: { template: 'general-announcement', vars: { subject: `Your request for more candidates was ${d(p).decision}`, message: msg, link: '/recruiter/jobs' } } }];
  },
  [DomainEvent.INTERVIEW_SCHEDULED]: interviewDelivery('interview-scheduled', (p) => `Interview scheduled: ${d(p).jobTitle}`, { admins: true }),
  [DomainEvent.INTERVIEW_RESCHEDULED]: interviewDelivery('interview-rescheduled', (p) => `Interview rescheduled: ${d(p).jobTitle}`, { admins: true }),
  [DomainEvent.INTERVIEW_CANCELLED]: interviewDelivery('interview-cancelled', (p) => `Interview cancelled: ${d(p).jobTitle}`, { admins: true }),
  [DomainEvent.INTERVIEW_UPDATED]: async (p, ctx) => {
    const c = await ctx.user(d(p).candidateId);
    return c ? [{ to: c, notification: { title: `Interview details updated: ${d(p).jobTitle}`, description: `${d(p).interviewDate} · ${d(p).interviewTime}`, type: N.INTERVIEW, link: '/candidate/interviews' } }] : [];
  },
  [DomainEvent.INTERVIEW_COMPLETED]: async (p, ctx) => {
    const [candidate, recruiter] = await Promise.all([ctx.user(d(p).candidateId), ctx.user(d(p).recruiterId)]);
    const note = (to: Person, link: string): Delivery => ({ to, notification: { title: `Interview held: ${candidate?.name ?? 'candidate'}`, description: 'Add your feedback', type: N.INTERVIEW, link } });
    return [...(recruiter ? [note(recruiter, '/recruiter/interviews')] : []), ...(await toAdmins(ctx, (a) => note(a, '/admin/interviews')))];
  },
  [DomainEvent.INTERVIEW_NO_SHOW]: async (p, ctx) => {
    const candidate = await ctx.user(d(p).candidateId);
    return toAdmins(ctx, () => ({ notification: { title: `No-show: ${candidate?.name ?? 'candidate'}`, description: d(p).jobTitle, type: N.INTERVIEW, link: '/admin/interviews' } }));
  },
  [DomainEvent.INTERVIEW_FEEDBACK_SUBMITTED]: async (p, ctx) => {
    const candidate = await ctx.user(d(p).candidateId);
    return toAdmins(ctx, () => ({ notification: { title: `Feedback from ${d(p).authorName}: ${(d(p).recommendation ?? '').replace(/_/g, ' ').toLowerCase()}`, description: `${candidate?.name ?? 'Candidate'} · ${d(p).jobTitle}`, type: N.INTERVIEW, link: '/admin/interviews' } }));
  },
  [DomainEvent.CONTRACT_SUBMITTED]: async (p, ctx) => {
    const data = d(p), n = `${data.contractNumber} · ${data.candidateName}`;
    return data.status === 'PENDING_RECRUITER_APPROVAL'
      ? contractDeliveries(p, ctx, { recruiter: { title: `Contract needs your approval: ${data.candidateName}`, description: data.jobTitle, email: 'general-announcement', emailVars: { subject: 'A contract needs your approval', message: `Our team prepared contract ${data.contractNumber} for ${data.candidateName} (${data.jobTitle}). Please review and approve it.` } } })
      : contractDeliveries(p, ctx, { admins: { title: `Contract to review: ${n}`, description: data.jobTitle } });
  },
  [DomainEvent.CONTRACT_APPROVED]: async (p, ctx) => {
    const data = d(p);
    if (data.status !== 'PENDING_CANDIDATE_APPROVAL') return [];
    return contractDeliveries(p, ctx, {
      candidate: { title: `Your contract is ready: ${data.jobTitle}`, description: 'Review and respond', email: 'contract-created' },
      recruiter: { title: `Contract sent to ${data.candidateName}`, description: `Approved by ${data.party?.toLowerCase()}` },
      admins: { title: `Contract sent to ${data.candidateName}`, description: `Approved by ${data.party?.toLowerCase()}` },
    });
  },
  [DomainEvent.CONTRACT_ACTIVATED]: async (p, ctx) => {
    const data = d(p);
    return contractDeliveries(p, ctx, {
      candidate: { title: `Your contract is active: ${data.jobTitle}`, description: `Starts ${data.contractStartDate}` },
      recruiter: { title: `${data.candidateName} accepted the contract`, description: data.jobTitle },
      admins: { title: `${data.candidateName} accepted ${data.contractNumber}`, description: 'Contract is now active' },
    });
  },
  [DomainEvent.CONTRACT_DECLINED]: async (p, ctx) => {
    const data = d(p);
    const side = { title: `Contract sent back: ${data.candidateName}`, description: p.reason };
    return contractDeliveries(p, ctx, { creator: side, admins: side });
  },
  [DomainEvent.CONTRACT_CHANGE_REQUESTED]: async (p, ctx) => {
    const data = d(p);
    return contractDeliveries(p, ctx, { admins: { title: `Contract change requested: ${data.contractNumber}`, description: `${data.changes} — ${p.reason}` } });
  },
  [DomainEvent.CONTRACT_CHANGE_DECIDED]: async (p, ctx) => {
    const data = d(p);
    return contractDeliveries(p, ctx, { recruiter: { title: `Contract change ${data.decision}: ${data.contractNumber}`, description: p.reason } });
  },
  [DomainEvent.CONTRACT_UPDATED]: async (p, ctx) => {
    const data = d(p);
    const upd = { title: `Contract updated: ${data.jobTitle}`, description: `Version ${data.version} · ${data.changes}`, email: 'contract-updated' };
    return contractDeliveries(p, ctx, { candidate: upd, recruiter: upd, admins: { title: `Contract updated: ${data.contractNumber}`, description: `Version ${data.version} · ${data.changes}` } });
  },
  [DomainEvent.PAYSLIP_GENERATED]: async (p, ctx) => {
    const data = d(p);
    const u = await ctx.user(data.candidateId);
    if (!u) return [];
    const path = `/candidate/payslips/${data.payslipId}`;
    return [{
      to: u, notification: { title: `Your ${data.period} payslip is ready`, description: data.jobTitle, type: N.SALARY, link: path },
      email: { template: 'payslip-generated', vars: { payslipMonth: data.period, link: path } },
    }];
  },
  [DomainEvent.SALARY_HOURS_SUBMITTED]: async (p, ctx) => {
    const data = d(p);
    return salaryDeliveries(p, ctx, { admins: { title: `Hours submitted: ${data.candidateName} · ${data.period}`, description: `${data.hoursWorked} hours by ${data.recruiterName}` } });
  },
  [DomainEvent.SALARY_DELAY_REPORTED]: async (p, ctx) => {
    const data = d(p);
    return salaryDeliveries(p, ctx, { admins: { title: `Salary delay reported: ${data.candidateName} · ${data.period}`, description: `${data.recruiterName}: ${p.reason} (now ${data.newPayDate})` } });
  },
  [DomainEvent.SALARY_DELAYED]: async (p, ctx) => {
    const data = d(p);
    return salaryDeliveries(p, ctx, {
      candidate: { title: `Your ${data.period} pay is delayed`, description: `Now expected ${data.newPayDate}. ${p.reason}`, email: 'salary-delayed', emailVars: { payslipMonth: data.period, reason: p.reason, expectedDate: data.newPayDate } },
      recruiter: data.reportedByRole === 'RECRUITER' ? { title: `Salary delay published: ${data.candidateName} · ${data.period}`, description: `The candidate has been told it is now expected ${data.newPayDate}` } : undefined,
    });
  },
  [DomainEvent.SALARY_DELAY_REJECTED]: async (p, ctx) => {
    const data = d(p);
    return salaryDeliveries(p, ctx, { recruiter: { title: `Salary delay not published: ${data.candidateName} · ${data.period}`, description: p.reason } });
  },
  [DomainEvent.PAYMENT_GENERATED]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, {
      recruiter: { title: `Payment due: ${data.candidateName} · ${data.period}`, description: `${data.amountDue} by ${data.dueDate}`, email: 'payment-due', emailVars: { candidateName: data.candidateName, jobTitle: data.jobTitle, period: data.period, amountDue: data.amountDue, dueDate: data.dueDate } },
      admins: { title: `Payment created: ${data.paymentNumber}`, description: `${data.candidateName} · ${data.period}` },
    });
  },
  [DomainEvent.PAYMENT_ADJUSTED]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, { recruiter: { title: `Payment amount updated: ${data.period}`, description: `${data.candidateName} · now ${data.amountDue}. ${p.reason ?? ''}` } });
  },
  [DomainEvent.PAYMENT_CLIENT_PAID]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, { admins: { title: `Payment released: ${data.paymentNumber}`, description: `${data.recruiterName} released ${data.amountSent}${data.due ? ` (due ${data.due})` : ''} via ${data.method} (${data.reference}). Our commission ${data.commission}; candidate ${data.candidatePayAmount}` } });
  },
  [DomainEvent.PAYMENT_BATCH_RELEASED]: async (p, ctx) => {
    const data = d(p);
    // One notice to Admin for the whole transfer, not one per candidate.
    return toAdmins(ctx, () => ({
      notification: { title: `Payment released: ${data.count} payment${Number(data.count) > 1 ? 's' : ''}, ${data.total}`, description: `${data.recruiterName} via ${data.method} (${data.reference}). Our commission ${data.commission}. ${data.paymentNumbers}`, type: N.PAYMENT, link: '/admin/payments?tab=confirm' },
    }));
  },
  [DomainEvent.PAYMENT_REQUESTED]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, {
      recruiter: { title: `${data.candidateName} asked for their pay`, description: `${data.jobTitle} · ${data.period}${data.note ? ` — ${data.note}` : ''}. Please release ${data.amountDue}` },
      admins: { title: `${data.candidateName} asked for their pay`, description: `${data.jobTitle} · ${data.period}. Waiting for ${data.recruiterName} to release it` },
    });
  },
  [DomainEvent.PAYMENT_RECEIVED]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, {
      recruiter: { title: `Payment received: ${data.candidateName} · ${data.period}`, description: 'Thank you — we have confirmed it', email: 'payment-confirmed', emailVars: { candidateName: data.candidateName, period: data.period, amountDue: data.amountDue } },
      candidate: { title: `Your ${data.period} pay is being prepared`, description: data.candidatePay },
      admins: { title: `Payout due: ${data.paymentNumber}`, description: `${data.candidateName} · ${data.candidatePay}` },
    });
  },
  [DomainEvent.PAYMENT_DISPUTED]: async (p, ctx) => {
    const data = d(p);
    return data.leg === 'payout'
      ? paymentDeliveries(p, ctx, { admins: { title: `Payout disputed: ${data.paymentNumber}`, description: `${data.candidateName}: ${p.reason}` } })
      : paymentDeliveries(p, ctx, { recruiter: { title: `Payment needs attention: ${data.period}`, description: p.reason, email: 'payment-attention', emailVars: { candidateName: data.candidateName, period: data.period, reason: p.reason } } });
  },
  [DomainEvent.PAYMENT_RESOLVED]: async (p, ctx) => {
    const data = d(p);
    return data.leg === 'payout'
      ? paymentDeliveries(p, ctx, { candidate: { title: `Your ${data.period} payment is settled`, description: p.reason } })
      : paymentDeliveries(p, ctx, { recruiter: { title: `Payment settled: ${data.period}`, description: p.reason } });
  },
  [DomainEvent.PAYMENT_PAYOUT_SENT]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, { candidate: { title: `Your pay was sent: ${data.candidatePay}`, description: `${data.period} · ${data.method} (${data.reference}). Please confirm when it arrives`, email: 'payout-sent', emailVars: { period: data.period, amount: data.candidatePay, method: data.method, reference: data.reference } } });
  },
  [DomainEvent.PAYMENT_PAYOUT_CONFIRMED]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, { admins: { title: `Payout confirmed: ${data.paymentNumber}`, description: `${data.candidateName} received ${data.candidatePay}` } });
  },
  [DomainEvent.PAYMENT_OVERDUE]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, {
      recruiter: { title: `Payment overdue: ${data.candidateName} · ${data.period}`, description: `${data.amountDue} was due ${data.dueDate}`, email: 'payment-overdue', emailVars: { candidateName: data.candidateName, period: data.period, amountDue: data.amountDue, dueDate: data.dueDate } },
      admins: { title: `Payment overdue: ${data.paymentNumber}`, description: `${data.recruiterName} · ${data.amountDue} · due ${data.dueDate}` },
    });
  },
  [DomainEvent.PAYMENT_CANCELLED]: async (p, ctx) => {
    const data = d(p);
    return paymentDeliveries(p, ctx, { recruiter: { title: `Payment cancelled: ${data.period}`, description: p.reason } });
  },
  [DomainEvent.CONTRACT_EXPIRING]: async (p, ctx) => {
    const data = d(p);
    const side = { title: `Contract ending in ${data.daysLeft} days: ${data.contractNumber}`, description: `${data.candidateName} · ${data.jobTitle}` };
    return contractDeliveries(p, ctx, { candidate: side, recruiter: side, admins: side });
  },
  [DomainEvent.CONTRACT_EXPIRED]: async (p, ctx) => {
    const data = d(p);
    const side = { title: `Contract expired: ${data.contractNumber}`, description: `${data.candidateName} · ${data.jobTitle}` };
    return contractDeliveries(p, ctx, { candidate: side, recruiter: side, admins: side });
  },
  [DomainEvent.CONTRACT_TERMINATED]: async (p, ctx) => {
    const data = d(p);
    const side = { title: `Contract terminated: ${data.contractNumber}`, description: p.reason, email: 'general-announcement', emailVars: { subject: `Contract ${data.contractNumber} was terminated`, message: `The contract for ${data.jobTitle} has been terminated. Reason: ${p.reason ?? 'not given'}.` } };
    return contractDeliveries(p, ctx, { candidate: side, recruiter: side, admins: { title: side.title, description: side.description } });
  },
  [DomainEvent.CANDIDATE_SELECTED]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a?.candidate) return [];
    const mine = link.candidateApplication(a.id);
    return [
      { to: a.candidate, notification: { title: `Congratulations — selected for ${a.jobTitle}`, type: N.RECRUITMENT, link: mine }, email: { template: 'candidate-selected', vars: { jobTitle: a.jobTitle, companyName: a.companyName, link: mine } } },
      ...(await toAdmins(ctx, () => ({ notification: { title: `${a.candidate!.name} was selected`, description: a.jobTitle, type: N.RECRUITMENT, link: link.adminApplication(a.id) } }))),
    ];
  },
  [DomainEvent.APPLICATION_WITHDRAWN]: async (p, ctx) => {
    const a = await ctx.application(p.entity.id);
    if (!a?.candidate) return [];
    return toAdmins(ctx, () => ({ notification: { title: `${a.candidate!.name} withdrew`, description: a.jobTitle, type: N.RECRUITMENT, link: link.adminApplication(a.id) } }));
  },
  [DomainEvent.CONTACT_RECEIVED]: async (p, ctx) =>
    toAdmins(ctx, () => ({
      notification: { title: `New enquiry from ${d(p).senderName}`, description: d(p).message?.slice(0, 120), type: N.SYSTEM, link: '/admin/dashboard' },
      email: { template: 'contact-received-admin', vars: { senderName: d(p).senderName, senderEmail: d(p).senderEmail, message: d(p).message, link: '/admin/dashboard' } },
    })),
  [DomainEvent.PASSWORD_RESET]: async (p, ctx) => {
    const u = await ctx.user(p.actor.id);
    return u ? [{ to: u, notification: { title: 'Your password was changed', description: "If this wasn't you, contact support immediately.", type: N.SYSTEM } }] : [];
  },
};
