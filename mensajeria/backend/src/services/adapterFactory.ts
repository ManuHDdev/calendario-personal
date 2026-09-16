import type { CallSendInput, ChannelAdapter, EmailSendInput, Mode, SmsSendInput } from '../adapters/types';
import { MockEmailAdapter } from '../adapters/email/mockEmailAdapter';
import { SendgridEmailAdapter } from '../adapters/email/sendgridEmailAdapter';
import { MockSmsAdapter } from '../adapters/sms/mockSmsAdapter';
import { TwilioSmsAdapter } from '../adapters/sms/twilioSmsAdapter';
import { MockCallAdapter } from '../adapters/call/mockCallAdapter';
import { TwilioCallAdapter } from '../adapters/call/twilioCallAdapter';

/**
 * Punto único donde se decide, por canal, si toca mock o real.
 *
 * Regla dura del spec: MENSAJERIA_MODE es un interruptor EXPLÍCITO, nunca se
 * autodetecta por la mera presencia de credenciales. Pero incluso con
 * MENSAJERIA_MODE=real, un canal cuyas variables reales no estén completas se
 * queda en mock EN SILENCIO — nunca lanza, nunca lo intenta a medias. Cada
 * canal se decide de forma independiente: se puede tener email real y
 * sms/call mock al mismo tiempo.
 */
function getMode(env: NodeJS.ProcessEnv = process.env): Mode {
  return env.MENSAJERIA_MODE === 'real' ? 'real' : 'mock';
}

export function getEmailAdapter(env: NodeJS.ProcessEnv = process.env): ChannelAdapter<EmailSendInput> {
  if (getMode(env) === 'real' && env.SENDGRID_API_KEY) {
    return new SendgridEmailAdapter(env.SENDGRID_API_KEY, env.SENDGRID_FROM_EMAIL);
  }
  return new MockEmailAdapter();
}

export function getSmsAdapter(env: NodeJS.ProcessEnv = process.env): ChannelAdapter<SmsSendInput> {
  if (
    getMode(env) === 'real' &&
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_FROM_NUMBER
  ) {
    return new TwilioSmsAdapter(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM_NUMBER);
  }
  return new MockSmsAdapter();
}

export function getCallAdapter(env: NodeJS.ProcessEnv = process.env): ChannelAdapter<CallSendInput> {
  if (
    getMode(env) === 'real' &&
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_FROM_NUMBER
  ) {
    return new TwilioCallAdapter(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_FROM_NUMBER);
  }
  return new MockCallAdapter();
}
