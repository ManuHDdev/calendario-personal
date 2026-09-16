import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./keycloak', () => ({
  default: { token: 'fake-token' },
}));

import { sendMessage, getInboxEmails, getInboxLog } from './api';

describe('mensajeria api service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sendMessage hace POST a /mensajeria/api/send con el body y el Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ channel: 'email', mode: 'mock', status: 'mock-logged' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMessage({ channel: 'email', to: 'a@b.com', subject: 's', body: 'b' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/mensajeria/api/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
      }),
    );
    expect(result.status).toBe('mock-logged');
  });

  it('getInboxEmails hace GET a /mensajeria/api/inbox/emails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await getInboxEmails();

    expect(fetchMock).toHaveBeenCalledWith('/mensajeria/api/inbox/emails', expect.anything());
  });

  it('getInboxLog añade el filtro de canal en la query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await getInboxLog('sms');

    expect(fetchMock).toHaveBeenCalledWith('/mensajeria/api/inbox/log?channel=sms', expect.anything());
  });

  it('propaga el mensaje de error del backend cuando la respuesta no es ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendMessage({ channel: 'sms', to: '+34600000000', body: 'hola' })).rejects.toThrow('Forbidden');
  });
});
