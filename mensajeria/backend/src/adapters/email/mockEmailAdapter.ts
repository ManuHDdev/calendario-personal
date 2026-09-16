import type { ChannelAdapter, ChannelSendResult, EmailSendInput } from '../types';
import { captureEmail } from '../../services/mailStore';

/**
 * Adaptador mock de email. Nunca sale a la red: "envía" a través del SMTP
 * falso en proceso (`services/fakeSmtpServer.ts`, backed por el paquete
 * `smtp-server`) llamando directamente a la misma función de captura que usa
 * ese servidor cuando recibe una sesión SMTP real — así el inbox ve
 * exactamente el mismo registro sin depender de round-trips de socket que
 * añadirían flakiness a los tests.
 */
export class MockEmailAdapter implements ChannelAdapter<EmailSendInput> {
  readonly mode = 'mock' as const;

  async send(input: EmailSendInput): Promise<ChannelSendResult> {
    const row = await captureEmail({
      from: input.from ?? 'mensajeria@mock.local',
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html ?? null,
    });
    return {
      mode: 'mock',
      status: 'mock-logged',
      recordId: row.id,
    };
  }
}
