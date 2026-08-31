/**
 * Extracción de características de vivienda a partir de texto libre.
 *
 * Los portales inmobiliarios devuelven metros/habitaciones/baños en campos
 * estructurados, pero Wallapop no: ahí todo vive en el título y la
 * descripción que escribe el vendedor. Como el filtro por metros y
 * habitaciones es justo la razón de ser de esta app, ese texto hay que
 * interpretarlo — y hacerlo aquí, en funciones puras y testeadas, en vez de
 * repartido por cada provider.
 *
 * Regla transversal: cuando el texto no permite afirmar un dato, se devuelve
 * `null` ("no lo sé"), nunca un valor por defecto. Filtrar un piso por un
 * dato inventado es peor que no filtrarlo.
 */

/**
 * Decodifica entidades HTML. Fotocasa y sobre todo pisos.com sirven los
 * textos del listado sin decodificar ("San Mart&#xED;n", "n&#xBA; 1",
 * "1.000 m&#xB2;"), porque los pensaron para pintarse dentro del DOM, no para
 * leerse crudos. Sin esto, los títulos y ubicaciones llegan con basura y el
 * filtro de palabras excluidas nunca casaría "ático" contra "&#xE1;tico".
 */
export function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => codepointSeguro(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codepointSeguro(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ');
}

function codepointSeguro(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

/** Quita acentos y baja a minúsculas para poder buscar patrones sin duplicarlos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Convierte un importe escrito a la española a número.
 *
 * En España el punto es separador de millares y la coma decimal, así que
 * "145.000" son ciento cuarenta y cinco mil, no ciento cuarenta y cinco.
 */
export function parsearPrecio(bruto: string | number | null | undefined): number | null {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  if (!bruto) return null;

  const limpio = bruto.replace(/[^\d.,]/g, '');
  if (!limpio) return null;

  // Si hay coma, es la decimal: los puntos que queden son millares.
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/\.(?=\d{3}(\D|$))/g, '');

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** Primer entero que case con `patron` (que debe capturar el número en el grupo 1). */
function primerEntero(texto: string, patron: RegExp): number | null {
  const match = texto.match(patron);
  if (!match) return null;
  const valor = Number.parseInt(match[1], 10);
  return Number.isFinite(valor) ? valor : null;
}

/** "Piso de 90 m2", "90m²", "90 metros cuadrados" → 90 */
export function extraerMetros(texto: string): number | null {
  // "1.000 m²" son mil metros: se une el separador de millares antes de leer.
  const t = normalizarTexto(texto).replace(/(\d)\.(\d{3})(?=\D|$)/g, '$1$2');
  const metros =
    primerEntero(t, /(\d{2,4})\s*(?:m2|m²|mts2|mts|metros(?:\s+cuadrados)?)\b/) ??
    primerEntero(t, /(\d{2,4})\s*m²/) ??
    primerEntero(t, /(\d{2,4})\s*m\b(?!\w)/);
  if (metros === null) return null;
  // Un piso de 5 m² o de 2.000 m² es casi siempre un número que significaba
  // otra cosa (un precio por m², un año, un solar). Se descarta en lugar de
  // arrastrar un filtro con un dato basura.
  return metros >= 15 && metros <= 1000 ? metros : null;
}

/** "3 habitaciones", "3 hab", "3 hab.", "5 habs.", "3 dormitorios", "3 dorm" → 3 */
export function extraerHabitaciones(texto: string): number | null {
  const t = normalizarTexto(texto);
  const hab = primerEntero(
    t,
    /(\d{1,2})\s*(?:hab(?:s|\.|itacion(?:es)?)?|dormitorio(?:s)?|dorm)(?![a-z])/,
  );
  if (hab === null) return null;
  return hab >= 0 && hab <= 20 ? hab : null;
}

/** "2 baños", "1 bano", "2 aseos" → 2 */
export function extraerBanos(texto: string): number | null {
  const t = normalizarTexto(texto);
  const banos = primerEntero(t, /(\d{1,2})\s*(?:banos?|aseos?)\b/);
  if (banos === null) return null;
  return banos >= 0 && banos <= 10 ? banos : null;
}

/**
 * Ordinales escritos con letra. Los anuncios reales dicen "tercera planta"
 * tanto como "3ª planta", y perder la planta significa perder el filtro de
 * "no quiero un bajo".
 */
const ORDINALES: Record<string, number> = {
  primera: 1, primero: 1,
  segunda: 2, segundo: 2,
  tercera: 3, tercero: 3,
  cuarta: 4, cuarto: 4,
  quinta: 5, quinto: 5,
  sexta: 6, sexto: 6,
  septima: 7, septimo: 7,
  octava: 8, octavo: 8,
  novena: 9, noveno: 9,
  decima: 10, decimo: 10,
};

/** "3ª planta", "planta 2", "tercera planta", "bajo", "ático" → texto o null. */
export function extraerPlanta(texto: string): string | null {
  const t = normalizarTexto(texto);

  const numerada = t.match(/\b(\d{1,2})\s*(?:ª|a|º|o)?\s*planta\b/) ?? t.match(/\bplanta\s*(\d{1,2})\b/);
  if (numerada) return `${numerada[1]}ª`;

  const conLetra = t.match(new RegExp(`\\b(${Object.keys(ORDINALES).join('|')})\\s+planta\\b`));
  if (conLetra) return `${ORDINALES[conLetra[1]]}ª`;

  if (/\batico\b/.test(t)) return 'Ático';
  if (/\bbajo\b/.test(t)) return 'Bajo';
  if (/\bentreplanta\b/.test(t)) return 'Entreplanta';
  if (/\bsotano\b/.test(t)) return 'Sótano';
  return null;
}

/**
 * Busca una característica teniendo en cuenta la negación explícita.
 *
 * Devuelve `false` solo si el texto dice que NO la tiene ("sin ascensor").
 * Que no se mencione devuelve `null`, no `false`: casi ningún anuncio lista
 * lo que le falta, así que tratar el silencio como un "no" descartaría la
 * mayoría de los pisos válidos.
 */
function caracteristica(texto: string, palabras: string[]): boolean | null {
  const t = normalizarTexto(texto);
  const alternativas = palabras.join('|');

  if (new RegExp(`\\b(?:sin|no\\s+tiene|no\\s+dispone\\s+de)\\s+(?:\\w+\\s+){0,2}?(?:${alternativas})\\b`).test(t)) {
    return false;
  }
  if (new RegExp(`\\b(?:${alternativas})\\b`).test(t)) return true;
  return null;
}

export function tieneAscensor(texto: string): boolean | null {
  return caracteristica(texto, ['ascensor', 'elevador']);
}

export function tieneGaraje(texto: string): boolean | null {
  return caracteristica(texto, ['garaje', 'garage', 'parking', 'aparcamiento', 'cochera']);
}

export function tieneTerraza(texto: string): boolean | null {
  return caracteristica(texto, ['terraza', 'terrazas']);
}

/** Convierte un texto de zona a un slug de URL ("Ciudad Real" → "ciudad-real"). */
export function slugificar(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
