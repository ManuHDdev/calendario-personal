/**
 * Cliente HTTP compartido por los portales.
 *
 * Mismo enfoque que `ruta/backend/src/services/wallapop.ts`: cabeceras de
 * navegador de escritorio porque el User-Agent por defecto de Node lo
 * rechazan casi todos los sitios de consumo, timeout explícito, y un reintento
 * corto para el fallo de red puntual. No hay rotación de proxies ni nada
 * parecido: si un portal responde 403 de forma sostenida, el rastreo de ESE
 * portal se marca como fallido y se ve en la UI, en lugar de insistir.
 */

export class PortalError extends Error {
  readonly portal: string;

  constructor(portal: string, mensaje: string) {
    super(mensaje);
    this.name = 'PortalError';
    this.portal = portal;
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function userAgentAleatorio(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface OpcionesFetch {
  portal: string;
  timeoutMs?: number;
  /** Cabeceras adicionales; sobrescriben las por defecto si coinciden. */
  headers?: Record<string, string>;
  /** Reintentos ANTE FALLO DE RED, no ante 403/429 (esos no mejoran repitiendo). */
  reintentos?: number;
  aceptar?: 'html' | 'json';
}

const ESPERA_REINTENTO_MS = 1_500;

async function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function peticion(url: string, opts: OpcionesFetch): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgentAleatorio(),
        Accept:
          opts.aceptar === 'json'
            ? 'application/json, text/plain, */*'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        ...opts.headers,
      },
    });

    if (!res.ok) {
      // 403/429 casi siempre significan "me han detectado o he ido muy
      // rápido". Se distingue en el mensaje para que la UI pueda decir algo
      // útil en vez de un "error" genérico.
      const pista =
        res.status === 403 || res.status === 429
          ? ' (bloqueo o límite de peticiones del portal)'
          : '';
      throw new PortalError(opts.portal, `${opts.portal} respondió ${res.status}${pista}`);
    }

    return await res.text();
  } catch (err) {
    if (err instanceof PortalError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PortalError(opts.portal, `${opts.portal} no respondió en ${timeoutMs} ms`);
    }
    throw new PortalError(
      opts.portal,
      `Fallo la petición a ${opts.portal}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTexto(url: string, opts: OpcionesFetch): Promise<string> {
  const reintentos = opts.reintentos ?? 1;
  let ultimoError: unknown;

  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      return await peticion(url, opts);
    } catch (err) {
      ultimoError = err;
      // Un bloqueo o un límite de peticiones no mejora repitiéndolo de
      // inmediato; solo se reintenta el fallo de red o el timeout.
      const esBloqueo = err instanceof PortalError && /bloqueo o límite/.test(err.message);
      if (esBloqueo || intento === reintentos) break;
      await esperar(ESPERA_REINTENTO_MS * (intento + 1));
    }
  }

  throw ultimoError;
}

export async function fetchJson<T = unknown>(url: string, opts: OpcionesFetch): Promise<T> {
  const cuerpo = await fetchTexto(url, { ...opts, aceptar: 'json' });
  try {
    return JSON.parse(cuerpo) as T;
  } catch {
    throw new PortalError(opts.portal, `${opts.portal} devolvió algo que no es JSON`);
  }
}
