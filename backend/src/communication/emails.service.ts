import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { paginate } from '../common/database/paginate';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Email, EmailStatus } from './schemas/email.schema';

@Injectable()
export class EmailsService {
  constructor(@InjectModel(Email.name) private readonly model: Model<Email>) {}

  private view(e: any) {
    const { _id, __v, userId, ...rest } = e;
    return { id: String(_id), ...rest, scheduled: e.status === EmailStatus.QUEUED && new Date(e.nextAttemptAt) > new Date(Date.now() + 10_000) };
  }

  async list(q: PaginationQueryDto & { status?: string; template?: string }) {
    const filter: Record<string, unknown> = {};
    if (q.status === 'SCHEDULED') Object.assign(filter, { status: EmailStatus.QUEUED, nextAttemptAt: { $gt: new Date(Date.now() + 10_000) } });
    else if (q.status === EmailStatus.QUEUED) Object.assign(filter, { status: EmailStatus.QUEUED, nextAttemptAt: { $lte: new Date(Date.now() + 10_000) } });
    else if (q.status) filter.status = q.status;
    if (q.template) filter.template = q.template;
    const { items, meta } = await paginate(this.model, filter, q, {
      sortable: ['createdAt', 'sentAt', 'status', 'to'], defaultSort: '-createdAt', searchFields: ['to', 'subject', 'template', 'toName'],
    });
    return { items: items.map((e) => this.view(e)), meta };
  }

  async get(id: string) {
    const e = await this.model.findById(id).select('+html +text').lean();
    if (!e) throw new NotFoundException('Email not found');
    return this.view(e);
  }

  /** Re-queues a failed email for another round of attempts. */
  async retry(id: string) {
    const e = await this.model.findOneAndUpdate(
      { _id: id, status: { $in: [EmailStatus.FAILED, EmailStatus.BOUNCED] } },
      { status: EmailStatus.QUEUED, attempts: 0, nextAttemptAt: new Date(), failureReason: undefined, $push: { events: { status: 'RETRY_REQUESTED', at: new Date() } } },
      { returnDocument: 'after' },
    ).lean();
    if (!e) throw new ConflictException({ message: 'Only failed or bounced emails can be retried', code: 'NOT_RETRYABLE' });
    return this.view(e);
  }

  async stats() {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const rows = await this.model.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const [last24h, scheduled] = await Promise.all([
      this.model.countDocuments({ createdAt: { $gte: since } }),
      this.model.countDocuments({ status: EmailStatus.QUEUED, nextAttemptAt: { $gt: new Date(Date.now() + 10_000) } }),
    ]);
    return {
      total: rows.reduce((a, r) => a + r.n, 0), last24h, scheduled,
      queued: (by.QUEUED ?? 0) + (by.SENDING ?? 0) - scheduled, sent: (by.SENT ?? 0) + (by.DELIVERED ?? 0), delivered: by.DELIVERED ?? 0,
      failed: by.FAILED ?? 0, bounced: (by.BOUNCED ?? 0) + (by.COMPLAINED ?? 0),
    };
  }
}
