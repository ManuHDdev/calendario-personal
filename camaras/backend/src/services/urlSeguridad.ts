import { promises as dns } from 'dns';
import { isIP } from 'net';

/**
 * Guarda anti-SSRF para el proxy de imágenes: el backend hace peticiones a URLs
 * que vienen de la base de datos (feed de la DGT o cámaras añadidas a mano), así
 * que antes de salir se exige http(s) y que el host resuelva a una IP pública.
 *
 * Límite conocido y aceptado: se resuelve el DNS aquí y `fetch` lo vuelve a
 * resolver al conectar, así que un DNS malicioso podría contestar distinto la
 * segunda vez (DNS rebinding). Las URLs solo las puede escribir el propietario o
 * el feed oficial de la DGT, no un visitante, por lo que no se ha añadido un
 * agente HTTP con la IP fijada.
 */

export class UrlNoPermitidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlNoPermitidaError';
  }
}

function ipv4Privada(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||                            // 0.0.0.0/8
    a === 10 ||                           // 10.0.0.0/8
    a === 127 ||                          // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) ||           // link-local / metadatos de nube
    (a === 172 && b >= 16 && b <= 31) ||  // 172.16.0.0/12
    (a === 192 && b === 168) ||           // 192.168.0.0/16
    (a === 192 && b === 0 && ip.startsWith('192.0.0.')) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224                              // multicast, reservado, broadcast
  );
}

export function esIpPrivada(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Privada(ip);
  if (version === 6) {
    const normal = ip.toLowerCase();
    const mapeada = normal.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return ipv4Privada(mapeada[1]);
    return (
      normal === '::' ||
      normal === '::1' ||
      normal.startsWith('fc') || normal.startsWith('fd') || // fc00::/7
      /^fe[89ab]/.test(normal)                                // fe80::/10
    );
  }
  return true; // no es una IP válida: ante la duda, bloquear
}

export type Resolutor = (host: string) => Promise<string[]>;

const resolutorPorDefecto: Resolutor = async (host) => {
  const res = await dns.lookup(host, { all: true });
  return res.map((r) => r.address);
};

/** Valida sintaxis, protocolo y destino. Devuelve la URL parseada o lanza `UrlNoPermitidaError`. */
export async function validarUrlPublica(
  texto: string,
  resolver: Resolutor = resolutorPorDefecto,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new UrlNoPermitidaError('URL no válida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlNoPermitidaError('Solo se admiten URLs http o https');
  }
  if (url.username || url.password) {
    throw new UrlNoPermitidaError('No se admiten credenciales en la URL');
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');
  const direcciones = isIP(host) ? [host] : await resolver(host).catch(() => []);
  if (direcciones.length === 0) throw new UrlNoPermitidaError('El host no se puede resolver');
  if (direcciones.some(esIpPrivada)) {
    throw new UrlNoPermitidaError('La URL apunta a una dirección no pública');
  }
  return url;
}

/** Comprobación solo sintáctica (sin DNS), para validar entradas del formulario. */
export function esUrlHttp(texto: string): boolean {
  try {
    const u = new URL(texto);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
