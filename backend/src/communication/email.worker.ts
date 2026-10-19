import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Env } from '../config/env';
import { EmailProviderFactory } from './email-providers';
import { EmailTemplatesService } from './email-templates.service';
import { Email, EmailStatus } from './schemas/email.schema';

const MAX_ATTEMPTS = 4;
/** Wait before attempt 2, 3, 4. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];
const STUCK_AFTER_MS = 5 * 60_000;

/** Delivers queued emails: claims each row atomically, sends it, and retries failures with backoff. */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectModel(Email.name) private readonly emails: Model<Email>,
    private readonly providers: EmailProviderFactory,
    private readonly templates: EmailTemplatesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    if (this.config.get('EMAIL_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.processOnce(), 5_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async processOnce(limit = 25): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let done = 0;
    try {
      // A crash mid-send leaves rows in SENDING; put them back in the queue.
      await this.emails.updateMany({ status: EmailStatus.SENDING, lastAttemptAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) } }, { status: EmailStatus.QUEUED });
      for (let i = 0; i < limit; i++) {
        const claimed = await this.emails.findOneAndUpdate(
          { status: EmailStatus.QUEUED, nextAttemptAt: { $lte: new Date() } },
          { status: EmailStatus.SENDING, lastAttemptAt: new Date(), $inc: { attempts: 1 } },
          { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
        ).select('+html +text');
        if (!claimed) break;
        await this.deliver(claimed);
        done++;
      }
    } finally {
      this.running = false;
    }
    return done;
  }

  private async deliver(email: any) {
    try {
      const { id } = await this.providers.provider.send({ to: email.to, subject: email.subject, html: email.html ?? '', text: email.text ?? '' });
      const tpl = await this.templates.get(email.template);
      const scrub = tpl?.sensitive
        ? { html: '<p>[Removed after sending: this email contained a one-time link.]</p>', text: '[Removed after sending: this email contained a one-time link.]', bodyRedacted: true }
        : {};
      await this.emails.updateOne({ _id: email._id }, {
        status: EmailStatus.SENT, sentAt: new Date(), provider: this.providers.provider.name, providerMessageId: id, failureReason: undefined, ...scrub,
        $push: { events: { status: EmailStatus.SENT, at: new Date() } },
      });
    } catch (err) {
      const reason = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      const final = email.attempts >= MAX_ATTEMPTS;
      this.logger.warn(`Email ${email._id} attempt ${email.attempts} failed: ${reason}`);
      await this.emails.updateOne({ _id: email._id }, {
        status: final ? EmailStatus.FAILED : EmailStatus.QUEUED, failureReason: reason,
        nextAttemptAt: new Date(Date.now() + (BACKOFF_MS[email.attempts - 1] ?? BACKOFF_MS.at(-1)!)),
        $push: { events: { status: final ? EmailStatus.FAILED : 'RETRY', at: new Date(), detail: reason } },
      });
    }
  }
}
