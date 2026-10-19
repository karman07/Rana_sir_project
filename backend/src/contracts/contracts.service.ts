import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus as S, ContractStatus as C, DomainEvent, Role, formatMoney } from '@rms/shared';
import { Model, Types } from 'mongoose';
import { Application } from '../applications/schemas/application.schema';
import { RecruitmentWorkflowService } from '../applications/recruitment-workflow.service';
import type { AuthUser } from '../auth/decorators';
import { CounterService } from '../common/database/counter.service';
import { paginate } from '../common/database/paginate';
import { EventBusService } from '../common/events/event-bus.service';
import type { Env } from '../config/env';
import { Job } from '../jobs/schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import { DocumentsService } from '../documents/documents.service';
import { CommissionRulesService } from '../commissions/commission-rules.service';
import { CommissionCalculationService } from './commission-calculation.service';
import { addDays, buildTerms, diffTerms, todayUtc } from './contract-terms';
import type { ChangeContractDto, CreateContractDto, ListContractsQueryDto, TermsDto } from './dto/contract.dto';
import { Contract, type ContractDocument } from './schemas/contract.schema';
import { ContractVersion, type ContractTerms } from './schemas/contract-version.schema';

const EXPIRY_WARNING_DAYS = 30;
/** What a candidate may see: nothing until the contract is actually put to them. */
const CANDIDATE_VISIBLE: string[] = [C.PENDING_CANDIDATE_APPROVAL, C.ACTIVE, C.EXPIRING, C.EXPIRED, C.TERMINATED];
const LIVE: string[] = [C.ACTIVE, C.EXPIRING];

@Injectable()
export class ContractsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContractsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Contract.name) private readonly contracts: Model<Contract>,
    @InjectModel(ContractVersion.name) private readonly versions: Model<ContractVersion>,
    @InjectModel(Application.name) private readonly apps: Model<Application>,
    @InjectModel(Job.name) private readonly jobs: Model<Job>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly calc: CommissionCalculationService,
    private readonly commissions: CommissionRulesService,
    private readonly documents: DocumentsService,
    private readonly workflow: RecruitmentWorkflowService,
    private readonly counters: CounterService,
    private readonly events: EventBusService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Expiry tracking runs hourly (and can be triggered by Admin). */
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('EMAIL_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.runLifecycle().catch((e) => this.logger.error(e.message)), 60 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /* ---------------- helpers ---------------- */

  private scope(user: AuthUser): Record<string, unknown> {
    if (user.role === Role.CANDIDATE) return { candidateId: new Types.ObjectId(user.id), status: { $in: CANDIDATE_VISIBLE } };
    if (user.role === Role.RECRUITER) return { recruiterId: new Types.ObjectId(user.id) };
    return {};
  }

  private async load(id: string, user: AuthUser): Promise<ContractDocument> {
    const doc = await this.contracts.findOne({ _id: id, ...this.scope(user) } as never);
    if (!doc) throw new NotFoundException('Contract not found');
    return doc;
  }

  private async versionOf(contractId: unknown, version: number) {
    return this.versions.findOne({ contractId: contractId as never, version }).lean();
  }

  private push(status: string, user?: AuthUser | { name: string; role: string }, note?: string) {
    return { status, at: new Date(), byName: user?.name, role: user?.role, note };
  }

  private async move(c: ContractDocument, from: C[], to: C, user: AuthUser | undefined, note?: string, extra: Record<string, unknown> = {}) {
    const updated = await this.contracts.findOneAndUpdate(
      { _id: c._id, status: { $in: from } },
      { status: to, $push: { statusHistory: this.push(to, user, note) }, ...(Object.keys(extra).length ? { $set: extra } : {}) },
      { returnDocument: 'after' },
    );
    if (!updated) throw new ConflictException({ message: 'The contract changed while you were working. Refresh and try again.', code: 'CONCURRENT_UPDATE' });
    return updated;
  }

  private async partyInfo(c: { jobId: unknown; candidateId: unknown; recruiterId: unknown; companyId?: unknown }) {
    const [job, candidate, recruiter] = await Promise.all([
      this.jobs.findById(c.jobId as never).populate('companyId', 'name').lean() as any,
      this.users.findById(c.candidateId as never).select('name email').lean(),
      this.users.findById(c.recruiterId as never).select('name email').lean(),
    ]);
    return { jobTitle: job?.spec?.title as string | undefined, companyName: job?.companyId?.name as string | undefined, candidateName: candidate?.name, recruiterName: recruiter?.name };
  }

  private async eventData(c: ContractDocument, terms: ContractTerms | undefined, extra: Record<string, unknown> = {}) {
    const p = await this.partyInfo(c);
    return {
      contractNumber: c.contractNumber, contractId: c.id, applicationId: String(c.applicationId), candidateId: String(c.candidateId), recruiterId: String(c.recruiterId),
      createdById: c.createdBy.id, createdByRole: c.createdBy.role, jobTitle: p.jobTitle, companyName: p.companyName, candidateName: p.candidateName, recruiterName: p.recruiterName,
      contractStartDate: terms?.startDate, contractEndDate: terms?.endDate ?? 'Open-ended',
      salary: terms ? `${formatMoney({ amount: terms.salary.amount, currency: terms.salary.currency })}${terms.salary.period === 'YEAR' ? ' / year' : terms.salary.period === 'HOUR' ? ' / hour' : ' / month'}` : undefined,
      candidateSalary: terms ? this.candidateSalaryText(terms) : undefined,
      status: c.status, ...extra,
    };
  }

  /* ---------------- create & edit the draft ---------------- */

  async create(dto: CreateContractDto, user: AuthUser) {
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    const app = await this.apps.findOne({ _id: dto.applicationId, ...(user.role === Role.RECRUITER ? { recruiterId: user.id as never } : {}) });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status !== S.SELECTED && app.status !== S.CONTRACT) {
      throw new ConflictException({ message: 'A contract can be created once the candidate has been selected', code: 'NOT_SELECTED' });
    }
    if (await this.contracts.exists({ applicationId: app._id })) throw new ConflictException({ message: 'This candidate already has a contract', code: 'CONTRACT_EXISTS' });

    const { rule: defaultRule } = await this.commissions.resolve({ recruiterId: app.recruiterId, jobId: app.jobId });
    const terms = buildTerms(dto, undefined, { canSetCommission: user.role === Role.ADMIN, defaultRule });
    const n = await this.counters.next('contract');
    const contract = await this.contracts.create({
      contractNumber: `CON-${String(n).padStart(4, '0')}`, applicationId: app._id, jobId: app.jobId, candidateId: app.candidateId, recruiterId: app.recruiterId, companyId: app.companyId,
      status: C.DRAFT, currentVersion: 1, createdBy: { id: user.id, role: user.role, name: user.name }, startDate: terms.startDate, endDate: terms.endDate,
      statusHistory: [this.push(C.DRAFT, user, 'Contract created')],
    });
    await this.versions.create({
      contractId: contract._id, version: 1, kind: 'INITIAL', status: 'PENDING', terms, financials: this.calc.forContract(terms.salary, terms.salary.currency, terms.commission),
      changedBy: { id: user.id, name: user.name, role: user.role }, reason: 'Initial terms', changes: [],
    });
    await this.events.publish(DomainEvent.CONTRACT_CREATED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Contract', id: contract.id }, newState: { status: C.DRAFT, version: 1 }, data: await this.eventData(contract, terms),
    });
    return this.get(contract.id, user);
  }

  /** Terms can be edited freely only while the contract is still a draft and nobody has approved it. */
  async updateDraft(id: string, dto: TermsDto, user: AuthUser) {
    const c = await this.load(id, user);
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    if (c.status !== C.DRAFT) throw new ConflictException({ message: 'Only drafts can be edited. Use a change request for an approved contract.', code: 'NOT_DRAFT' });
    if (user.role === Role.RECRUITER && c.createdBy.id !== user.id) throw new ForbiddenException('Only the person who created this draft can edit it');
    const v = await this.versionOf(c._id, 1);
    const terms = buildTerms(dto, v!.terms, { canSetCommission: user.role === Role.ADMIN });
    await this.versions.updateOne({ contractId: c._id, version: 1 }, { $set: { terms, financials: this.calc.forContract(terms.salary, terms.salary.currency, terms.commission) } });
    await this.contracts.updateOne({ _id: c._id }, { startDate: terms.startDate, endDate: terms.endDate });
    return this.get(id, user);
  }

  /* ---------------- approval chain ---------------- */

  async submit(id: string, user: AuthUser) {
    const c = await this.load(id, user);
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    if (c.status !== C.DRAFT) throw new ConflictException({ message: 'Only drafts can be submitted', code: 'NOT_DRAFT' });
    if (user.role === Role.RECRUITER && c.createdBy.id !== user.id) throw new ForbiddenException();
    // The creator's side has implicitly approved, so the other side reviews next.
    const next = c.createdBy.role === Role.ADMIN ? C.PENDING_RECRUITER_APPROVAL : C.PENDING_ADMIN_APPROVAL;
    const updated = await this.move(c, [C.DRAFT], next, user, 'Submitted for approval');
    if (c.createdBy.role === Role.ADMIN) await this.ensureInContractStage(c, user);
    const v = await this.versionOf(c._id, 1);
    await this.events.publish(DomainEvent.CONTRACT_SUBMITTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Contract', id }, previousState: { status: C.DRAFT }, newState: { status: next }, data: await this.eventData(updated, v?.terms),
    });
    return this.get(id, user);
  }

  /** Application moves SELECTED -> CONTRACT when Admin has put their name to the contract. */
  private async ensureInContractStage(c: ContractDocument, admin: AuthUser) {
    if (admin.role !== Role.ADMIN) return;
    const app = await this.apps.findById(c.applicationId).select('status').lean();
    if (app?.status === S.SELECTED) await this.workflow.transition(String(c.applicationId), S.CONTRACT, admin, { notes: `Contract ${c.contractNumber}` });
  }

  /** Approve as whichever party the contract is currently waiting on. */
  async approve(id: string, user: AuthUser, note?: string) {
    const c = await this.load(id, user);
    const v = await this.versionOf(c._id, c.currentVersion);
    let party: string, next: C;

    if (c.status === C.PENDING_ADMIN_APPROVAL && user.role === Role.ADMIN) { party = 'ADMIN'; next = C.PENDING_CANDIDATE_APPROVAL; }
    else if (c.status === C.PENDING_RECRUITER_APPROVAL && user.role === Role.RECRUITER) { party = 'RECRUITER'; next = C.PENDING_CANDIDATE_APPROVAL; }
    else if (c.status === C.PENDING_CANDIDATE_APPROVAL && user.role === Role.CANDIDATE) { party = 'CANDIDATE'; next = C.ACTIVE; }
    else if (!CANDIDATE_VISIBLE.includes(c.status) && user.role === Role.CANDIDATE) throw new NotFoundException('Contract not found');
    else throw new ForbiddenException({ message: 'This contract is not waiting for your approval', code: 'NOT_YOUR_TURN' });

    const updated = await this.move(c, [c.status], next, user, note, next === C.ACTIVE ? { activatedAt: new Date() } : {});
    if (party === 'ADMIN') await this.ensureInContractStage(c, user);
    if (next === C.ACTIVE) {
      await this.versions.updateOne({ contractId: c._id, version: c.currentVersion }, { status: 'APPROVED', decidedBy: user.id, decidedByName: user.name, decidedAt: new Date() });
      // Accepting the contract is what places the candidate.
      const app = await this.apps.findById(c.applicationId).select('status').lean();
      if (app?.status === S.CONTRACT) await this.workflow.transition(String(c.applicationId), S.PLACED, user, { notes: `Contract ${c.contractNumber} accepted` });
    }
    const data = await this.eventData(updated, v?.terms, { party, note });
    await this.events.publish(next === C.ACTIVE ? DomainEvent.CONTRACT_ACTIVATED : DomainEvent.CONTRACT_APPROVED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Contract', id }, reason: note, previousState: { status: c.status }, newState: { status: next }, data,
    });
    return this.get(id, user);
  }

  /** Any party can send a contract back to draft with a reason; the creator then revises and resubmits. */
  async reject(id: string, user: AuthUser, reason: string) {
    const c = await this.load(id, user);
    const mine = (c.status === C.PENDING_ADMIN_APPROVAL && user.role === Role.ADMIN) || (c.status === C.PENDING_RECRUITER_APPROVAL && user.role === Role.RECRUITER) || (c.status === C.PENDING_CANDIDATE_APPROVAL && user.role === Role.CANDIDATE);
    if (!mine) throw new ForbiddenException({ message: 'This contract is not waiting for your decision', code: 'NOT_YOUR_TURN' });
    const updated = await this.move(c, [c.status], C.DRAFT, user, reason, { lastDecline: { by: user.name, role: user.role, reason, at: new Date() } });
    const v = await this.versionOf(c._id, c.currentVersion);
    await this.events.publish(DomainEvent.CONTRACT_DECLINED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Contract', id }, reason, previousState: { status: c.status }, newState: { status: C.DRAFT }, data: await this.eventData(updated, v?.terms, { party: user.role }),
    });
    // Once declined it is a draft again, which the candidate cannot see; give them a plain confirmation instead.
    return user.role === Role.CANDIDATE ? { id, status: C.DRAFT } : this.get(id, user);
  }

  async terminate(id: string, admin: AuthUser, reason: string) {
    const c = await this.load(id, admin);
    if (!LIVE.includes(c.status)) throw new ConflictException({ message: 'Only active contracts can be terminated', code: 'NOT_ACTIVE' });
    const updated = await this.move(c, LIVE as C[], C.TERMINATED, admin, reason, { terminatedAt: new Date(), terminationReason: reason });
    const v = await this.versionOf(c._id, c.currentVersion);
    await this.events.publish(DomainEvent.CONTRACT_TERMINATED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Contract', id }, reason, previousState: { status: c.status }, newState: { status: C.TERMINATED }, data: await this.eventData(updated, v?.terms),
    });
    return this.get(id, admin);
  }

  /* ---------------- versioned changes ---------------- */

  /**
   * A change never edits the current terms: it creates version n+1. Admin's own changes take effect immediately;
   * a recruiter's go to Admin for approval (spec §48).
   */
  async requestChange(id: string, dto: ChangeContractDto, user: AuthUser) {
    if (user.role === Role.CANDIDATE) throw new ForbiddenException();
    const c = await this.load(id, user);
    if (!LIVE.includes(c.status)) throw new ConflictException({ message: 'Changes apply to active contracts', code: 'NOT_ACTIVE' });
    if (await this.versions.exists({ contractId: c._id, status: 'PENDING' })) throw new ConflictException({ message: 'There is already a change waiting for approval', code: 'CHANGE_PENDING' });

    const current = (await this.versionOf(c._id, c.currentVersion))!;
    const { reason, ...fields } = dto;
    const terms = buildTerms(fields, current.terms, { canSetCommission: user.role === Role.ADMIN });
    const changes = diffTerms(current.terms, terms);
    if (changes.length === 0) throw new BadRequestException({ message: 'Nothing has changed from the current terms', code: 'NO_CHANGES' });
    if (terms.endDate && terms.endDate < todayUtc()) throw new BadRequestException({ message: 'The end date cannot be in the past', code: 'VALIDATION_FAILED' });

    // The newest version number across all versions (including rejected ones) so numbers are never reused.
    const last = await this.versions.findOne({ contractId: c._id }).sort({ version: -1 }).lean();
    const version = (last?.version ?? c.currentVersion) + 1;
    const byAdmin = user.role === Role.ADMIN;
    // A revised request replaces an earlier one that was sent back for changes.
    await this.versions.updateMany({ contractId: c._id, status: 'CHANGES_REQUESTED' }, { status: 'SUPERSEDED' });
    await this.versions.create({
      contractId: c._id, version, kind: 'CHANGE', status: 'PENDING', terms, financials: this.calc.forContract(terms.salary, terms.salary.currency, terms.commission),
      changedBy: { id: user.id, name: user.name, role: user.role }, reason, changes,
    });
    if (byAdmin) return this.applyVersion(c, version, user, 'Applied by Admin');

    await this.events.publish(DomainEvent.CONTRACT_CHANGE_REQUESTED, {
      actor: { id: user.id, role: user.role }, entity: { type: 'Contract', id }, reason, newState: { version, changes: changes.map((x) => x.label) },
      data: await this.eventData(c, terms, { version: String(version), changes: changes.map((x) => x.label).join(', ') }),
    });
    return this.get(id, user);
  }

  /** Makes a version the one in force, and recalculates what follows from it. */
  private async applyVersion(c: ContractDocument, version: number, admin: AuthUser, note?: string) {
    const v = (await this.versionOf(c._id, version))!;
    const previous = await this.versionOf(c._id, c.currentVersion);
    // Money is recalculated from the new terms at the moment they take effect (never copied from the request).
    const financials = this.calc.forContract(v.terms.salary, v.terms.salary.currency, v.terms.commission);
    await this.versions.updateOne({ contractId: c._id, version }, { status: 'APPROVED', financials, decidedBy: admin.id, decidedByName: admin.name, decidedAt: new Date(), decisionNote: note });

    const endsSoon = v.terms.endDate && v.terms.endDate <= addDays(todayUtc(), EXPIRY_WARNING_DAYS);
    const status = c.status === C.EXPIRING && !endsSoon ? C.ACTIVE : c.status;
    const updated = await this.contracts.findOneAndUpdate(
      { _id: c._id } as never,
      { currentVersion: version, startDate: v.terms.startDate, endDate: v.terms.endDate, status, $unset: { expiringNotifiedAt: 1 }, $push: { statusHistory: this.push(status, admin, `Version ${version} took effect`) } },
      { returnDocument: 'after' },
    );
    await this.events.publish(DomainEvent.CONTRACT_UPDATED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Contract', id: c.id }, reason: v.reason,
      previousState: { version: c.currentVersion, salary: previous?.terms.salary, commission: previous?.terms.commission, monthly: previous?.financials.monthly },
      newState: { version, salary: v.terms.salary, commission: v.terms.commission, monthly: financials.monthly },
      data: await this.eventData(updated as ContractDocument, v.terms, { version: String(version), changes: v.changes.map((x) => x.label).join(', ') }),
    });
    return this.get(c.id, admin);
  }

  async decideChange(id: string, version: number, action: 'approve' | 'reject' | 'request-changes', admin: AuthUser, note?: string) {
    const c = await this.load(id, admin);
    const v = await this.versions.findOne({ contractId: c._id, version }).lean();
    if (!v || v.kind !== 'CHANGE') throw new NotFoundException('Change not found');
    if (v.status !== 'PENDING') throw new ConflictException({ message: 'This change is no longer pending', code: 'NOT_PENDING' });
    if (action === 'approve') {
      const claimed = await this.versions.updateOne({ contractId: c._id, version, status: 'PENDING' }, { decisionNote: note });
      if (!claimed.matchedCount) throw new ConflictException({ message: 'This change is no longer pending', code: 'NOT_PENDING' });
      return this.applyVersion(c, version, admin, note);
    }
    const status = action === 'reject' ? 'REJECTED' : 'CHANGES_REQUESTED';
    const res = await this.versions.updateOne({ contractId: c._id, version, status: 'PENDING' }, { status, decidedBy: admin.id, decidedByName: admin.name, decidedAt: new Date(), decisionNote: note });
    if (!res.matchedCount) throw new ConflictException({ message: 'This change is no longer pending', code: 'NOT_PENDING' });
    await this.events.publish(DomainEvent.CONTRACT_CHANGE_DECIDED, {
      actor: { id: admin.id, role: Role.ADMIN }, entity: { type: 'Contract', id }, reason: note, previousState: { version, status: 'PENDING' }, newState: { version, status },
      data: await this.eventData(c, v.terms, { version: String(version), decision: action === 'reject' ? 'rejected' : 'sent back for changes' }),
    });
    return this.get(id, admin);
  }

  /* ---------------- expiry tracking ---------------- */

  async runLifecycle(now = new Date()) {
    const today = todayUtc(now);
    const warnBy = addDays(today, EXPIRY_WARNING_DAYS);
    let expiring = 0, expired = 0;

    const toExpire = await this.contracts.find({ status: { $in: LIVE }, endDate: { $lt: today } } as never);
    for (const c of toExpire) {
      const u = await this.contracts.findOneAndUpdate({ _id: c._id, status: { $in: LIVE } } as never, { status: C.EXPIRED, $push: { statusHistory: this.push(C.EXPIRED, undefined, 'End date passed') } }, { returnDocument: 'after' });
      if (!u) continue;
      expired++;
      const v = await this.versionOf(c._id, c.currentVersion);
      await this.events.publish(DomainEvent.CONTRACT_EXPIRED, { actor: { id: null, role: 'SYSTEM' }, entity: { type: 'Contract', id: c.id }, previousState: { status: c.status }, newState: { status: C.EXPIRED }, data: await this.eventData(u as ContractDocument, v?.terms) });
    }

    const soon = await this.contracts.find({ status: C.ACTIVE, endDate: { $gte: today, $lte: warnBy } } as never);
    for (const c of soon) {
      const u = await this.contracts.findOneAndUpdate({ _id: c._id, status: C.ACTIVE } as never, { status: C.EXPIRING, expiringNotifiedAt: now, $push: { statusHistory: this.push(C.EXPIRING, undefined, `Ends ${c.endDate}`) } }, { returnDocument: 'after' });
      if (!u) continue;
      expiring++;
      const v = await this.versionOf(c._id, c.currentVersion);
      const daysLeft = Math.round((Date.parse(c.endDate!) - Date.parse(today)) / 86_400_000);
      await this.events.publish(DomainEvent.CONTRACT_EXPIRING, { actor: { id: null, role: 'SYSTEM' }, entity: { type: 'Contract', id: c.id }, previousState: { status: C.ACTIVE }, newState: { status: C.EXPIRING }, data: await this.eventData(u as ContractDocument, v?.terms, { daysLeft: String(daysLeft) }) });
    }
    return { expiring, expired };
  }

  /* ---------------- reads ---------------- */

  /** Candidates never see platform commission or what the platform earns. */
  /**
   * The share of the contract rate the candidate actually receives (after the platform's commission), as a ratio.
   * Candidates are only ever shown their own figure, so the contract, their pay and their payments all agree
   * and nothing hints at what the platform keeps.
   */
  private candidateShare(t: ContractTerms): number {
    return this.calc.candidateShare(t.salary, t.salary.currency, t.commission);
  }

  private publicTerms(t: ContractTerms, user: AuthUser): any {
    // How the platform earns is Admin-only: neither candidates nor recruiters see the commission.
    if (user.role === Role.ADMIN) return t;
    const { commission, ...rest } = t;
    if (user.role === Role.CANDIDATE) return { ...rest, salary: { ...rest.salary, amount: Math.round(rest.salary.amount * this.candidateShare(t)) } };
    return rest;
  }

  private candidateSalaryText(t: ContractTerms) {
    const amount = Math.round(t.salary.amount * this.candidateShare(t));
    return `${formatMoney({ amount, currency: t.salary.currency })}${t.salary.period === 'YEAR' ? ' / year' : t.salary.period === 'HOUR' ? ' / hour' : ' / month'}`;
  }

  private brief(c: any, v: any, party: any, user: AuthUser) {
    const today = todayUtc();
    const daysLeft = c.endDate ? Math.round((Date.parse(c.endDate) - Date.parse(today)) / 86_400_000) : null;
    return {
      id: String(c._id), contractNumber: c.contractNumber, status: c.status, currentVersion: c.currentVersion, startDate: c.startDate, endDate: c.endDate, daysLeft,
      createdAt: c.createdAt, activatedAt: c.activatedAt, createdBy: user.role === Role.CANDIDATE ? undefined : c.createdBy, applicationId: String(c.applicationId),
      job: { id: String(party.job?._id ?? c.jobId?._id ?? c.jobId), title: party.job?.spec?.title ?? c.jobId?.spec?.title, company: party.job?.companyId?.name ?? c.companyId?.name },
      candidate: { id: String(party.candidate?._id ?? c.candidateId?._id ?? c.candidateId), name: party.candidate?.name ?? c.candidateId?.name, email: party.candidate?.email ?? c.candidateId?.email },
      recruiter: user.role === Role.CANDIDATE ? undefined : { id: String(party.recruiter?._id ?? c.recruiterId?._id ?? c.recruiterId), name: party.recruiter?.name ?? c.recruiterId?.name },
      terms: v ? this.publicTerms(v.terms, user) : undefined,
      financials: v && user.role === Role.ADMIN ? v.financials : undefined,
    };
  }

  async list(q: ListContractsQueryDto, user: AuthUser) {
    const filter: Record<string, any> = this.scope(user);
    const statuses = q.statuses?.length ? q.statuses : q.status ? [q.status] : undefined;
    if (statuses) filter.status = user.role === Role.CANDIDATE ? { $in: statuses.filter((s) => CANDIDATE_VISIBLE.includes(s)) } : { $in: statuses };
    if (q.endingWithinDays) { filter.status = { $in: LIVE }; filter.endDate = { $gte: todayUtc(), $lte: addDays(todayUtc(), q.endingWithinDays) }; }
    if (q.applicationId) filter.applicationId = new Types.ObjectId(q.applicationId);
    if (q.candidateId && user.role !== Role.CANDIDATE) filter.candidateId = new Types.ObjectId(q.candidateId);
    const { items, meta } = await paginate(this.contracts, filter, q, {
      sortable: ['createdAt', 'endDate', 'startDate', 'contractNumber', 'status'], defaultSort: q.endingWithinDays ? 'endDate' : '-createdAt', searchFields: ['contractNumber'],
      populate: ['candidateId', 'recruiterId', { path: 'jobId', populate: { path: 'companyId', select: 'name' } }] as never,
    });
    const vs = await this.versions.find({ $or: items.map((c: any) => ({ contractId: c._id, version: c.currentVersion })) }).lean();
    const byKey = new Map(vs.map((v) => [`${v.contractId}:${v.version}`, v]));
    const pending = new Set((await this.versions.find({ contractId: { $in: items.map((c: any) => c._id) }, status: 'PENDING', kind: 'CHANGE' }).select('contractId').lean()).map((x) => String(x.contractId)));
    return {
      items: items.map((c: any) => ({ ...this.brief(c, byKey.get(`${c._id}:${c.currentVersion}`), { job: c.jobId, candidate: c.candidateId, recruiter: c.recruiterId }, user), changePending: user.role !== Role.CANDIDATE && pending.has(String(c._id)) })),
      meta,
    };
  }

  async get(id: string, user: AuthUser) {
    const c = await this.load(id, user);
    const [party, versions] = await Promise.all([
      Promise.all([
        this.jobs.findById(c.jobId).populate('companyId', 'name').lean(), this.users.findById(c.candidateId).select('name email').lean(), this.users.findById(c.recruiterId).select('name').lean(),
      ]).then(([job, candidate, recruiter]) => ({ job, candidate, recruiter })),
      this.versions.find({ contractId: c._id }).sort({ version: 1 }).lean(),
    ]);
    const cur = versions.find((v) => v.version === c.currentVersion);
    const staff = user.role !== Role.CANDIDATE;
    const obj = c.toObject();

    const visibleVersions = versions
      // Candidates only see versions that took effect, plus the one currently put to them.
      .filter((v) => staff || v.status === 'APPROVED' || v.version === c.currentVersion)
      .map((v) => ({
        version: v.version, kind: v.kind, status: v.status, createdAt: v.createdAt, reason: staff ? v.reason : undefined, changedBy: staff ? v.changedBy : undefined, decidedByName: staff ? v.decidedByName : undefined,
        decidedAt: v.decidedAt, decisionNote: staff ? v.decisionNote : undefined, current: v.version === c.currentVersion,
        terms: this.publicTerms(v.terms, user), financials: user.role === Role.ADMIN ? v.financials : undefined,
        changes: user.role === Role.ADMIN ? v.changes
          : v.changes.filter((x) => x.field !== 'commission').map((x) => (user.role === Role.CANDIDATE && x.field === 'salary.amount'
            ? { ...x, from: Math.round(Number(x.from) * this.candidateShare(v.terms)), to: Math.round(Number(x.to) * this.candidateShare(v.terms)) } : x)),
      }));
    return {
      ...this.brief(obj, cur, party, user),
      // Candidates see the stages, never the names, notes or reasons behind them.
      statusHistory: staff ? obj.statusHistory : obj.statusHistory.map((h) => ({ status: h.status, at: h.at })),
      lastDecline: staff ? obj.lastDecline : undefined,
      terminationReason: staff ? obj.terminationReason : undefined,
      versions: visibleVersions,
      pendingChange: staff ? visibleVersions.find((v) => v.status === 'PENDING' && v.kind === 'CHANGE') ?? null : null,
      awaiting: this.awaiting(c.status),
      // Offer letters and contract copies this person may open: their own copy, never the other side's.
      documents: await this.documents.forEntity('Contract', c.id, user),
      actions: this.actionsFor(c, user, versions.some((v) => v.status === 'PENDING' && v.kind === 'CHANGE')),
    };
  }

  private awaiting(status: string): 'ADMIN' | 'RECRUITER' | 'CANDIDATE' | null {
    return status === C.PENDING_ADMIN_APPROVAL ? 'ADMIN' : status === C.PENDING_RECRUITER_APPROVAL ? 'RECRUITER' : status === C.PENDING_CANDIDATE_APPROVAL ? 'CANDIDATE' : null;
  }

  /** What the caller may do right now, so the UI only offers valid buttons. */
  private actionsFor(c: ContractDocument, user: AuthUser, changePending: boolean): string[] {
    const out: string[] = [];
    const awaiting = this.awaiting(c.status);
    if (awaiting === user.role) out.push('approve', 'reject');
    if (c.status === C.DRAFT && user.role !== Role.CANDIDATE && (user.role === Role.ADMIN || c.createdBy.id === user.id)) out.push('edit', 'submit');
    if (LIVE.includes(c.status) && user.role !== Role.CANDIDATE && !changePending) out.push('change');
    if (LIVE.includes(c.status) && user.role === Role.ADMIN) out.push('terminate');
    return out;
  }

  async counts(user: AuthUser) {
    const rows = await this.contracts.aggregate([{ $match: this.scope(user) }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const expiring30 = await this.contracts.countDocuments({ ...this.scope(user), status: { $in: LIVE }, endDate: { $gte: todayUtc(), $lte: addDays(todayUtc(), EXPIRY_WARNING_DAYS) } } as never);
    const changes = user.role === Role.CANDIDATE ? 0 : await this.pendingChangesCount(user);
    return { ...by, pendingTotal: (by.PENDING_ADMIN_APPROVAL ?? 0) + (by.PENDING_RECRUITER_APPROVAL ?? 0) + (by.PENDING_CANDIDATE_APPROVAL ?? 0), expiringSoon: expiring30, pendingChanges: changes };
  }

  private async pendingChangesCount(user: AuthUser) {
    const ids = await this.contracts.find(this.scope(user) as never).select('_id').lean();
    return this.versions.countDocuments({ contractId: { $in: ids.map((i) => i._id) }, status: 'PENDING', kind: 'CHANGE' });
  }
}
