/**
 * Parser del CSV resumen de Inside Airbnb (`visualisations/listings.csv`),
 * el mismo que alimenta su propio mapa de visualización — no el
 * `data/listings.csv.gz` completo ni `calendar.csv.gz`/`reviews.csv.gz` (ver
 * design.md del change `add-finanzas-airbnb-tracker`: son uno o dos órdenes
 * de magnitud más pesados y no aportan nada que este resumen no traiga ya
 * para precio/ocupación estimada/características básicas).
 *
 * Cabecera real verificada en vivo (Madrid, 2026-06-20):
 * id,name,host_id,host_profile_id,host_name,neighbourhood_group,
 * neighbourhood,latitude,longitude,room_type,price,minimum_nights,
 * number_of_reviews,last_review,reviews_per_month,
 * calculated_host_listings_count,availability_365,number_of_reviews_ltm,
 * license
 *
 * Sin librería de CSV externa: un parser propio, pequeño y con comillas
 * RFC4180 (campos con comas/comillas escapadas dentro de "..." — el propio
 * campo `name` real trae comas, p. ej. "Bright & comfortable, Malasana
 * Madrid"), en línea con el resto del monorepo (sin ORM, sin dependencias
 * nuevas para algo de este tamaño).
 */

export interface FilaListingAirbnb {
  listing_id: string; // TEXT siempre — algunos ids superan Number.MAX_SAFE_INTEGER (19 dígitos vistos en vivo)
  ciudad: string;
  snapshot_date: string; // 'YYYY-MM-DD'
  nombre: string | null;
  barrio_grupo: string | null;
  barrio: string | null;
  latitud: number | null;
  longitud: number | null;
  tipo_habitacion: string | null;
  precio_noche: number | null; // null cuando el origen no trae precio — NUNCA 0
  estancia_minima_noches: number | null;
  num_resenas: number | null;
  resenas_ultimos_12_meses: number | null;
  resenas_por_mes: number | null;
  ultima_resena: string | null; // 'YYYY-MM-DD' o null
  anuncios_del_anfitrion: number | null;
  disponibilidad_365: number | null;
}

const COLUMNAS_ESPERADAS = [
  'id',
  'name',
  'host_id',
  'host_profile_id',
  'host_name',
  'neighbourhood_group',
  'neighbourhood',
  'latitude',
  'longitude',
  'room_type',
  'price',
  'minimum_nights',
  'number_of_reviews',
  'last_review',
  'reviews_per_month',
  'calculated_host_listings_count',
  'availability_365',
  'number_of_reviews_ltm',
  'license',
];

/** Parsea una línea CSV (RFC4180: comillas dobles, comas y saltos de línea escapables). */
function parsearLineaCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (dentroDeComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          dentroDeComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      dentroDeComillas = true;
    } else if (c === ',') {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

/**
 * Un CSV puede traer campos multilínea (un `name` con un salto de línea
 * dentro de comillas) — no basta con `split('\n')` ingenuo. Se acumulan
 * líneas físicas hasta que las comillas queden balanceadas.
 */
function dividirEnFilas(texto: string): string[] {
  const lineasFisicas = texto.split(/\r\n|\n/);
  const filas: string[] = [];
  let acumulada = '';
  let comillasAbiertas = 0;

  for (const linea of lineasFisicas) {
    acumulada = acumulada.length === 0 ? linea : `${acumulada}\n${linea}`;
    comillasAbiertas += (linea.match(/"/g) || []).length;
    if (comillasAbiertas % 2 === 0) {
      filas.push(acumulada);
      acumulada = '';
      comillasAbiertas = 0;
    }
  }
  if (acumulada.length > 0) filas.push(acumulada);
  return filas;
}

function numeroOpcional(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function textoOpcional(valor: string | undefined): string | null {
  if (valor === undefined) return null;
  const limpio = valor.trim();
  return limpio.length === 0 ? null : limpio;
}

/**
 * Parsea el CSV resumen completo de una ciudad/snapshot. Una fila que no
 * traiga `id` se descarta con un aviso (nunca aborta el fichero entero) —
 * mismo principio que `xlsParser.ts`/`importador.ts`: un dato puntual malo
 * no debe tirar toda la importación.
 */
export function parseListingsCsv(
  csvText: string,
  ciudad: string,
  snapshotDate: string,
  warnings: string[] = [],
): FilaListingAirbnb[] {
  const filas = dividirEnFilas(csvText).filter((f) => f.trim().length > 0);
  if (filas.length === 0) return [];

  const cabecera = parsearLineaCsv(filas[0]).map((c) => c.trim());
  const columnasFaltantes = COLUMNAS_ESPERADAS.filter((c) => !cabecera.includes(c));
  if (columnasFaltantes.length > 0) {
    warnings.push(
      `${ciudad}: la cabecera del CSV no trae las columnas esperadas (${columnasFaltantes.join(', ')}) — ¿ha cambiado el formato de Inside Airbnb?`,
    );
  }

  const indice = (nombreColumna: string) => cabecera.indexOf(nombreColumna);
  const idxId = indice('id');
  const idxName = indice('name');
  const idxNeighbourhoodGroup = indice('neighbourhood_group');
  const idxNeighbourhood = indice('neighbourhood');
  const idxLatitude = indice('latitude');
  const idxLongitude = indice('longitude');
  const idxRoomType = indice('room_type');
  const idxPrice = indice('price');
  const idxMinNights = indice('minimum_nights');
  const idxNumReviews = indice('number_of_reviews');
  const idxLastReview = indice('last_review');
  const idxReviewsPerMonth = indice('reviews_per_month');
  const idxHostListingsCount = indice('calculated_host_listings_count');
  const idxAvailability365 = indice('availability_365');
  const idxReviewsLtm = indice('number_of_reviews_ltm');

  const resultado: FilaListingAirbnb[] = [];

  for (let i = 1; i < filas.length; i++) {
    const campos = parsearLineaCsv(filas[i]);
    const id = idxId >= 0 ? campos[idxId]?.trim() : undefined;

    if (!id) {
      warnings.push(`${ciudad}: fila ${i + 1} sin id, se descarta`);
      continue;
    }

    resultado.push({
      listing_id: id,
      ciudad,
      snapshot_date: snapshotDate,
      nombre: textoOpcional(campos[idxName]),
      barrio_grupo: textoOpcional(campos[idxNeighbourhoodGroup]),
      barrio: textoOpcional(campos[idxNeighbourhood]),
      latitud: numeroOpcional(campos[idxLatitude]),
      longitud: numeroOpcional(campos[idxLongitude]),
      tipo_habitacion: textoOpcional(campos[idxRoomType]),
      // El origen deja `price` vacío para bastantes anuncios (frecuente en
      // los gestionados por cadenas hoteleras) — nunca se sustituye por 0,
      // se propaga como null y se excluye de cualquier mediana/media.
      precio_noche: numeroOpcional(campos[idxPrice]),
      estancia_minima_noches: numeroOpcional(campos[idxMinNights]),
      num_resenas: numeroOpcional(campos[idxNumReviews]),
      resenas_ultimos_12_meses: numeroOpcional(campos[idxReviewsLtm]),
      resenas_por_mes: numeroOpcional(campos[idxReviewsPerMonth]),
      ultima_resena: textoOpcional(campos[idxLastReview]),
      anuncios_del_anfitrion: numeroOpcional(campos[idxHostListingsCount]),
      disponibilidad_365: numeroOpcional(campos[idxAvailability365]),
    });
  }

  return resultado;
}
