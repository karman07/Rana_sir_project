import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators';
import type { ApprovalAction, ApprovalCandidate, ApprovalPriority, ApprovalSource } from './approval.types';
import type { ApprovalsQueryDto } from './approvals.dto';

const DAY = 86_400_000;
const RANK: Record<ApprovalPriority, number> = { HIGH: 0, MEDIUM: 1, NORMAL: 2 };

/** Waiting time drives priority; urgent items (resubmissions) escalate sooner. */
export function priorityFor(submittedAt: Date, urgent = false, now = Date.now()): ApprovalPriority {
  const days = (now - +submittedAt) / DAY;
  if (days >= 3 || (urgent && days >= 1)) return 'HIGH';
  if (days >= 1 || urgent) return 'MEDIUM';
  return 'NORMAL';
}

@Injectable()
export class ApprovalsService {
  private readonly sources = new Map<string, ApprovalSource>();

  register(source: ApprovalSource) {
    this.sources.set(source.category, source);
  }

  categories() {
    return [...this.sources.values()].map((s) => ({ key: s.category, label: s.label, description: s.description }));
  }

  private async gather(category?: string) {
    const sources = [...this.sources.values()].filter((s) => !category || s.category === category);
    const now = Date.now();
    const lists = await Promise.all(
      sources.map(async (s) =>
        (await s.pending()).map((c: ApprovalCandidate) => ({
          id: `${s.category}:${c.entityId}`,
          category: s.category,
          categoryLabel: s.label,
          itemLabel: s.itemLabel,
          ...c,
          priority: priorityFor(c.submittedAt, c.urgent, now),
          waitingDays: Math.floor((now - +c.submittedAt) / DAY),
        })),
      ),
    );
    return lists.flat();
  }

  async list(q: ApprovalsQueryDto) {
    let items = await this.gather(q.category);
    if (q.priority) items = items.filter((i) => i.priority === q.priority);
    if (q.search?.trim()) {
      const needle = q.search.trim().toLowerCase();
      items = items.filter((i) => [i.title, i.subtitle, i.requester?.name, i.related?.label, i.itemLabel].some((v) => v?.toLowerCase().includes(needle)));
    }
    // Most urgent first; within a priority, whoever has waited longest.
    items.sort((a, b) => RANK[a.priority] - RANK[b.priority] || +a.submittedAt - +b.submittedAt);
    const total = items.length;
    const page = items.slice((q.page - 1) * q.limit, q.page * q.limit);
    return { items: page, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
  }

  async summary() {
    const items = await this.gather();
    const byCategory: Record<string, number> = Object.fromEntries([...this.sources.keys()].map((k) => [k, 0]));
    for (const i of items) byCategory[i.category]++;
    const oldest = items.reduce<Date | null>((o, i) => (!o || i.submittedAt < o ? i.submittedAt : o), null);
    return {
      total: items.length,
      high: items.filter((i) => i.priority === 'HIGH').length,
      medium: items.filter((i) => i.priority === 'MEDIUM').length,
      oldestSubmittedAt: oldest,
      byCategory,
      categories: this.categories(),
    };
  }

  async act(category: string, entityId: string, action: ApprovalAction, admin: AuthUser, body: { note?: string; publish?: boolean; commission?: { type: "PERCENT" | "FIXED"; percent?: number; amount?: number } }) {
    const source = this.sources.get(category);
    if (!source) throw new NotFoundException('Unknown approval category');
    if ((action === 'reject' || action === 'request-changes') && (body.note?.trim().length ?? 0) < 3) {
      throw new BadRequestException({ message: 'A reason is required', code: 'REASON_REQUIRED' });
    }
    return source.act(entityId, action, admin, body);
  }
}
