import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./keycloak', () => ({
  default: { token: 'tok.en/with+chars', updateToken: vi.fn(), login: vi.fn() },
}));

import keycloak from './keycloak';
import { currentRoles, deletePaths, downloadUrl, fileUrl, listDir, pathQuery, refreshToken, thumbUrl } from './api';

describe('media URLs', () => {
  it('encodes the path once and carries the token', () => {
    expect(fileUrl('fotos/ñandú café.jpg')).toBe(
      `/descargas/api/file?path=${encodeURIComponent('fotos/ñandú café.jpg')}&token=${encodeURIComponent('tok.en/with+chars')}`,
    );
    expect(downloadUrl('a.txt')).toContain('/descargas/api/download?path=a.txt&token=');
  });

  it('builds thumbnail URLs with the same token handling and a width', () => {
    const token = encodeURIComponent('tok.en/with+chars');
    expect(thumbUrl('fotos/ñandú café.jpg')).toBe(
      `/descargas/api/thumb?path=${encodeURIComponent('fotos/ñandú café.jpg')}&w=320&token=${token}`,
    );
    expect(thumbUrl('a.jpg', 640)).toBe(`/descargas/api/thumb?path=a.jpg&w=640&token=${token}`);
    expect(thumbUrl('a.jpg', 160)).toContain('&w=160&');
  });

  it('keeps a ../ attempt as data inside the encoded value', () => {
    expect(pathQuery('../x')).toBe('path=..%2Fx');
  });
});

describe('listDir', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sends the bearer header and the path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ path: 'a', entries: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(listDir('a')).resolves.toEqual({ path: 'a', entries: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/descargas/api/list?path=a',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok.en/with+chars' } }),
    );
  });

  it('turns HTTP errors into Spanish messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(listDir('x')).rejects.toThrow('No se ha encontrado la carpeta');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(listDir('x')).rejects.toThrow('No tienes permiso');
  });
});

describe('deletePaths', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs the paths as JSON with the token in the Authorization header only', async () => {
    const body = { deleted: ['a.jpg'], failed: [{ path: 'b.jpg', error: 'Not found' }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', fetchMock);
    await expect(deletePaths(['a.jpg', 'b.jpg'])).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/descargas/api/delete'); // no ?token= in the URL
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok.en/with+chars', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ paths: ['a.jpg', 'b.jpg'] });
  });

  it('turns HTTP errors into Spanish messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(deletePaths(['a'])).rejects.toThrow('No tienes permiso para eliminar');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(deletePaths(['a'])).rejects.toThrow('sesión ha caducado');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(deletePaths(['a'])).rejects.toThrow('Error 500');
  });
});

describe('currentRoles', () => {
  it('reads the realm roles from the parsed token', () => {
    (keycloak as unknown as { tokenParsed?: unknown }).tokenParsed = { realm_access: { roles: ['admin'] } };
    expect(currentRoles()).toEqual(['admin']);
    (keycloak as unknown as { tokenParsed?: unknown }).tokenParsed = undefined;
    expect(currentRoles()).toEqual([]);
  });
});

describe('refreshToken', () => {
  it('sends the user to login when the refresh fails', async () => {
    (keycloak.updateToken as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('expired'));
    await refreshToken();
    expect(keycloak.login).toHaveBeenCalled();
  });
});
