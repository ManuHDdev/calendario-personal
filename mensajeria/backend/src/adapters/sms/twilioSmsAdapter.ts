import Twilio from 'twilio';
import type { ChannelAdapter, ChannelSendResult, SmsSendInput } from '../types';
import { logMessage } from '../../services/messageLog';

/**
 * Adaptador real de SMS vía Twilio. Solo se instancia cuando
 * TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER están presentes
 * (ver services/adapterFactory.ts).
 */
export class TwilioSmsAdapter implements ChannelAdapter<SmsSendInput> {
  readonly mode = 'real' as const;
  private readonly client: ReturnType<typeof Twilio>;

  constructor(accountSid: string, authToken: string, private readonly fromNumber: string) {
    this.client = Twilio(accountSid, authToken);
  }

  async send(input: SmsSendInput): Promise<ChannelSendResult> {
    const message = await this.client.messages.create({
      to: input.to,
      from: input.from ?? this.fromNumber,
      body: input.body,
    });

    await logMessage({
      channel: 'sms',
      to: input.to,
      from: input.from ?? this.fromNumber,
      body: input.body,
      status: message.status,
      mode: 'real',
      providerId: message.sid,
    });

    return { mode: 'real', status: message.status, providerId: message.sid };
  }
}
