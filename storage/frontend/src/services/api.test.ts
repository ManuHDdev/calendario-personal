import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadFileResumable } from './api';

// El token viene de keycloak; para estos tests basta con que haya uno.
vi.mock('./keycloak', () => ({ default: { token: 'token-de-prueba' } }));

const CHUNK = 8 * 1024 * 1024;

function archivo(bytes: number, nombre = 'IMG_0001.MOV'): File {
  return new File([new Uint8Array(bytes)], nombre, { type: 'video/quicktime' });
}

function respuesta(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * Servidor de mentira que se comporta como el de verdad: acumula bytes y
 * solo acepta el trozo que continúa donde se quedó.
 */
function servidorFalso() {
  const estado = { recibidos: 0, total: 0, trozos: 0, completado: false };

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET';

    if (url.endsWith('/uploads') && metodo === 'POST') {
      estado.total = JSON.parse(init!.body as string).size;
      return respuesta({ uploadId: 'u1', receivedBytes: 0, totalBytes: estado.total });
    }
    if (url.endsWith('/complete')) {
      estado.completado = true;
      return respuesta({ id: 'f1', name: 'IMG_0001.MOV', relativePath: 'IMG_0001.MOV' }, 201);
    }
    if (metodo === 'PATCH') {
      const offset = Number((init!.headers as Record<string, string>)['X-Chunk-Offset']);
      if (offset !== estado.recibidos) return respuesta({ error: 'hueco' }, 409);
      estado.recibidos += (init!.body as Blob).size;
      estado.trozos++;
      return respuesta({ uploadId: 'u1', receivedBytes: estado.recibidos, totalBytes: estado.total });
    }
    // GET del progreso
    return respuesta({ uploadId: 'u1', receivedBytes: estado.recibidos, totalBytes: estado.total });
  });

  return { estado, fetchMock };
}

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('uploadFileResumable', () => {
  it('un archivo pequeño va de una sola tacada, sin abrir sesión de subida', async () => {
    // La ruta corta usa XMLHttpRequest para poder informar del progreso.
    const send = vi.fn();
    const xhr = {
      open: vi.fn(), setRequestHeader: vi.fn(), send,
      upload: {}, status: 201, responseText: JSON.stringify({ id: 'f1', name: 'foto.jpg' }),
      onload: null as null | (() => void),
    };
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhr));
    send.mockImplementation(() => xhr.onload?.());

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await uploadFileResumable(archivo(1024, 'foto.jpg'));
    expect(res.name).toBe('foto.jpg');
    // Nada de /uploads: no se abrió sesión troceada.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('trocea un archivo grande y lo cierra al llegar al final', async () => {
    const { estado, fetchMock } = servidorFalso();
    vi.stubGlobal('fetch', fetchMock);

    const tamano = CHUNK * 2 + 1234;
    const progreso: number[] = [];
    await uploadFileResumable(archivo(tamano), { onProgress: (p) => progreso.push(p) });

    expect(estado.trozos).toBe(3);
    expect(estado.recibidos).toBe(tamano);
    expect(estado.completado).toBe(true);
    expect(progreso[progreso.length - 1]).toBe(100);
  });

  it('tras un corte reanuda desde donde dice el servidor, sin reenviar lo ya subido', async () => {
    const { estado, fetchMock } = servidorFalso();
    let falloInyectado = false;

    const conCorte = vi.fn(async (url: string, init?: RequestInit) => {
      // El segundo trozo se pierde por el camino UNA vez.
      if (!falloInyectado && init?.method === 'PATCH' && estado.recibidos === CHUNK) {
        falloInyectado = true;
        throw new TypeError('Failed to fetch');
      }
      return fetchMock(url, init);
    });
    vi.stubGlobal('fetch', conCorte);

    const reintentos: number[] = [];
    const tamano = CHUNK * 2;
    await uploadFileResumable(archivo(tamano), { onRetry: (n) => reintentos.push(n) });

    expect(reintentos).toEqual([1]);
    expect(estado.recibidos).toBe(tamano);
    expect(estado.completado).toBe(true);
    // Dos trozos aceptados: el que falló no se contabilizó dos veces.
    expect(estado.trozos).toBe(2);
  });

  it('un tipo no admitido falla al momento, sin gastar reintentos', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/uploads') && init?.method === 'POST') {
        return respuesta({ uploadId: 'u1', receivedBytes: 0, totalBytes: CHUNK * 2 });
      }
      return respuesta({ error: 'MIME type not allowed: application/x-msdownload' }, 415);
    });
    vi.stubGlobal('fetch', fetchMock);

    const reintentos: number[] = [];
    await expect(
      uploadFileResumable(archivo(CHUNK * 2), { onRetry: (n) => reintentos.push(n) }),
    ).rejects.toThrow(/MIME type not allowed/);

    expect(reintentos).toEqual([]);
  });

  it('propaga el mensaje del servidor cuando no se puede ni abrir la subida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ error: 'El archivo supera el límite de 2048 MB' }, 413)));

    await expect(uploadFileResumable(archivo(CHUNK * 2))).rejects.toThrow(/supera el límite/);
  });
});
