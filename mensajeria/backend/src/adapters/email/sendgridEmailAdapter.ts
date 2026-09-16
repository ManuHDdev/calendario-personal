import sgMail from '@sendgrid/mail';
import type { ChannelAdapter, ChannelSendResult, EmailSendInput } from '../types';

/**
 * Adaptador real de email vía SendGrid. Solo se instancia cuando
 * SENDGRID_API_KEY está presente (ver services/adapterFactory.ts) — nunca se
 * llega aquí en modo mock ni si falta la credencial.
 */
export class SendgridEmailAdapter implements ChannelAdapter<EmailSendInput> {
  readonly mode = 'real' as const;

  constructor(private readonly apiKey: string, private readonly defaultFrom?: string) {
    sgMail.setApiKey(this.apiKey);
  }

  async send(input: EmailSendInput): Promise<ChannelSendResult> {
    const from = input.from ?? this.defaultFrom;
    if (!from) throw new Error('SendGrid requiere un remitente (from) verificado');

    const [response] = await sgMail.send({
      to: input.to,
      from,
      subject: input.subject,
      text: input.body,
      html: input.html ?? undefined,
    });

    return {
      mode: 'real',
      status: String(response.statusCode),
      providerId: response.headers?.['x-message-id'] ?? null,
    };
  }
}
