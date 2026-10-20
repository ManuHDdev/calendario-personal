/**
 * Convierte la respuesta de Overpass (nodos `highway=traffic_signals` + las
 * calles que pasan por ellos) en cruces con sus accesos ya derivados.
 *
 * Un nodo de OSM es un CRUCE, no un semaforo: cada sentido de llegada tiene el
 * suyo. OSM casi nunca etiqueta en que sentido afecta cada uno, pero la
 * geometria de las calles si lo dice: por cada calle que toca el nodo, un
 * vehiculo llega desde el nodo vecino anterior y, si la calle es de doble
 * sentido, tambien desde el posterior. El rumbo de marcha es el azimut
 * vecino -> nodo. Asi no hay que dar de alta los accesos a mano.
 *
 * Toda la logica que depende de la FORMA de la respuesta de Overpass esta en
 * este fichero y se prueba contra un fixture (osm.test.ts); lo que ningun test
 * puede asegurar es que Overpass siga devolviendo esa forma.
 */

export interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  /** Coordenadas de cada nodo de `nodes`, en el mismo orden (`out geom`). */
  geometry: Array<{ lat: number; lon: number } | null>;
  tags?: Record<string, string>;
}

export type OsmElement = OsmNode | OsmWay | { type: 'relation' };

export interface AccesoImportado {
  nombre: string;
  rumbo_grados: number;
}

export interface CruceImportado {
  osm_id: number;
  nombre: string;
  lat: number;
  lng: number;
  accesos: AccesoImportado[];
}

/** Dos llegadas con rumbos mas cercanos que esto son el mismo acceso. */
export const UMBRAL_MISMO_ACCESO_GRADOS = 25;

const ONEWAY_ADELANTE = new Set(['yes', 'true', '1']);
const ONEWAY_ATRAS = new Set(['-1', 'reverse']);
const CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

const rad = (g: number): number => (g * Math.PI) / 180;

/** Azimut inicial de a -> b, en grados [0, 360), 0 = norte. */
export function rumbo(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function cardinal(grados: number): string {
  return CARDINALES[Math.round((((grados % 360) + 360) % 360) / 45) % 8];
}

/** Distancia angular mas corta entre dos rumbos, en [0, 180]. */
export function difAngular(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface Llegada {
  rumbo: number;
  calle: string | null;
}

function llegadasPorCalle(nodo: OsmNode, way: OsmWay): Llegada[] {
  const tags = way.tags ?? {};
  const calle = tags.name ?? tags.ref ?? null;
  const solo = ONEWAY_ADELANTE.has(tags.oneway ?? '') || tags.junction === 'roundabout' || tags.junction === 'circular';
  const atras = ONEWAY_ATRAS.has(tags.oneway ?? '');

  const out: Llegada[] = [];
  way.nodes.forEach((id, i) => {
    if (id !== nodo.id) return;
    const previo = way.geometry[i - 1];
    const siguiente = way.geometry[i + 1];
    // Se circula en el orden de la calle: se llega desde el nodo anterior.
    if (previo && !atras) out.push({ rumbo: rumbo(previo, nodo), calle });
    // Y en doble sentido (o contrasentido declarado) desde el siguiente.
    if (siguiente && !solo) out.push({ rumbo: rumbo(siguiente, nodo), calle });
  });
  return out;
}

/** Agrupa llegadas de rumbo parecido (una calle partida en el nodo da dos). */
function agrupar(llegadas: Llegada[]): Llegada[] {
  const grupos: Llegada[] = [];
  for (const l of [...llegadas].sort((a, b) => a.rumbo - b.rumbo)) {
    const existente = grupos.find((g) => difAngular(g.rumbo, l.rumbo) <= UMBRAL_MISMO_ACCESO_GRADOS);
    if (!existente) {
      grupos.push({ ...l });
    } else if (!existente.calle && l.calle) {
      existente.calle = l.calle;
    }
  }
  return grupos;
}

export function derivarCruces(elementos: OsmElement[]): CruceImportado[] {
  const nodos = elementos.filter((e): e is OsmNode => e.type === 'node');
  const calles = elementos.filter((e): e is OsmWay => e.type === 'way');

  return nodos.map((nodo) => {
    const tocan = calles.filter((w) => w.nodes.includes(nodo.id));
    const grupos = agrupar(tocan.flatMap((w) => llegadasPorCalle(nodo, w)));

    const accesos: AccesoImportado[] = grupos.map((g) => ({
      nombre: `${g.calle ?? 'Calle sin nombre'} · hacia el ${cardinal(g.rumbo)}`,
      rumbo_grados: Math.round(g.rumbo) % 360,
    }));

    const nombresCalles = [...new Set(grupos.map((g) => g.calle).filter((c): c is string => !!c))];
    const nombre =
      nodo.tags?.name ?? (nombresCalles.length ? nombresCalles.slice(0, 3).join(' / ') : 'Cruce sin nombre');

    return { osm_id: nodo.id, nombre, lat: nodo.lat, lng: nodo.lon, accesos };
  });
}

/**
 * El nombre de la ciudad acaba dentro de una consulta Overpass, asi que solo
 * se admiten caracteres de nombre propio: nada que pueda cerrar la cadena.
 */
export const NOMBRE_CIUDAD_RE = /^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .'\-]{1,59}$/u;

export function construirConsultaOverpass(ciudad: string): string {
  if (!NOMBRE_CIUDAD_RE.test(ciudad)) throw new Error('Nombre de ciudad no valido');
  // admin_level 8 = municipio. Sin ese filtro "Caceres" casaria tambien con la
  // provincia (nivel 6) y se importarian los semaforos de toda la provincia.
  return `[out:json][timeout:90];
area["boundary"="administrative"]["admin_level"="8"]["name"="${ciudad}"]->.a;
node(area.a)["highway"="traffic_signals"]->.s;
.s out body;
way(bn.s)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
out body geom;`;
}
