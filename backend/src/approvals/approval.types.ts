import type { AuthUser } from '../auth/decorators';

export type ApprovalAction = 'approve' | 'reject' | 'request-changes';
export type ApprovalPriority = 'HIGH' | 'MEDIUM' | 'NORMAL';

/** What a source returns; priority and id are added by the ApprovalsService. */
export interface ApprovalCandidate {
  entityId: string;
  title: string;
  subtitle?: string;
  requester?: { id?: string; name: string; role: string };
  related?: { type: string; label: string; href?: string };
  /** Deep link to the full review page, when one exists. */
  href?: string;
  submittedAt: Date;
  /** Escalates priority (e.g. a resubmission after changes were requested). */
  urgent?: boolean;
  tags?: string[];
  actions: ApprovalAction[];
}

/**
 * A kind of thing that waits on Admin. Each module registers one (or more) of these so the Approval
 * Center is assembled from live data without it knowing about every module (contracts, payments, ... later).
 */
export interface ApprovalSource {
  readonly category: string;
  readonly label: string;
  readonly description: string;
  /** Short noun for one item, e.g. "Job request". */
  readonly itemLabel: string;
  pending(): Promise<ApprovalCandidate[]>;
  act(entityId: string, action: ApprovalAction, admin: AuthUser, body: { note?: string; publish?: boolean; commission?: { type: "PERCENT" | "FIXED"; percent?: number; amount?: number } }): Promise<unknown>;
}
