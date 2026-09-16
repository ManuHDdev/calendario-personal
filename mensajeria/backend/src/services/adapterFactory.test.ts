import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn() }, calls: { create: vi.fn() } })),
}));

vi.mock('@sendgrid/mail', () => ({
  default: { setApiKey: vi.fn(), send: vi.fn() },
}));

import { getEmailAdapter, getSmsAdapter, getCallAdapter } from './adapterFactory';
import { MockEmailAdapter } from '../adapters/email/mockEmailAdapter';
import { SendgridEmailAdapter } from '../adapters/email/sendgridEmailAdapter';
import { MockSmsAdapter } from '../adapters/sms/mockSmsAdapter';
import { TwilioSmsAdapter } from '../adapters/sms/twilioSmsAdapter';
import { MockCallAdapter } from '../adapters/call/mockCallAdapter';
import { TwilioCallAdapter } from '../adapters/call/twilioCallAdapter';

function baseEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('adapterFactory — MENSAJERIA_MODE=mock siempre usa el adaptador mock', () => {
  it('email', () => {
    const env = baseEnv({ MENSAJERIA_MODE: 'mock', SENDGRID_API_KEY: 'sg-key' });
    expect(getEmailAdapter(env)).toBeInstanceOf(MockEmailAdapter);
  });

  it('sms', () => {
    const env = baseEnv({
      MENSAJERIA_MODE: 'mock',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+34600000001',
    });
    expect(getSmsAdapter(env)).toBeInstanceOf(MockSmsAdapter);
  });

  it('call', () => {
    const env = baseEnv({
      MENSAJERIA_MODE: 'mock',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+34600000001',
    });
    expect(getCallAdapter(env)).toBeInstanceOf(MockCallAdapter);
  });

  it('sin MENSAJERIA_MODE definido, por defecto también es mock', () => {
    expect(getEmailAdapter(baseEnv({ SENDGRID_API_KEY: 'sg-key' }))).toBeInstanceOf(MockEmailAdapter);
  });
});

describe('adapterFactory — MENSAJERIA_MODE=real usa el adaptador real SOLO si las credenciales de ese canal están completas', () => {
  it('email: usa SendGrid cuando SENDGRID_API_KEY está presente', () => {
    const env = baseEnv({ MENSAJERIA_MODE: 'real', SENDGRID_API_KEY: 'sg-key' });
    expect(getEmailAdapter(env)).toBeInstanceOf(SendgridEmailAdapter);
  });

  it('email: cae a mock en silencio si falta SENDGRID_API_KEY', () => {
    const env = baseEnv({ MENSAJERIA_MODE: 'real' });
    expect(getEmailAdapter(env)).toBeInstanceOf(MockEmailAdapter);
  });

  it('sms: usa Twilio cuando las tres variables están presentes', () => {
    const env = baseEnv({
      MENSAJERIA_MODE: 'real',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+34600000001',
    });
    expect(getSmsAdapter(env)).toBeInstanceOf(TwilioSmsAdapter);
  });

  it('sms: cae a mock en silencio si falta cualquiera de las tres variables de Twilio', () => {
    const env = baseEnv({ MENSAJERIA_MODE: 'real', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'token' });
    expect(getSmsAdapter(env)).toBeInstanceOf(MockSmsAdapter);
  });

  it('call: usa Twilio cuando las tres variables están presentes', () => {
    const env = baseEnv({
      MENSAJERIA_MODE: 'real',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 'token',
      TWILIO_FROM_NUMBER: '+34600000001',
    });
    expect(getCallAdapter(env)).toBeInstanceOf(TwilioCallAdapter);
  });

  it('call: cae a mock en silencio si faltan las variables de Twilio', () => {
    const env = baseEnv({ MENSAJERIA_MODE: 'real' });
    expect(getCallAdapter(env)).toBeInstanceOf(MockCallAdapter);
  });

  it('nunca lanza aunque falten todas las credenciales reales', () => {
    const env = baseEnv({ MENSAJERIA_MODE: 'real' });
    expect(() => getEmailAdapter(env)).not.toThrow();
    expect(() => getSmsAdapter(env)).not.toThrow();
    expect(() => getCallAdapter(env)).not.toThrow();
  });
});
