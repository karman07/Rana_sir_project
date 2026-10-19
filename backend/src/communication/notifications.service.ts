import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { NotificationType } from '@rms/shared';
import { Model, Types } from 'mongoose';
import type { AuthUser } from '../auth/decorators';
import { paginate } from '../common/database/paginate';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Notification } from './schemas/notification.schema';

export interface NewNotification {
  userId: string; title: string; description?: string; type: NotificationType;
  entityType?: string; entityId?: string; link?: string; event?: string;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private readonly model: Model<Notification>) {}

  create(n: NewNotification) {
    return this.model.create({ ...n, userId: new Types.ObjectId(n.userId) });
  }

  private view(n: any) {
    const { _id, __v, userId, ...rest } = n;
    return { id: String(_id), ...rest };
  }

  /** Always scoped to the caller: nobody can read another user's notifications. */
  async list(q: PaginationQueryDto & { unread?: boolean; type?: string }, user: AuthUser) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(user.id) };
    if (q.unread) filter.read = false;
    if (q.type) filter.type = q.type;
    const { items, meta } = await paginate(this.model, filter, q, { sortable: ['createdAt'], defaultSort: '-createdAt', searchFields: ['title', 'description'] });
    return { items: items.map((n) => this.view(n)), meta };
  }

  unreadCount(user: AuthUser) {
    return this.model.countDocuments({ userId: user.id as never, read: false }).then((count) => ({ count }));
  }

  async markRead(id: string, user: AuthUser) {
    const n = await this.model.findOneAndUpdate({ _id: id, userId: user.id as never }, { read: true, readAt: new Date() }, { returnDocument: 'after' }).lean();
    if (!n) throw new NotFoundException('Notification not found');
    return this.view(n);
  }

  async markAllRead(user: AuthUser) {
    const r = await this.model.updateMany({ userId: user.id as never, read: false }, { read: true, readAt: new Date() });
    return { updated: r.modifiedCount };
  }
}
