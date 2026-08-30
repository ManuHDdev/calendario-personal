/**
 * Extracción de datos estructurados desde el HTML de un portal.
 *
 * Los dos portales inmobiliarios de esta app renderizan sus resultados en el
 * servidor y dejan el listado ya estructurado dentro de la propia página: o
 * en un `<script type="application/ld+json">` (schema.org), o en el estado
 * que hidrata la SPA (`__NEXT_DATA__`, `__INITIAL_STATE__`…).
 *
 * Leer ESE JSON en lugar de raspar clases CSS es deliberado: los nombres de
 * clase de un portal cambian con cada despliegue de su front, mientras que el
 * JSON-LD está ahí para que lo lea Google y es de lo más estable que publican.
 * Por eso el orden de intento es siempre: JSON-LD → estado embebido → HTML.
 */

/** Devuelve el contenido de todos los `<script>` que casen con el atributo dado. */
function bloquesScript(html: string, patronApertura: RegExp): string[] {
  const bloques: string[] = [];
  const regex = new RegExp(
    `${patronApertura.source}([\\s\\S]*?)<\\/script>`,
    patronApertura.flags.includes('i') ? 'gi' : 'g',
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    bloques.push(match[1]);
  }
  return bloques;
}

function parsearJsonSeguro(bruto: string): unknown | null {
  try {
    return JSON.parse(bruto.trim());
  } catch {
    return null;
  }
}

/**
 * Todos los objetos JSON-LD de la página, aplanando los `@graph` y los
 * arrays de nivel superior para que quien llame solo tenga que filtrar por
 * `@type`.
 */
export function extraerJsonLd(html: string): Record<string, unknown>[] {
  const encontrados: Record<string, unknown>[] = [];

  for (const bloque of bloquesScript(html, /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i)) {
    const datos = parsearJsonSeguro(bloque);
    if (datos === null) continue;
    aplanarJsonLd(datos, encontrados);
  }
  return encontrados;
}

function aplanarJsonLd(nodo: unknown, salida: Record<string, unknown>[]): void {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) aplanarJsonLd(hijo, salida);
    return;
  }
  if (nodo === null || typeof nodo !== 'object') return;

  const objeto = nodo as Record<string, unknown>;
  salida.push(objeto);

  if ('@graph' in objeto) aplanarJsonLd(objeto['@graph'], salida);
  // Un ItemList de resultados lleva los anuncios en itemListElement, a menudo
  // envueltos en un ListItem con la ficha real dentro de `item`.
  if ('itemListElement' in objeto) aplanarJsonLd(objeto.itemListElement, salida);
  if ('item' in objeto) aplanarJsonLd(objeto.item, salida);
}

/** Objetos JSON-LD cuyo `@type` case (sin distinguir mayúsculas) con alguno de los dados. */
export function filtrarPorTipo(
  objetos: Record<string, unknown>[],
  tipos: string[],
): Record<string, unknown>[] {
  const buscados = tipos.map((t) => t.toLowerCase());
  return objetos.filter((o) => {
    const tipo = o['@type'];
    const lista = Array.isArray(tipo) ? tipo : [tipo];
    return lista.some((t) => typeof t === 'string' && buscados.includes(t.toLowerCase()));
  });
}

/**
 * Estado que la SPA del portal deja embebido para hidratarse.
 *
 * Se prueban los nombres habituales en este orden; el primero que parsee
 * gana. Si un portal cambia el nombre de su variable, basta con añadirlo a
 * esta lista — es el único sitio donde vive ese conocimiento.
 */
const CLAVES_ESTADO = [
  '__NEXT_DATA__',
  '__NUXT__',
  '__INITIAL_STATE__',
  '__INITIAL_PROPS__',
  '__PRELOADED_STATE__',
];

export function extraerEstadoEmbebido(html: string): unknown | null {
  for (const bloque of bloquesScript(html, /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>/i)) {
    const datos = parsearJsonSeguro(bloque);
    if (datos !== null) return datos;
  }

  for (const clave of CLAVES_ESTADO) {
    const regex = new RegExp(`(?:window\\.)?${clave}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*[;<]`);
    const match = html.match(regex);
    if (!match) continue;
    const datos = parsearJsonSeguro(match[1]);
    if (datos !== null) return datos;
  }
  return null;
}

/**
 * Recorre un objeto arbitrario y devuelve todos los nodos que parezcan un
 * anuncio, según el predicado dado.
 *
 * Sirve para no acoplarse a la ruta exacta dentro del estado embebido (que
 * cambia sin avisar) sino a la FORMA de un anuncio (que es mucho más
 * estable: siempre lleva id, precio y algo de superficie).
 */
export function buscarNodos(
  raiz: unknown,
  esCandidato: (nodo: Record<string, unknown>) => boolean,
  profundidadMaxima = 12,
): Record<string, unknown>[] {
  const encontrados: Record<string, unknown>[] = [];
  const visitados = new Set<unknown>();

  const visitar = (nodo: unknown, profundidad: number): void => {
    if (profundidad > profundidadMaxima || nodo === null || typeof nodo !== 'object') return;
    if (visitados.has(nodo)) return;
    visitados.add(nodo);

    if (Array.isArray(nodo)) {
      for (const hijo of nodo) visitar(hijo, profundidad + 1);
      return;
    }

    const objeto = nodo as Record<string, unknown>;
    if (esCandidato(objeto)) {
      encontrados.push(objeto);
      // No se desciende dentro de un anuncio ya reconocido: sus subobjetos
      // (media, vendedor…) no son anuncios y solo generarían falsos positivos.
      return;
    }
    for (const valor of Object.values(objeto)) visitar(valor, profundidad + 1);
  };

  visitar(raiz, 0);
  return encontrados;
}

/** Lee una propiedad anidada tolerando cualquier tramo ausente. */
export function leerRuta(objeto: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((actual, tramo) => {
    if (actual === null || typeof actual !== 'object') return undefined;
    return (actual as Record<string, unknown>)[tramo];
  }, objeto);
}

/** Primer valor no vacío de entre varias rutas candidatas. */
export function primerValor(objeto: unknown, rutas: string[]): unknown {
  for (const ruta of rutas) {
    const valor = leerRuta(objeto, ruta);
    if (valor !== undefined && valor !== null && valor !== '') return valor;
  }
  return undefined;
}

export function comoTexto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim()) return valor.trim();
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return null;
}

export function comoEntero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor) : null;
  if (typeof valor === 'string') {
    const n = Number.parseInt(valor.replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function comoBooleano(valor: unknown): boolean | null {
  if (typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') return valor > 0;
  if (typeof valor === 'string') {
    const t = valor.trim().toLowerCase();
    if (['true', 'si', 'sí', '1', 'yes'].includes(t)) return true;
    if (['false', 'no', '0'].includes(t)) return false;
  }
  return null;
}
