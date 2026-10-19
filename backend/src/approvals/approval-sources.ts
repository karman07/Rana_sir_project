import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JobRequestStatus, ReviewStatus, formatMoney } from '@rms/shared';
import type { Model } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { CompaniesService } from '../companies/companies.service';
import { Company } from '../companies/schemas/company.schema';
import { RecruiterCompany } from '../companies/schemas/recruiter-company.schema';
import { Application } from '../applications/schemas/application.schema';
import { ApplicationStatus } from '@rms/shared';
import { RecruitmentWorkflowService } from '../applications/recruitment-workflow.service';
import { CandidateRequest } from '../screening/schemas/candidate-request.schema';
import { RecruiterReviewService } from '../screening/recruiter-review.service';
import { Contract } from '../contracts/schemas/contract.schema';
import { ContractVersion } from '../contracts/schemas/contract-version.schema';
import { ContractsService } from '../contracts/contracts.service';
import { Payment } from '../payments/schemas/payment.schema';
import { PaymentsService } from '../payments/payments.service';
import { Salary } from '../salary/schemas/salary.schema';
import { SalaryService } from '../salary/salary.service';
import { JobRequestsService } from '../jobs/job-requests.service';
import { JobRequest } from '../jobs/schemas/job-request.schema';
import { JobChangesService } from '../jobs/job-changes.service';
import { JobChangeRequest } from '../jobs/schemas/job-change-request.schema';
import { RecruitersService } from '../recruiters/recruiters.service';
import { RecruiterProfile } from '../recruiters/schemas/recruiter-profile.schema';
import type { ApprovalAction, ApprovalCandidate, ApprovalSource } from './approval.types';
import { ApprovalsService } from './approvals.service';

type Body = { note?: string; publish?: boolean; commission?: { type: 'PERCENT' | 'FIXED'; percent?: number; amount?: number } };
const ALL: ApprovalAction[] = ['approve', 'request-changes', 'reject'];

@Injectable()
export class RecruiterAccountSource implements ApprovalSource {
  readonly category = 'RECRUITER_ACCOUNT';
  readonly label = 'Recruiter decisions';
  readonly itemLabel = 'Recruiter sign-up';
  readonly description = 'New recruiter accounts waiting for approval';
  constructor(@InjectModel(RecruiterProfile.name) private readonly profiles: Model<RecruiterProfile>, private readonly recruiters: RecruitersService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.profiles.aggregate([
      { $match: { approvalStatus: ReviewStatus.PENDING_REVIEW } },
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'u' } }, { $unwind: '$u' },
    ]);
    return rows.map((r) => ({
      entityId: String(r.userId), title: r.u.name, subtitle: [r.agencyName, r.u.email].filter(Boolean).join(' · '),
      requester: { id: String(r.userId), name: r.u.name, role: 'RECRUITER' },
      related: r.agencyName ? { type: 'Agency', label: r.agencyName } : undefined,
      href: '/admin/recruiters', submittedAt: r.submittedAt ?? r.createdAt, actions: ALL,
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'approve') return this.recruiters.approve(id, admin, b.note);
    if (action === 'reject') return this.recruiters.reject(id, admin, b.note!);
    return this.recruiters.requestChanges(id, admin, b.note!);
  }
}

@Injectable()
export class CompanySource implements ApprovalSource {
  readonly category = 'COMPANY';
  readonly label = 'Companies';
  readonly itemLabel = 'Company';
  readonly description = 'Client companies recruiters want to post for';
  constructor(@InjectModel(Company.name) private readonly companies: Model<Company>, private readonly service: CompaniesService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.companies.aggregate([
      { $match: { approvalStatus: ReviewStatus.PENDING_REVIEW } },
      { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'u' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: r.name, subtitle: [r.industry, r.location].filter(Boolean).join(' · ') || undefined,
      requester: r.u[0] ? { id: String(r.u[0]._id), name: r.u[0].name, role: r.u[0].role } : undefined,
      href: '/admin/companies', submittedAt: r.submittedAt ?? r.createdAt, actions: ALL,
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'approve') return this.service.approve(id, admin, b.note);
    if (action === 'reject') return this.service.reject(id, admin, b.note!);
    return this.service.requestChanges(id, admin, b.note!);
  }
}

@Injectable()
export class CompanyLinkSource implements ApprovalSource {
  readonly category = 'COMPANY_LINK';
  readonly label = 'Company access';
  readonly itemLabel = 'Company access request';
  readonly description = 'Recruiters asking to represent an existing company';
  constructor(@InjectModel(RecruiterCompany.name) private readonly links: Model<RecruiterCompany>, private readonly service: CompaniesService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    // Links to companies that are themselves still pending are decided together with the company.
    const rows = await this.links.aggregate([
      { $match: { approvalStatus: ReviewStatus.PENDING_REVIEW } },
      { $lookup: { from: 'companies', localField: 'companyId', foreignField: '_id', as: 'c' } }, { $unwind: '$c' },
      { $match: { 'c.approvalStatus': ReviewStatus.APPROVED } },
      { $lookup: { from: 'users', localField: 'recruiterUserId', foreignField: '_id', as: 'u' } }, { $unwind: '$u' },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.u.name} → ${r.c.name}`, subtitle: 'Wants to post openings for this company',
      requester: { id: String(r.u._id), name: r.u.name, role: 'RECRUITER' }, related: { type: 'Company', label: r.c.name, href: '/admin/companies' },
      submittedAt: r.createdAt, actions: ['approve', 'reject'],
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'request-changes') throw new ConflictException('Not supported for this request');
    return this.service.decideLink(id, admin, action === 'approve', b.note);
  }
}

@Injectable()
export class JobRequestSource implements ApprovalSource {
  readonly category = 'JOB_REQUEST';
  readonly label = 'Job requests';
  readonly itemLabel = 'Job request';
  readonly description = 'Openings submitted by recruiters';
  constructor(@InjectModel(JobRequest.name) private readonly requests: Model<JobRequest>, private readonly service: JobRequestsService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.requests.aggregate([
      { $match: { status: JobRequestStatus.PENDING_ADMIN_REVIEW } },
      { $lookup: { from: 'companies', localField: 'companyId', foreignField: '_id', as: 'c' } },
      { $lookup: { from: 'users', localField: 'recruiterId', foreignField: '_id', as: 'u' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: r.spec?.title || 'Untitled', subtitle: [r.requestNumber, r.c[0]?.name, r.spec?.location].filter(Boolean).join(' · '),
      requester: r.u[0] ? { id: String(r.u[0]._id), name: r.u[0].name, role: 'RECRUITER' } : undefined,
      related: r.c[0] ? { type: 'Company', label: r.c[0].name } : undefined,
      href: `/admin/job-requests/${r._id}`, submittedAt: r.submittedAt ?? r.createdAt,
      urgent: r.version > 1, tags: r.version > 1 ? [`Resubmitted · v${r.version}`] : undefined, actions: ALL,
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'approve') return this.service.approve(id, admin, b.note, b.publish ?? true, b.commission);
    if (action === 'reject') return this.service.reject(id, admin, b.note!);
    return this.service.requestChanges(id, admin, b.note!);
  }
}


@Injectable()
export class JobChangeSource implements ApprovalSource {
  readonly category = 'JOB_CHANGE';
  readonly label = 'Job changes';
  readonly itemLabel = 'Job change';
  readonly description = 'Recruiters asking to edit or close a live opening';
  constructor(@InjectModel(JobChangeRequest.name) private readonly changes: Model<JobChangeRequest>, private readonly service: JobChangesService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.changes.aggregate([
      { $match: { status: 'PENDING' } },
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'j' } },
      { $lookup: { from: 'users', localField: 'recruiterId', foreignField: '_id', as: 'u' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.type === 'CLOSE' ? 'Close' : 'Edit'} · ${r.j[0]?.spec?.title ?? 'Opening'}`,
      subtitle: [r.changeNumber, r.j[0]?.jobNumber, r.type === 'EDIT' ? `${r.changes.length} change${r.changes.length === 1 ? '' : 's'}` : null, r.reason].filter(Boolean).join(' · '),
      requester: r.u[0] ? { id: String(r.u[0]._id), name: r.u[0].name, role: 'RECRUITER' } : undefined,
      related: r.j[0] ? { type: 'Job', label: r.j[0].jobNumber } : undefined,
      href: `/admin/job-changes/${r._id}`, submittedAt: r.submittedAt, tags: [r.type === 'CLOSE' ? 'Closure' : 'Edit'], actions: ['approve', 'reject'] as ApprovalAction[],
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'request-changes') throw new ConflictException('Not supported for this request');
    return action === 'approve' ? this.service.approve(id, admin, b.note) : this.service.reject(id, admin, b.note!);
  }
}

@Injectable()
export class RecruiterDecisionSource implements ApprovalSource {
  readonly category = 'RECRUITER_DECISION';
  readonly label = 'Recruiter decisions';
  readonly itemLabel = 'Candidate returned by recruiter';
  readonly description = 'Candidates a recruiter rejected or asked changes for. You decide what happens next';
  constructor(@InjectModel(Application.name) private readonly apps: Model<Application>, private readonly workflow: RecruitmentWorkflowService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.apps.aggregate([
      { $match: { status: ApplicationStatus.ADMIN_REVIEW, 'recruiterDecision.pending': true } },
      { $lookup: { from: 'users', localField: 'candidateId', foreignField: '_id', as: 'c' } },
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'j' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.c[0]?.name ?? 'Candidate'} · ${r.j[0]?.spec?.title ?? ''}`,
      subtitle: `${r.recruiterDecision.type === 'REJECTED' ? 'Rejected' : 'Changes requested'} by ${r.recruiterDecision.byName ?? 'recruiter'}: ${r.recruiterDecision.reason}`,
      requester: { name: r.recruiterDecision.byName ?? 'Recruiter', role: 'RECRUITER' }, related: { type: 'Application', label: r.applicationNumber, href: `/admin/applications/${r._id}` },
      href: `/admin/applications/${r._id}`, submittedAt: r.recruiterDecision.at, urgent: true, tags: [r.recruiterDecision.type === 'REJECTED' ? 'Rejected' : 'Changes requested'], actions: ['approve', 'reject'],
    }));
  }
  /** approve = send back to the recruiter (re-shortlist then send); reject = reject the candidate. */
  async act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'request-changes') throw new ConflictException('Not supported for this request');
    if (action === 'reject') return this.workflow.transition(id, ApplicationStatus.REJECTED, admin, { reason: b.note }).then((a) => ({ id, status: a.status }));
    // The candidate already had our interview before the recruiter saw them, so the stages are walked through again rather than skipped.
    await this.workflow.transition(id, ApplicationStatus.ADMIN_INTERVIEW, admin, { notes: b.note });
    await this.workflow.transition(id, ApplicationStatus.ADMIN_SHORTLISTED, admin, { notes: b.note });
    const a = await this.workflow.transition(id, ApplicationStatus.SENT_TO_RECRUITER, admin, { notes: b.note });
    return { id, status: a.status };
  }
}

@Injectable()
export class CandidateRequestSource implements ApprovalSource {
  readonly category = 'CANDIDATE_REQUEST';
  readonly label = 'Candidate requests';
  readonly itemLabel = 'Request for more candidates';
  readonly description = 'Recruiters asking for more candidates for an opening';
  constructor(@InjectModel(CandidateRequest.name) private readonly requests: Model<CandidateRequest>, private readonly review: RecruiterReviewService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.requests.aggregate([
      { $match: { status: 'PENDING' } },
      { $lookup: { from: 'users', localField: 'recruiterId', foreignField: '_id', as: 'u' } },
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'j' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.count} more candidate${r.count > 1 ? 's' : ''} for ${r.j[0]?.spec?.title ?? 'a job'}`, subtitle: r.reason,
      requester: r.u[0] ? { id: String(r.u[0]._id), name: r.u[0].name, role: 'RECRUITER' } : undefined,
      related: { type: 'Job', label: r.j[0]?.jobNumber ?? '' }, href: r.j[0] ? `/admin/screening?job=${r.j[0]._id}` : undefined, submittedAt: r.createdAt, actions: ['approve', 'reject'],
    }));
  }
  /** approve = mark handled (candidates are being sourced); reject = decline with a reason. */
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'request-changes') throw new ConflictException('Not supported for this request');
    return this.review.decide(id, admin, action === 'approve', b.note);
  }
}


@Injectable()
export class ContractApprovalSource implements ApprovalSource {
  readonly category = 'CONTRACT_APPROVAL';
  readonly label = 'Contracts';
  readonly itemLabel = 'Contract';
  readonly description = 'New contracts waiting for your approval';
  constructor(@InjectModel(Contract.name) private readonly contracts: Model<Contract>, private readonly service: ContractsService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.contracts.aggregate([
      { $match: { status: 'PENDING_ADMIN_APPROVAL' } },
      { $lookup: { from: 'users', localField: 'candidateId', foreignField: '_id', as: 'c' } },
      { $lookup: { from: 'users', localField: 'recruiterId', foreignField: '_id', as: 'r' } },
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'j' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.contractNumber} · ${r.c[0]?.name ?? 'Candidate'}`, subtitle: r.j[0]?.spec?.title,
      requester: r.r[0] ? { id: String(r.r[0]._id), name: r.r[0].name, role: 'RECRUITER' } : undefined, related: { type: 'Application', label: r.contractNumber },
      href: `/admin/contracts/${r._id}`, submittedAt: [...r.statusHistory].reverse().find((h: any) => h.status === 'PENDING_ADMIN_APPROVAL')?.at ?? r.createdAt, actions: ['approve', 'reject', 'request-changes'],
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    return action === 'approve' ? this.service.approve(id, admin, b.note) : this.service.reject(id, admin, b.note!);
  }
}

@Injectable()
export class ContractChangeSource implements ApprovalSource {
  readonly category = 'CONTRACT_CHANGE';
  readonly label = 'Contract changes';
  readonly itemLabel = 'Contract change';
  readonly description = 'Changes to active contracts, such as a salary update';
  constructor(@InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>, private readonly service: ContractsService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.versions.aggregate([
      { $match: { status: 'PENDING', kind: 'CHANGE' } },
      { $lookup: { from: 'contracts', localField: 'contractId', foreignField: '_id', as: 'c' } }, { $unwind: '$c' },
      { $lookup: { from: 'users', localField: 'c.candidateId', foreignField: '_id', as: 'u' } },
    ]);
    return rows.map((r) => ({
      // entityId is the contract; the version rides in the id so the same contract can have history.
      entityId: String(r.c._id), title: `${r.c.contractNumber} · ${r.u[0]?.name ?? 'Candidate'} — version ${r.version}`,
      subtitle: `${r.changes.map((x: any) => x.label).join(', ')}: ${r.reason ?? ''}`, requester: { name: r.changedBy?.name ?? 'Recruiter', role: r.changedBy?.role ?? 'RECRUITER' },
      related: { type: 'Contract', label: r.c.contractNumber, href: `/admin/contracts/${r.c._id}` }, href: `/admin/contracts/${r.c._id}`, submittedAt: r.createdAt, urgent: true, tags: [`v${r.version}`], actions: ['approve', 'reject', 'request-changes'],
    }));
  }
  async act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    const pending = await this.versions.findOne({ contractId: id as never, status: 'PENDING', kind: 'CHANGE' }).lean();
    if (!pending) throw new ConflictException({ message: 'This change is no longer pending', code: 'NOT_PENDING' });
    return this.service.decideChange(id, pending.version, action, admin, b.note);
  }
}

@Injectable()
export class PaymentConfirmationSource implements ApprovalSource {
  readonly category = 'PAYMENT_CONFIRMATION';
  readonly label = 'Payments';
  readonly itemLabel = 'Payment';
  readonly description = 'Companies say they have paid; confirm the money arrived';
  constructor(@InjectModel(Payment.name) private readonly payments: Model<Payment>, private readonly service: PaymentsService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.payments.aggregate([
      { $match: { status: 'CLIENT_PAID', deletedAt: null } },
      { $lookup: { from: 'users', localField: 'recruiterId', foreignField: '_id', as: 'r' } },
      { $lookup: { from: 'users', localField: 'candidateId', foreignField: '_id', as: 'c' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.paymentNumber} · ${r.c[0]?.name ?? 'Candidate'} · ${r.period}`,
      subtitle: `${formatMoney({ amount: r.client.amountSent ?? r.grossAmount, currency: r.currency })} via ${r.client.method ?? 'transfer'} · ref ${r.client.reference ?? '—'}`,
      requester: r.r[0] ? { id: String(r.r[0]._id), name: r.r[0].name, role: 'RECRUITER' } : undefined, related: { type: 'Contract', label: r.contractNumber },
      href: `/admin/payments/${r._id}`, submittedAt: r.client.sentAt ?? r.updatedAt, actions: ['approve', 'reject'] as ApprovalAction[],
    }));
  }
  async act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    if (action === 'approve') {
      const p = await this.payments.findById(id).select('grossAmount').lean();
      return this.service.confirmReceived(id, { amountReceived: p?.grossAmount ?? 0, note: b.note }, admin);
    }
    return this.service.dispute(id, b.note!, admin);
  }
}

@Injectable()
export class SalaryDelaySource implements ApprovalSource {
  readonly category = 'SALARY_DELAY';
  readonly label = 'Salary delays';
  readonly itemLabel = 'Salary delay';
  readonly description = 'Delays reported by recruiters. Approving makes the reason and new date visible to the candidate';
  constructor(@InjectModel(Salary.name) private readonly salaries: Model<Salary>, private readonly service: SalaryService) {}

  async pending(): Promise<ApprovalCandidate[]> {
    const rows = await this.salaries.aggregate([
      { $match: { 'delay.status': 'REPORTED', deletedAt: null } },
      { $lookup: { from: 'users', localField: 'candidateId', foreignField: '_id', as: 'c' } },
    ]);
    return rows.map((r) => ({
      entityId: String(r._id), title: `${r.salaryNumber} · ${r.c[0]?.name ?? 'Candidate'} · ${r.period}`,
      subtitle: `Now expected ${r.delay.newPayDate} (was ${r.payDate}) — ${r.delay.reason}`,
      requester: r.delay.reportedBy?.name ? { id: r.delay.reportedBy.id, name: r.delay.reportedBy.name, role: r.delay.reportedBy.role ?? 'RECRUITER' } : undefined,
      related: { type: 'Contract', label: r.contractNumber }, href: `/admin/salary/${r._id}`, submittedAt: r.delay.reportedAt ?? r.updatedAt, urgent: true, actions: ['approve', 'reject'] as ApprovalAction[],
    }));
  }
  act(id: string, action: ApprovalAction, admin: AuthUser, b: Body) {
    return action === 'approve' ? this.service.publishDelay(id, admin, { note: b.note }) : this.service.rejectDelay(id, admin, b.note!);
  }
}

/** Registers every source with the Approval Center. New modules add themselves here (or in their own module). */
@Injectable()
export class ApprovalSourceRegistrar implements OnModuleInit {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly a: RecruiterAccountSource, private readonly b: CompanySource,
    private readonly c: CompanyLinkSource, private readonly d: JobRequestSource,
    private readonly e: RecruiterDecisionSource, private readonly f: CandidateRequestSource,
    private readonly g: ContractApprovalSource, private readonly h: ContractChangeSource, private readonly i: PaymentConfirmationSource, private readonly j: SalaryDelaySource, private readonly k: JobChangeSource,
  ) {}
  onModuleInit() {
    // Order here is the tab order in the UI.
    [this.d, this.k, this.e, this.f, this.g, this.h, this.i, this.j, this.a, this.b, this.c].forEach((s) => this.approvals.register(s));
  }
}
