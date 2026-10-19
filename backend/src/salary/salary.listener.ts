import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '@rms/shared';
import type { DomainEventPayload } from '../common/events/event-bus.service';
import { SalaryService } from './salary.service';

/** Keeps salary in step with payments and contracts. A failure here must never break the action that caused it. */
@Injectable()
export class SalaryListener {
  private readonly logger = new Logger(SalaryListener.name);
  constructor(private readonly salary: SalaryService) {}

  private async safely(label: string, fn: () => Promise<unknown>) {
    try { await fn(); } catch (e) { this.logger.error(`${label}: ${e instanceof Error ? e.message : e}`); }
  }

  @OnEvent(DomainEvent.PAYMENT_GENERATED) @OnEvent(DomainEvent.PAYMENT_ADJUSTED) @OnEvent(DomainEvent.PAYMENT_CLIENT_PAID) @OnEvent(DomainEvent.PAYMENT_RECEIVED)
  @OnEvent(DomainEvent.PAYMENT_DISPUTED) @OnEvent(DomainEvent.PAYMENT_RESOLVED) @OnEvent(DomainEvent.PAYMENT_PAYOUT_SENT) @OnEvent(DomainEvent.PAYMENT_PAYOUT_CONFIRMED) @OnEvent(DomainEvent.PAYMENT_CANCELLED)
  onPayment(p: DomainEventPayload) { return this.safely('payment sync', () => this.salary.syncFromPayment(p.entity.id)); }

  @OnEvent(DomainEvent.CONTRACT_ACTIVATED) @OnEvent(DomainEvent.CONTRACT_UPDATED) @OnEvent(DomainEvent.CONTRACT_TERMINATED)
  onContract(p: DomainEventPayload) { return this.safely('contract sync', () => this.salary.onContractChanged(p.entity.id)); }
}
