import Twilio from 'twilio';
import type { CallSendInput, ChannelAdapter, ChannelSendResult } from '../types';
import { logMessage } from '../../services/messageLog';

/**
 * Adaptador real de llamada vía Twilio. El texto de `body` se lee en voz alta
 * con TwiML inline (`<Say>`), así que no hace falta una URL pública de
 * callback para probar el flujo.
 */
export class TwilioCallAdapter implements ChannelAdapter<CallSendInput> {
  readonly mode = 'real' as const;
  private readonly client: ReturnType<typeof Twilio>;

  constructor(accountSid: string, authToken: string, private readonly fromNumber: string) {
    this.client = Twilio(accountSid, authToken);
  }

  async send(input: CallSendInput): Promise<ChannelSendResult> {
    const twiml = `<Response><Say language="es-ES">${escapeXml(input.body)}</Say></Response>`;

    const call = await this.client.calls.create({
      to: input.to,
      from: input.from ?? this.fromNumber,
      twiml,
    });

    await logMessage({
      channel: 'call',
      to: input.to,
      from: input.from ?? this.fromNumber,
      body: input.body,
      status: call.status,
      mode: 'real',
      providerId: call.sid,
    });

    return { mode: 'real', status: call.status, providerId: call.sid };
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
