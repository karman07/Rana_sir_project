import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Model } from 'mongoose';
import { Public } from '../auth/decorators';
import type { Env } from '../config/env';
import { Email, EmailStatus } from './schemas/email.schema';

const MAP: Record<string, EmailStatus> = {
  'email.delivered': EmailStatus.DELIVERED, 'email.bounced': EmailStatus.BOUNCED, 'email.complained': EmailStatus.COMPLAINED,
};

/** Verifies a Svix-style signature (what Resend uses): HMAC-SHA256 of "<id>.<timestamp>.<body>" with the base64 secret. */
export function verifySignature(secret: string, id: string, timestamp: string, body: string, header: string, toleranceSec = 300): boolean {
  if (!id || !timestamp || !header) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return header.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

@Controller('webhooks')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);
  constructor(@InjectModel(Email.name) private readonly emails: Model<Email>, private readonly config: ConfigService<Env, true>) {}

  /** Resend reports delivery, bounces and complaints here, so the Email Center shows what actually happened. */
  @Public() @HttpCode(200) @Post('resend')
  async handle(@Req() req: Request & { rawBody?: Buffer }, @Headers('svix-id') id: string, @Headers('svix-timestamp') ts: string, @Headers('svix-signature') sig: string) {
    const secret = this.config.get('RESEND_WEBHOOK_SECRET');
    if (!secret) throw new UnauthorizedException('Webhook not configured');
    const raw = req.rawBody?.toString('utf8');
    if (!raw || !verifySignature(secret, id, ts, raw, sig)) throw new UnauthorizedException('Invalid signature');

    const event = JSON.parse(raw) as { type: string; data?: { email_id?: string; bounce?: { message?: string } } };
    const status = MAP[event.type];
    const messageId = event.data?.email_id;
    if (!status || !messageId) return { ignored: true };
    if (!event.data) throw new BadRequestException();
    await this.emails.updateOne({ providerMessageId: messageId }, {
      status, ...(status === EmailStatus.DELIVERED ? { deliveredAt: new Date() } : { failureReason: event.data.bounce?.message ?? event.type }),
      $push: { events: { status, at: new Date(), detail: event.data.bounce?.message } },
    });
    return { updated: true };
  }
}
