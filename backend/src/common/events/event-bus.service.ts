import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEvent, Role } from '@rms/shared';

export interface DomainEventPayload {
  actor: { id: string; role: Role } | { id: null; role: 'SYSTEM' };
  entity: { type: string; id: string };
  /** Free-form data handlers need (recipients, names, amounts...). Never trust for authz. */
  data?: Record<string, unknown>;
  reason?: string;
  previousState?: unknown;
  newState?: unknown;
  occurredAt?: Date;
}

/**
 * Single publishing point for domain events (spec §66). Handlers (audit, notifications, email, analytics)
 * subscribe with `@OnEvent(DomainEvent.X)`; one failing handler never breaks the originating request.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: DomainEvent, payload: DomainEventPayload): Promise<void> {
    const full = { ...payload, occurredAt: payload.occurredAt ?? new Date() };
    try {
      await this.emitter.emitAsync(event, full);
    } catch (err) {
      this.logger.error(`Handler failed for ${event}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
