import { describe, it, expect, vi, beforeEach } from 'vitest';

// Los adaptadores mock nunca deben tocar red: se mockean los clientes de
// Twilio/SendGrid y el pool de Postgres, y se comprueba que solo se llama a
// `pool.query` (captura en BD), nunca a los clientes de los proveedores reales.
vi.mock('../db/pool', () => ({
  pool: { query: vi.fn() },
}));

const twilioMessagesCreate = vi.fn();
const twilioCallsCreate = vi.fn();
vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    messages: { create: twilioMessagesCreate },
    calls: { create: twilioCallsCreate },
  })),
}));

const sendgridSend = vi.fn();
vi.mock('@sendgrid/mail', () => ({
  default: { setApiKey: vi.fn(), send: sendgridSend },
}));

import { pool } from '../db/pool';
import { MockEmailAdapter } from './email/mockEmailAdapter';
import { MockSmsAdapter } from './sms/mockSmsAdapter';
import { MockCallAdapter } from './call/mockCallAdapter';

const mockedQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

describe('MockEmailAdapter', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    twilioMessagesCreate.mockReset();
    twilioCallsCreate.mockReset();
    sendgridSend.mockReset();
  });

  it('captura el email en BD y nunca llama a SendGrid', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: 1, from_address: 'a@b.com', to_address: 'c@d.com', subject: 's', text_body: 'b', html_body: null, received_at: 'now' }],
    });

    const adapter = new MockEmailAdapter();
    const result = await adapter.send({ to: 'c@d.com', subject: 's', body: 'b' });

    expect(result.mode).toBe('mock');
    expect(result.status).toBe('mock-logged');
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery.mock.calls[0][0]).toMatch(/INSERT INTO mensajeria_captured_emails/);
    expect(sendgridSend).not.toHaveBeenCalled();
  });
});

describe('MockSmsAdapter', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    twilioMessagesCreate.mockReset();
  });

  it('registra el SMS en BD con status mock-logged y nunca llama a Twilio', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: 2, channel: 'sms', to_address: '+34600000000', from_address: null, body: 'hola', status: 'mock-logged', mode: 'mock', provider_id: null, created_at: 'now' }],
    });

    const adapter = new MockSmsAdapter();
    const result = await adapter.send({ to: '+34600000000', body: 'hola' });

    expect(result.mode).toBe('mock');
    expect(result.status).toBe('mock-logged');
    expect(mockedQuery.mock.calls[0][0]).toMatch(/INSERT INTO mensajeria_message_log/);
    expect(mockedQuery.mock.calls[0][1]).toContain('sms');
    expect(twilioMessagesCreate).not.toHaveBeenCalled();
  });
});

describe('MockCallAdapter', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    twilioCallsCreate.mockReset();
  });

  it('registra la llamada en BD con status mock-logged y nunca llama a Twilio', async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ id: 3, channel: 'call', to_address: '+34600000000', from_address: null, body: 'hola', status: 'mock-logged', mode: 'mock', provider_id: null, created_at: 'now' }],
    });

    const adapter = new MockCallAdapter();
    const result = await adapter.send({ to: '+34600000000', body: 'hola' });

    expect(result.mode).toBe('mock');
    expect(result.status).toBe('mock-logged');
    expect(mockedQuery.mock.calls[0][1]).toContain('call');
    expect(twilioCallsCreate).not.toHaveBeenCalled();
  });
});
