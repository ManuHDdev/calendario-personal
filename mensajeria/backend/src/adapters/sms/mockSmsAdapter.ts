import type { ChannelAdapter, ChannelSendResult, SmsSendInput } from '../types';
import { logMessage } from '../../services/messageLog';

/** Adaptador mock de SMS: nunca sale a la red, solo deja constancia en BD. */
export class MockSmsAdapter implements ChannelAdapter<SmsSendInput> {
  readonly mode = 'mock' as const;

  async send(input: SmsSendInput): Promise<ChannelSendResult> {
    const row = await logMessage({
      channel: 'sms',
      to: input.to,
      from: input.from ?? null,
      body: input.body,
      status: 'mock-logged',
      mode: 'mock',
    });
    return { mode: 'mock', status: 'mock-logged', recordId: row.id };
  }
}
