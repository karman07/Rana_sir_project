import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '@rms/shared';
import type { DomainEventPayload } from '../common/events/event-bus.service';
import { PayslipsService } from './payslips.service';

/** A payslip is issued the moment the candidate's payout is recorded as sent. A failure must never break the payout itself. */
@Injectable()
export class PayslipsListener {
  private readonly logger = new Logger(PayslipsListener.name);
  constructor(private readonly payslips: PayslipsService) {}

  @OnEvent(DomainEvent.PAYMENT_PAYOUT_SENT)
  async onPayoutSent(p: DomainEventPayload) {
    try {
      await this.payslips.generateForPayment(p.entity.id);
    } catch (e: any) {
      // A re-sent payout after a dispute already has its payslip; that is expected and fine.
      if (e?.response?.code !== 'PAYSLIP_EXISTS') this.logger.error(`Could not issue a payslip for ${p.entity.id}: ${e?.message ?? e}`);
    }
  }
}
