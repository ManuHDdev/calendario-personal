export type Channel = 'email' | 'sms' | 'call';
export type Mode = 'mock' | 'real';

export interface EmailSendInput {
  to: string;
  from?: string;
  subject: string;
  body: string;
  html?: string;
}

export interface SmsSendInput {
  to: string;
  from?: string;
  body: string;
}

export interface CallSendInput {
  to: string;
  from?: string;
  body: string;
}

export type ChannelSendInput = EmailSendInput | SmsSendInput | CallSendInput;

export interface ChannelSendResult {
  mode: Mode;
  status: string;
  providerId?: string | null;
  recordId?: number | null;
}

/**
 * Interfaz común a todos los adaptadores de canal (email/sms/call), tanto
 * mock como real. `send()` nunca lanza por un fallo de "negocio" (p.ej. un
 * proveedor real caído): el error se propaga como excepción solo ante un
 * problema de programación/config; el caller (la ruta) lo convierte en 500.
 */
export interface ChannelAdapter<TInput = ChannelSendInput> {
  readonly mode: Mode;
  send(input: TInput): Promise<ChannelSendResult>;
}
