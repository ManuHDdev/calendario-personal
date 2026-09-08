/**
 * Interpretación de texto libre de un anuncio.
 *
 * Los portales de locales devuelven superficie y precio en campos
 * estructurados casi siempre; los de farmacias, casi nunca — ahí la
 * facturación y la ubicación viven en el título y la descripción que escribe
 * el intermediario. Ese texto hay que interpretarlo, y se hace aquí, en
 * funciones puras y testeadas, en vez de repartido por cada provider.
 *
 * Regla transversal: cuando el texto no permite afirmar un dato, se devuelve
 * `null` ("no lo sé"), nunca un valor por defecto.
 */

/**
 * Decodifica entidades HTML. Fotocasa y sobre todo pisos.com sirven los
 * textos del listado sin decodificar ("San Mart&#xED;n", "1.000 m&#xB2;"),
 * porque los pensaron para pintarse dentro del DOM, no para leerse crudos.
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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Convierte un importe escrito a la española a número. El punto es separador
 * de millares y la coma decimal: "145.000" son ciento cuarenta y cinco mil.
 */
export function parsearPrecio(bruto: string | number | null | undefined): number | null {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  if (!bruto) return null;

  const limpio = bruto.replace(/[^\d.,]/g, '');
  if (!limpio) return null;

  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/\.(?=\d{3}(\D|$))/g, '');

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** Une el separador de millares para que "1.000 m²" no se lea como 1. */
function unirMillares(texto: string): string {
  return normalizarTexto(texto).replace(/(\d)\.(\d{3})(?=\D|$)/g, '$1$2');
}

function primerEntero(texto: string, patron: RegExp): number | null {
  const match = texto.match(patron);
  if (!match) return null;
  const valor = Number.parseInt(match[1], 10);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Superficie de un LOCAL comercial a partir de texto libre.
 *
 * Igual que la de vivienda, pero con la horquilla ampliada a [10, 5000] m²:
 * un local puede ser un quiosco de 12 m² o una nave de 3.000, valores que en
 * una vivienda serían casi siempre un número que significaba otra cosa.
 */
export function extraerSuperficieLocal(texto: string): number | null {
  const t = unirMillares(texto);
  const metros =
    primerEntero(t, /(\d{2,4})\s*(?:m2|m²|mts2|mts|metros(?:\s+cuadrados)?)\b/) ??
    primerEntero(t, /(\d{2,4})\s*m²/) ??
    primerEntero(t, /(\d{2,4})\s*m\b(?!\w)/);
  if (metros === null) return null;
  return metros >= 10 && metros <= 5000 ? metros : null;
}

/**
 * Facturación / cifra de negocio anual de una farmacia en venta.
 *
 * Los intermediarios la escriben de mil formas: "facturación 620.000 €",
 * "factura 620.000", "VF 620.000" (venta a farmacia), "cifra de negocio de
 * 1.200.000". Se busca la etiqueta y se lee el importe que la sigue.
 */
export function extraerFacturacion(texto: string): number | null {
  const t = normalizarTexto(texto);
  const patrones = [
    /(?:facturaci[oó]n|factura(?:\s+anual)?|cifra\s+de\s+negocio|venta\s+libre|\bv\.?\s?f\.?\b|\bvl\b)[^\d]{0,20}(\d[\d.,]*)\s*(?:€|eur|euros|k|mil(?:lones)?|m)?/,
  ];
  for (const patron of patrones) {
    const m = t.match(patron);
    if (!m) continue;
    const importe = parsearPrecio(m[1]);
    if (importe === null) continue;
    // "1,2 millones" / "620 k" — escalas habituales del sector.
    const sufijo = m[0].slice(m[0].indexOf(m[1]) + m[1].length).trim();
    if (/^m(il(lones)?)?\b/.test(sufijo) && importe < 100) return Math.round(importe * 1_000_000);
    if (/^k\b/.test(sufijo) && importe < 100_000) return Math.round(importe * 1000);
    return Math.round(importe);
  }
  return null;
}

/**
 * ¿El local está a pie de calle?
 *
 * `true` con "a pie de calle" / "planta calle" / "planta baja"; `false` con
 * "primera planta", "entreplanta", "sótano", "altillo"; `null` si el texto no
 * lo dice — porque perder el filtro por un dato inventado es peor que no
 * filtrar.
 */
export function esPieDeCalle(texto: string): boolean | null {
  const t = normalizarTexto(texto);
  if (/\ba\s+pie\s+de\s+calle\b/.test(t) || /\bplanta\s+calle\b/.test(t) || /\bplanta\s+baja\b/.test(t)) {
    return true;
  }
  if (/\b(primera|segunda|1|2)\s*ª?\s*planta\b/.test(t) || /\bentreplanta\b/.test(t) || /\bs[oó]tano\b/.test(t) || /\baltillo\b/.test(t) || /\bplanta\s+alta\b/.test(t)) {
    return false;
  }
  return null;
}

/** Convierte un texto de zona a un slug de URL ("Ciudad Real" → "ciudad-real"). */
export function slugificar(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Los 50 municipios capital de provincia. En Fotocasa y pisos.com su nombre a
 * secas designa la PROVINCIA entera; para la ciudad hay que pedir
 * "<nombre> capital". Un pueblo cualquiera no tiene esa ambigüedad.
 */
const CAPITALES_DE_PROVINCIA = new Set([
  'a coruna', 'albacete', 'alicante', 'almeria', 'avila', 'badajoz', 'barcelona',
  'bilbao', 'burgos', 'caceres', 'cadiz', 'castellon de la plana', 'ciudad real',
  'cordoba', 'cuenca', 'donostia', 'san sebastian', 'girona', 'granada', 'guadalajara',
  'huelva', 'huesca', 'jaen', 'las palmas de gran canaria', 'leon', 'lleida', 'logrono',
  'lugo', 'madrid', 'malaga', 'murcia', 'ourense', 'oviedo', 'palencia',
  'palma', 'palma de mallorca', 'pamplona', 'pontevedra', 'salamanca',
  'santa cruz de tenerife', 'santander', 'segovia', 'sevilla', 'soria', 'tarragona',
  'teruel', 'toledo', 'valencia', 'valladolid', 'vitoria', 'vitoria gasteiz',
  'zamora', 'zaragoza',
]);

export function esCapitalDeProvincia(nombre: string): boolean {
  return CAPITALES_DE_PROVINCIA.has(normalizarTexto(nombre).replace(/\s+/g, ' ').trim());
}

/**
 * ¿El anuncio está en el municipio buscado? Se compara PARTE a PARTE
 * (separando por comas y paréntesis) para no aceptar un "…de Cáceres" por
 * contener la palabra.
 */
export function ubicacionCoincide(ubicacionAnuncio: string | null, objetivo: string): boolean {
  const meta = normalizarTexto(objetivo).replace(/\bcapital\b/g, '').replace(/\s+/g, ' ').trim();
  if (!meta) return true;
  if (!ubicacionAnuncio) return false;

  return normalizarTexto(ubicacionAnuncio)
    .replace(/[()]/g, ',')
    .split(',')
    .map((parte) => parte.replace(/\bcapital\b/g, '').replace(/\s+/g, ' ').trim())
    .some((parte) => parte === meta);
}
