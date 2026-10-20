import { validarUrlPublica, type Resolutor } from './urlSeguridad';

/**
 * Proxy de imágenes de cámara con caché en memoria.
 *
 * Por qué existe: el navegador no puede pedir la imagen directamente al origen
 * (CORS, hotlinking, mezcla http/https), y pedirla desde cada pestaña abierta
 * multiplicaría el tráfico contra la DGT. Con la caché, N visores de la misma
 * cámara cuestan una sola petición por ventana de `ttlMs`.
 */

export const TIPOS_IMAGEN_PERMITIDOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECCIONES = 3;
const TIMEOUT_MS = 8_000;

export interface ImagenCapturada {
  cuerpo: Buffer;
  tipo: string;
  capturadaEn: number;
}

export class ImagenNoDisponibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImagenNoDisponibleError';
  }
}

export type Capturador = (url: string) => Promise<ImagenCapturada>;

/** Descarga real: valida el destino en cada salto, limita tamaño/tiempo y exige un tipo de imagen raster. */
export function crearCapturadorHttp(resolver?: Resolutor): Capturador {
  return async (urlInicial) => {
    let actual = urlInicial;
    for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
      const url = await validarUrlPublica(actual, resolver);
      const respuesta = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'calendario-camaras/1.0', Accept: 'image/*' },
      });

      if (respuesta.status >= 300 && respuesta.status < 400) {
        const destino = respuesta.headers.get('location');
        if (!destino) throw new ImagenNoDisponibleError('Redirección sin destino');
        actual = new URL(destino, url).toString();
        continue;
      }
      if (!respuesta.ok) throw new ImagenNoDisponibleError(`El origen respondió HTTP ${respuesta.status}`);

      const tipo = (respuesta.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!(TIPOS_IMAGEN_PERMITIDOS as readonly string[]).includes(tipo)) {
        throw new ImagenNoDisponibleError(`El origen no devolvió una imagen (${tipo || 'sin tipo'})`);
      }
      const declarado = Number(respuesta.headers.get('content-length'));
      if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
        throw new ImagenNoDisponibleError('La imagen supera el tamaño máximo');
      }

      const cuerpo = await leerConLimite(respuesta);
      if (cuerpo.length === 0) throw new ImagenNoDisponibleError('Imagen vacía');
      return { cuerpo, tipo, capturadaEn: Date.now() };
    }
    throw new ImagenNoDisponibleError('Demasiadas redirecciones');
  };
}

async function leerConLimite(respuesta: Response): Promise<Buffer> {
  if (!respuesta.body) return Buffer.from(await respuesta.arrayBuffer());
  const trozos: Buffer[] = [];
  let total = 0;
  const lector = respuesta.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await lector.cancel();
      throw new ImagenNoDisponibleError('La imagen supera el tamaño máximo');
    }
    trozos.push(Buffer.from(value));
  }
  return Buffer.concat(trozos);
}

interface Entrada {
  imagen?: ImagenCapturada;
  error?: ImagenNoDisponibleError;
  hasta: number;
}

export interface OpcionesCache {
  ttlMs: number;
  /** Cuánto se recuerda un fallo, para no martillear un origen caído. */
  ttlErrorMs: number;
  maxEntradas: number;
  capturador: Capturador;
  ahora?: () => number;
}

export class CacheImagenes {
  private readonly entradas = new Map<string, Entrada>();
  private readonly enVuelo = new Map<string, Promise<ImagenCapturada>>();
  private readonly ahora: () => number;

  constructor(private readonly opciones: OpcionesCache) {
    this.ahora = opciones.ahora ?? Date.now;
  }

  /**
   * `clave` identifica la cámara; `url` es de dónde bajarla. Si la URL de una
   * cámara cambia, la clave debe cambiar con ella (la ruta usa `id:url`).
   */
  async obtener(clave: string, url: string): Promise<ImagenCapturada> {
    const guardada = this.entradas.get(clave);
    if (guardada && guardada.hasta > this.ahora()) {
      if (guardada.imagen) return guardada.imagen;
      if (guardada.error) throw guardada.error;
    }

    const pendiente = this.enVuelo.get(clave);
    if (pendiente) return pendiente;

    const peticion = this.descargar(clave, url).finally(() => this.enVuelo.delete(clave));
    this.enVuelo.set(clave, peticion);
    return peticion;
  }

  private async descargar(clave: string, url: string): Promise<ImagenCapturada> {
    try {
      const imagen = await this.opciones.capturador(url);
      this.guardar(clave, { imagen, hasta: this.ahora() + this.opciones.ttlMs });
      return imagen;
    } catch (err) {
      const error =
        err instanceof ImagenNoDisponibleError
          ? err
          : new ImagenNoDisponibleError(err instanceof Error ? err.message : 'Error desconocido');
      this.guardar(clave, { error, hasta: this.ahora() + this.opciones.ttlErrorMs });
      throw error;
    }
  }

  private guardar(clave: string, entrada: Entrada): void {
    this.entradas.delete(clave); // reinserta al final: el Map conserva orden de inserción
    this.entradas.set(clave, entrada);
    while (this.entradas.size > this.opciones.maxEntradas) {
      const masAntigua = this.entradas.keys().next().value;
      if (masAntigua === undefined) break;
      this.entradas.delete(masAntigua);
    }
  }

  get tamano(): number {
    return this.entradas.size;
  }
}
