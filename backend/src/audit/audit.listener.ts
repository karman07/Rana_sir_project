import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventPayload } from '../common/events/event-bus.service';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';

/** Turns every domain event into an audit entry (spec §90 step 2). */
@Injectable()
export class AuditListener implements OnModuleInit {
  private readonly logger = new Logger(AuditListener.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  onModuleInit() {
    this.emitter.onAny(async (event: string | string[], payload: DomainEventPayload) => {
      if (!payload?.entity || !payload.actor) return;
      try {
        const actorName = payload.actor.id ? (await this.users.findById(payload.actor.id))?.name : 'System';
        await this.audit.record({
          actor: { id: payload.actor.id, role: payload.actor.role, name: actorName },
          action: String(event),
          entity: payload.entity,
          previousState: payload.previousState,
          newState: payload.newState,
          reason: payload.reason,
          metadata: payload.data,
          at: payload.occurredAt,
        });
      } catch (err) {
        this.logger.error(`Failed to audit ${String(event)}: ${err instanceof Error ? err.message : err}`);
      }
    });
  }
}
