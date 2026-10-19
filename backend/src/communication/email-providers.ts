import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env';

export interface OutgoingMessage { to: string; subject: string; html: string; text: string }
export interface EmailProvider { readonly name: string; send(msg: OutgoingMessage): Promise<{ id: string }> }

class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly client: Resend;
  constructor(apiKey: string, private readonly from: string) { this.client = new Resend(apiKey); }

  async send(msg: OutgoingMessage) {
    const { data, error } = await this.client.emails.send({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    if (error || !data) throw new Error(error?.message ?? 'Resend rejected the email');
    return { id: data.id };
  }
}

/** Used when no RESEND_API_KEY is set (local development): logs instead of sending. */
class ConsoleProvider implements EmailProvider {
  readonly name = 'console';
  private readonly logger = new Logger('Email');
  async send(msg: OutgoingMessage) {
    this.logger.log(`(not sent - no RESEND_API_KEY) to=${msg.to} subject="${msg.subject}"`);
    return { id: `console-${Date.now()}` };
  }
}

@Injectable()
export class EmailProviderFactory {
  readonly provider: EmailProvider;
  constructor(config: ConfigService<Env, true>) {
    const key = config.get('RESEND_API_KEY');
    this.provider = key ? new ResendProvider(key, config.get('EMAIL_FROM')) : new ConsoleProvider();
  }
}
