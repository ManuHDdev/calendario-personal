/**
 * Parser del feed de cámaras de la DGT (DATEX II).
 *
 * IMPORTANTE — este parser se escribió SIN poder descargar el feed real (el
 * entorno de desarrollo no llega a nap.dgt.es). Por eso NO se apoya en una
 * ruta exacta del XML, que es justo lo que cambia entre versiones de DATEX II
 * (v1 `CCTVSiteTablePublication`, v3.6, v3.7): busca los registros por su
 * FORMA — un nodo que contiene coordenadas (latitude + longitude) y una URL de
 * imagen — igual que `pisos` busca anuncios en el estado embebido de un portal.
 * El nodo más profundo que cumple la forma es la cámara; el nombre y el id se
 * toman de él y, si no los tiene, de su padre.
 *
 * Los tests corren contra fixtures sintéticos, no contra el feed real; para eso
 * está `npm run smoke`, que descarga el feed de verdad y enseña la cobertura
 * por campo (cámaras reconocidas, con nombre, con carretera, por ciudad).
 */

import { XMLParser } from 'fast-xml-parser';

export interface CamaraDgt {
  externalId: string;
  nombre: string;
  carretera: string | null;
  latitud: number;
  longitud: number;
  urlImagen: string;
}

type Nodo = Record<string, unknown>;

const esObjeto = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v);

// Prioridad de claves (en minúsculas) de las que sacar el nombre legible.
const CLAVES_NOMBRE = [
  'cctvcamerasitelocaldescription',
  'cameradescription',
  'cameraname',
  'description',
  'name',
  'cctvcameraidentification',
  'cameraidentification',
  'cameraid',
];
const CLAVES_CARRETERA = ['roadnumber', 'roadname', 'road'];
const CLAVES_ID = ['cctvcameraidentification', 'cameraidentification', 'cameraid', 'id', 'identifier'];

const EXTENSION_IMAGEN = /\.(jpe?g|png|gif|webp)(\?|$)/i;

/**
 * Texto de un valor del XML: cadena, número, `{ '#text': ... }` o el patrón
 * multilingüe de DATEX II v3 (`<values><value lang="es">…</value></values>`).
 */
export function textoDe(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' || typeof valor === 'number') {
    const t = String(valor).trim();
    return t === '' ? null : t;
  }
  if (Array.isArray(valor)) {
    for (const v of valor) {
      const t = textoDe(v);
      if (t) return t;
    }
    return null;
  }
  if (esObjeto(valor)) {
    if ('#text' in valor) return textoDe(valor['#text']);
    if ('values' in valor) return textoDe(valor.values);
    if ('value' in valor) return textoDe(valor.value);
  }
  return null;
}

interface Hallazgos {
  latitudes: number[];
  longitudes: number[];
  urls: string[];
  /** clave en minúsculas → primer texto encontrado */
  texto: Map<string, string>;
}

function recolectar(nodo: unknown, h: Hallazgos): void {
  if (Array.isArray(nodo)) {
    for (const n of nodo) recolectar(n, h);
    return;
  }
  if (!esObjeto(nodo)) return;
  for (const [clave, valor] of Object.entries(nodo)) {
    if (clave.startsWith('@_')) continue;
    const k = clave.toLowerCase();
    const t = textoDe(valor);
    if (t !== null) {
      if (k === 'latitude' || k === 'lat') {
        const n = Number(t);
        if (Number.isFinite(n)) h.latitudes.push(n);
      } else if (k === 'longitude' || k === 'lng' || k === 'lon') {
        const n = Number(t);
        if (Number.isFinite(n)) h.longitudes.push(n);
      } else if (/^https?:\/\//i.test(t) && (k.includes('url') || k.includes('image') || EXTENSION_IMAGEN.test(t))) {
        h.urls.push(t);
      }
      if (!h.texto.has(k)) h.texto.set(k, t);
    }
    recolectar(valor, h);
  }
}

function hallazgos(nodo: unknown): Hallazgos {
  const h: Hallazgos = { latitudes: [], longitudes: [], urls: [], texto: new Map() };
  recolectar(nodo, h);
  return h;
}

function primero(h: Hallazgos, claves: string[]): string | null {
  for (const c of claves) {
    const v = h.texto.get(c);
    if (v) return v;
  }
  return null;
}

/** Elige la URL más probable de ser una imagen fija: la que tiene extensión de imagen, si no la primera. */
function elegirUrlImagen(urls: string[]): string | null {
  return urls.find((u) => EXTENSION_IMAGEN.test(u)) ?? urls[0] ?? null;
}

function idDeAtributo(nodo: Nodo): string | null {
  const id = nodo['@_id'];
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
}

function camaraDe(nodo: Nodo, padre: Nodo | null): CamaraDgt | null {
  const h = hallazgos(nodo);
  if (h.latitudes.length === 0 || h.longitudes.length === 0) return null;
  const urlImagen = elegirUrlImagen(h.urls);
  if (!urlImagen) return null;

  const latitud = h.latitudes[0];
  const longitud = h.longitudes[0];
  if (Math.abs(latitud) > 90 || Math.abs(longitud) > 180) return null;

  // Nombre/id/carretera: del propio nodo; si no los tiene, del padre (en v3 el
  // registro con el nombre suele envolver al nodo que lleva coordenadas + URL).
  const hp = padre ? hallazgos(padre) : null;
  const nombre =
    primero(h, CLAVES_NOMBRE) ?? (hp ? primero(hp, CLAVES_NOMBRE) : null);
  const carretera =
    primero(h, CLAVES_CARRETERA) ?? (hp ? primero(hp, CLAVES_CARRETERA) : null);
  const externalId =
    idDeAtributo(nodo) ??
    (padre ? idDeAtributo(padre) : null) ??
    primero(h, CLAVES_ID) ??
    // Sin id en ningún sitio, la URL de la imagen es estable entre importaciones.
    urlImagen;

  return {
    externalId,
    nombre: nombre ?? (carretera ? `Cámara ${carretera}` : `Cámara ${externalId}`),
    carretera,
    latitud,
    longitud,
    urlImagen,
  };
}

function recorrer(nodo: unknown, padre: Nodo | null, salida: CamaraDgt[]): void {
  if (Array.isArray(nodo)) {
    for (const n of nodo) recorrer(n, padre, salida);
    return;
  }
  if (!esObjeto(nodo)) return;

  const antes = salida.length;
  for (const [clave, valor] of Object.entries(nodo)) {
    if (clave.startsWith('@_')) continue;
    recorrer(valor, nodo, salida);
  }
  // Un descendiente ya fue la cámara: este nodo es solo un envoltorio.
  if (salida.length > antes) return;

  const camara = camaraDe(nodo, padre);
  if (camara) salida.push(camara);
}

/**
 * Cámaras reconocidas en un XML DATEX II de la DGT, sin duplicados por
 * `externalId` (gana la primera aparición).
 */
export function parsearFeedDgt(xml: string): CamaraDgt[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false, // ids como "001" no deben perder el cero inicial
    parseAttributeValue: false,
    trimValues: true,
    textNodeName: '#text',
  });
  const arbol: unknown = parser.parse(xml);
  const salida: CamaraDgt[] = [];
  recorrer(arbol, null, salida);

  const vistas = new Set<string>();
  return salida.filter((c) => {
    if (vistas.has(c.externalId)) return false;
    vistas.add(c.externalId);
    return true;
  });
}
