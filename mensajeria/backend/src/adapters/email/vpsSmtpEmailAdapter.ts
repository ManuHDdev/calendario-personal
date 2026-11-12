import nodemailer from 'nodemailer';
import type { ChannelAdapter, ChannelSendResult, EmailSendInput } from '../types';

export class VpsSmtpEmailAdapter implements ChannelAdapter<EmailSendInput> {
  readonly mode = 'real' as const;

  private readonly transporter: nodemailer.Transporter;

  constructor(host: string, port: number) {
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async send(input: EmailSendInput): Promise<ChannelSendResult> {
    const from = input.from ?? 'mensajeria@noreply.local';
    const info = await this.transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html ?? undefined,
    });
    return {
      mode: 'real',
      status: 'sent',
      providerId: info.messageId ?? null,
    };
  }
}
