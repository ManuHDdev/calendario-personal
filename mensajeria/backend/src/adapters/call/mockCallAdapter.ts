import type { CallSendInput, ChannelAdapter, ChannelSendResult } from '../types';
import { logMessage } from '../../services/messageLog';

/** Adaptador mock de llamada: nunca marca de verdad, solo deja constancia en BD. */
export class MockCallAdapter implements ChannelAdapter<CallSendInput> {
  readonly mode = 'mock' as const;

  async send(input: CallSendInput): Promise<ChannelSendResult> {
    const row = await logMessage({
      channel: 'call',
      to: input.to,
      from: input.from ?? null,
      body: input.body,
      status: 'mock-logged',
      mode: 'mock',
    });
    return { mode: 'mock', status: 'mock-logged', recordId: row.id };
  }
}
