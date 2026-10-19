import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApplicationStatus as S, DomainEvent, Role } from '@rms/shared';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { EventBusService } from '../common/events/event-bus.service';
import { Interview } from '../interviews/schemas/interview.schema';
import { Application, type ApplicationDocument } from './schemas/application.schema';

export interface Transition { to: S; roles: Role[]; reasonRequired?: boolean }

const ADMIN = Role.ADMIN, REC = Role.RECRUITER, CAND = Role.CANDIDATE;

/**
 * The only definition of what may follow what (spec §76). Admin is the central authority:
 * recruiters can move a candidate forward once approved, but a recruiter "no" returns to Admin, never to the pool.
 */
export const TRANSITIONS: Record<S, Transition[]> = {
  [S.APPLIED]: [{ to: S.ADMIN_REVIEW, roles: [ADMIN] }],
  // Round one: Admin interviews the candidate. Shortlisting is only possible after that interview has been held.
  [S.ADMIN_REVIEW]: [{ to: S.ADMIN_INTERVIEW, roles: [ADMIN] }],
  [S.ADMIN_INTERVIEW]: [
    { to: S.ADMIN_SHORTLISTED, roles: [ADMIN] },
    { to: S.ADMIN_REVIEW, roles: [ADMIN] }, // not decided yet: back to screening, e.g. to arrange another interview
  ],
  [S.ADMIN_SHORTLISTED]: [{ to: S.SENT_TO_RECRUITER, roles: [ADMIN] }],
  [S.SENT_TO_RECRUITER]: [{ to: S.RECRUITER_REVIEW, roles: [ADMIN, REC] }],
  [S.RECRUITER_REVIEW]: [
    { to: S.RECRUITER_APPROVED, roles: [REC, ADMIN] },
    { to: S.ADMIN_REVIEW, roles: [REC], reasonRequired: true }, // recruiter rejects / asks for changes -> back to Admin
  ],
  [S.RECRUITER_APPROVED]: [{ to: S.INTERVIEW, roles: [ADMIN, REC] }],
  [S.INTERVIEW]: [{ to: S.SELECTED, roles: [ADMIN, REC] }],
  [S.SELECTED]: [{ to: S.CONTRACT, roles: [ADMIN] }],
  // The candidate accepting their contract is what places them (done by the contract flow, not a manual status edit).
  [S.CONTRACT]: [{ to: S.PLACED, roles: [ADMIN, CAND] }],
  [S.PLACED]: [],
  [S.REJECTED]: [],
  [S.WITHDRAWN]: [],
};

const TERMINAL: S[] = [S.PLACED, S.REJECTED, S.WITHDRAWN];
/** Admin may end any live application; a candidate may withdraw until a contract is being prepared. */
const REJECTABLE = (from: S) => !TERMINAL.includes(from);
/** The hiring recruiter can decline a candidate they were sent at any point until the hire. It takes effect at once. */
const RECRUITER_REJECTABLE = (from: S) => ([S.SENT_TO_RECRUITER, S.RECRUITER_REVIEW, S.RECRUITER_APPROVED, S.INTERVIEW] as S[]).includes(from);
const WITHDRAWABLE = (from: S) => !TERMINAL.includes(from) && from !== S.CONTRACT;

/** Domain event for each status; unlisted statuses use the generic APPLICATION_STATUS_CHANGED. */
const EVENT_FOR: Partial<Record<S, DomainEvent>> = {
  [S.ADMIN_SHORTLISTED]: DomainEvent.CANDIDATE_SHORTLISTED,
  [S.SENT_TO_RECRUITER]: DomainEvent.CANDIDATE_SENT_TO_RECRUITER,
  [S.RECRUITER_APPROVED]: DomainEvent.RECRUITER_APPROVED,
  [S.SELECTED]: DomainEvent.CANDIDATE_SELECTED,
  [S.WITHDRAWN]: DomainEvent.APPLICATION_WITHDRAWN,
};

export interface AllowedTransition { to: S; reasonRequired: boolean; kind: 'normal' | 'reject' | 'withdraw' | 'override' }

/** Pure: which targets may `role` choose from `from`? Used by the API and to render only valid buttons. */
export function allowedTransitions(from: S, role: Role): AllowedTransition[] {
  const out: AllowedTransition[] = TRANSITIONS[from].filter((t) => t.roles.includes(role)).map((t) => ({ to: t.to, reasonRequired: !!t.reasonRequired, kind: 'normal' as const }));
  if (role === ADMIN && REJECTABLE(from)) out.push({ to: S.REJECTED, reasonRequired: true, kind: 'reject' });
  if (role === REC && RECRUITER_REJECTABLE(from)) out.push({ to: S.REJECTED, reasonRequired: true, kind: 'reject' });
  if (role === CAND && WITHDRAWABLE(from)) out.push({ to: S.WITHDRAWN, reasonRequired: false, kind: 'withdraw' });
  return out;
}

@Injectable()
export class RecruitmentWorkflowService {
  constructor(
    @InjectModel(Application.name) private readonly model: Model<Application>,
    @InjectModel(Interview.name) private readonly interviews: Model<Interview>,
    private readonly events: EventBusService,
  ) {}

  allowed(from: S, role: Role) {
    return allowedTransitions(from, role);
  }

  /**
   * Moves an application to `to`. The status change and its history entry are one atomic update guarded by the
   * status we read, so two concurrent actors cannot both succeed. Admin may `override` with a reason.
   */
  async transition(
    id: string, to: S, actor: AuthUser,
    opts: { reason?: string; notes?: string; override?: boolean; eventData?: Record<string, unknown>; event?: DomainEvent } = {},
  ): Promise<ApplicationDocument> {
    const app = await this.model.findById(id);
    if (!app) throw new NotFoundException('Application not found');
    const from = app.status;
    if (from === to) throw new ConflictException({ message: `Application is already ${to}`, code: 'NO_CHANGE' });

    const normal = allowedTransitions(from, actor.role).find((t) => t.to === to);
    let override = false;
    if (!normal) {
      if (actor.role !== ADMIN || !opts.override) {
        throw new ForbiddenException({ message: `Cannot move an application from ${from} to ${to}`, code: 'INVALID_TRANSITION' });
      }
      if (TERMINAL.includes(from)) {
        throw new ConflictException({ message: `A ${from.toLowerCase()} application cannot be reopened`, code: 'TERMINAL_STATE' });
      }
      if ((opts.reason?.trim().length ?? 0) < 3) throw new BadRequestException({ message: 'An override needs a reason', code: 'REASON_REQUIRED' });
      override = true;
    } else if (normal.reasonRequired && (opts.reason?.trim().length ?? 0) < 3) {
      throw new BadRequestException({ message: 'A reason is required', code: 'REASON_REQUIRED' });
    }

    // A candidate is shortlisted for the recruiter only after our own interview has actually taken place.
    // Admin can waive this with a reason; that is recorded in the history as an override.
    let waived = false;
    if (to === S.ADMIN_SHORTLISTED && !override) {
      const held = await this.interviews.exists({ applicationId: app._id, stage: 'ADMIN', status: 'COMPLETED' } as never);
      if (!held) {
        if (actor.role === ADMIN && opts.override && (opts.reason?.trim().length ?? 0) >= 3) waived = true;
        else throw new ConflictException({ message: 'Interview the candidate first. They can be shortlisted once the interview has been held', code: 'INTERVIEW_REQUIRED' });
      }
    }

    const change = {
      status: to, changedBy: new Types.ObjectId(actor.id), changedByName: actor.name, role: actor.role, at: new Date(),
      reason: opts.reason?.trim() || undefined, notes: opts.notes?.trim() || undefined, ...(override || waived ? { override: true } : {}),
    };
    const updated = await this.model.findOneAndUpdate(
      { _id: id, status: from },
      { status: to, $push: { statusHistory: change } },
      { returnDocument: 'after' },
    );
    if (!updated) throw new ConflictException({ message: 'The application changed while you were working. Refresh and try again.', code: 'CONCURRENT_UPDATE' });

    // Any Admin move settles a pending recruiter decision.
    if (actor.role === ADMIN) await this.model.updateOne({ _id: id, 'recruiterDecision.pending': true }, { $set: { 'recruiterDecision.pending': false } });

    await this.events.publish(opts.event ?? EVENT_FOR[to] ?? DomainEvent.APPLICATION_STATUS_CHANGED, {
      actor: { id: actor.id, role: actor.role }, entity: { type: 'Application', id }, reason: opts.reason,
      previousState: { status: from }, newState: { status: to, ...(override ? { override: true } : {}) },
      data: { applicationNumber: updated.applicationNumber, candidateId: String(updated.candidateId), recruiterId: String(updated.recruiterId), jobId: String(updated.jobId), ...opts.eventData },
    });
    return updated;
  }
}
