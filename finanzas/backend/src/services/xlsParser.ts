/**
 * Parser del XLS del Ministerio de Transportes ("Tabla 1: Valor tasado medio
 * de vivienda libre", €/m², actualización trimestral).
 *
 * DECISIÓN DE DISEÑO IMPORTANTE — por qué NO se usa la heurística de
 * "padding a la derecha = provincia" que parecía razonable a primera vista:
 *
 * Se verificó contra el fichero real (descargado el 2026-09-16) que esa
 * heurística es FALSA. Provincias como Barcelona, Girona, Lleida, Tarragona
 * (Cataluña), Coruña (A)/Lugo/Ourense/Pontevedra (Galicia) o Araba/Alava,
 * Gipuzkoa, Bizkaia (País Vasco) se listan SIN relleno de espacios — igual
 * que las filas de comunidad autónoma — mientras que Andalucía, Aragón,
 * Castilla y León, Castilla-La Mancha o Extremadura sí rellenan sus
 * provincias hasta 18 caracteres. Contando por relleno se obtenían 35 filas
 * "ccaa" y 28 "provincia" (España tiene 52 provincias, no 28).
 *
 * En su lugar se usa un mapa canónico de comunidad autónoma → provincias,
 * con la ortografía EXACTA verificada contra el fichero real. La geografía
 * provincial de España es estática (no cambia entre trimestres), así que un
 * mapa fijo es más fiable que cualquier heurística de formato de un XLS que,
 * como se ve arriba, ni siquiera es consistente consigo mismo.
 *
 * Las 7 comunidades uniprovinciales (Asturias, Balears, Cantabria, Madrid,
 * Murcia, Navarra, Rioja) no tienen una fila de provincia separada: la
 * propia fila de comunidad autónoma representa también a su única
 * provincia. Se importa dos veces (ambito='ccaa' y ambito='provincia', esta
 * última con comunidad_autonoma apuntando a sí misma) para que el
 * desplegable de provincias del frontend las incluya — igual que ocurre con
 * el resto de provincias.
 *
 * Total verificado: 1 nacional + 18 filas de comunidad autónoma (incluye el
 * agrupador "Ceuta y Melilla") + 52 provincias (45 filas propias + 7
 * heredadas de comunidades uniprovinciales) = 71 series distintas por
 * trimestre.
 */

import * as XLSX from 'xlsx';

export type Ambito = 'nacional' | 'ccaa' | 'provincia';

export interface FilaPrecio {
  ambito: Ambito;
  nombre: string;
  comunidad_autonoma: string | null;
  anio: number;
  trimestre: number;
  precio_m2: number | null;
}

const NACIONAL = 'TOTAL NACIONAL';

/** comunidad autónoma (nombre normalizado) → provincias (nombre normalizado). */
const ESTRUCTURA_CANONICA: Record<string, string[]> = {
  'Andalucía': ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'],
  'Aragón': ['Huesca', 'Teruel', 'Zaragoza'],
  // OJO: espacio antes del paréntesis de cierre — así aparece literalmente
  // en el fichero real (verificado 2026-09-16). Sin ese espacio, esta fila
  // no hace match nunca y Asturias desaparece en silencio de cada importación.
  'Asturias (Principado de )': [],
  'Balears (Illes)': [],
  'Canarias': ['Palmas (Las)', 'Santa Cruz de Tenerife'],
  'Cantabria': [],
  'Castilla y León': ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  'Castilla-La Mancha': ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'],
  'Cataluña': ['Barcelona', 'Girona', 'Lleida', 'Tarragona'],
  'Comunidad Valenciana': ['Alicante/Alacant', 'Castellón/Castelló', 'Valencia/València'],
  'Extremadura': ['Badajoz', 'Cáceres'],
  'Galicia': ['Coruña (A)', 'Lugo', 'Ourense', 'Pontevedra'],
  'Madrid (Comunidad de)': [],
  'Murcia (Región de)': [],
  'Navarra (Comunidad Foral de)': [],
  'País Vasco': ['Araba/Alava', 'Gipuzkoa', 'Bizkaia'],
  'Rioja (La)': [],
  'Ceuta y Melilla': ['Ceuta', 'Melilla'],
};

interface Clasificacion {
  ambito: Ambito;
  nombre: string;
  comunidad_autonoma: string | null;
}

/** Normaliza espacios (colapsa múltiples/trailing) para comparar nombres del XLS. */
function normalizarNombre(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// Variantes de nombre que aparecen en ALGUNAS hojas históricas del mismo
// fichero pero no en otras (el propio Ministerio no es consistente consigo
// mismo entre décadas). Verificado contra las 8 hojas del fichero real
// (2026-09-16): de 65 nombres distintos, esta es la ÚNICA inconsistencia —
// la hoja "2015, 2016, 2017, 2018" abrevia Navarra como "(Com. Foral de)"
// mientras las otras 7 hojas usan "(Comunidad Foral de)". El alias resuelve
// a la MISMA fila canónica, así que no crea una serie separada en la BD.
const ALIAS: Record<string, string> = {
  'Navarra (Com. Foral de)': 'Navarra (Comunidad Foral de)',
};

function construirLookup(): Map<string, Clasificacion[]> {
  const lookup = new Map<string, Clasificacion[]>();

  const add = (clave: string, entrada: Clasificacion) => {
    const existentes = lookup.get(clave) ?? [];
    existentes.push(entrada);
    lookup.set(clave, existentes);
  };

  add(NACIONAL, { ambito: 'nacional', nombre: NACIONAL, comunidad_autonoma: null });

  for (const [ccaa, provincias] of Object.entries(ESTRUCTURA_CANONICA)) {
    add(ccaa, { ambito: 'ccaa', nombre: ccaa, comunidad_autonoma: null });

    if (provincias.length === 0) {
      // Comunidad uniprovincial: la misma fila también es su provincia.
      add(ccaa, { ambito: 'provincia', nombre: ccaa, comunidad_autonoma: ccaa });
    } else {
      for (const provincia of provincias) {
        add(provincia, { ambito: 'provincia', nombre: provincia, comunidad_autonoma: ccaa });
      }
    }
  }

  for (const [alias, canonico] of Object.entries(ALIAS)) {
    const clasificaciones = lookup.get(canonico);
    if (clasificaciones) lookup.set(alias, clasificaciones);
  }

  return lookup;
}

const LOOKUP = construirLookup();

/** Busca cuántas filas coinciden con "Año 20XX" para hacer forward-fill. */
const RE_ANIO = /año\s*(\d{4})/i;
const RE_TRIMESTRE = /^[1-4]º$/;

interface ColumnaMeta {
  anio: number;
  trimestre: number;
}

function localizarFilasCabecera(
  filas: unknown[][],
  dataStart: number,
): { anioRow: number; trimestreRow: number } {
  let anioRow = -1;
  let trimestreRow = -1;
  for (let i = dataStart - 1; i >= Math.max(0, dataStart - 6); i--) {
    const fila = filas[i] ?? [];
    if (trimestreRow === -1) {
      const tieneTrimestre = fila.some(
        (c) => typeof c === 'string' && RE_TRIMESTRE.test(normalizarNombre(c)),
      );
      if (tieneTrimestre) trimestreRow = i;
    }
    if (anioRow === -1) {
      const tieneAnio = fila.some((c) => typeof c === 'string' && RE_ANIO.test(c));
      if (tieneAnio) anioRow = i;
    }
  }
  return { anioRow, trimestreRow };
}

function construirColumnas(filas: unknown[][], dataStart: number): Map<number, ColumnaMeta> {
  const { anioRow, trimestreRow } = localizarFilasCabecera(filas, dataStart);
  const columnas = new Map<number, ColumnaMeta>();
  if (anioRow === -1 || trimestreRow === -1) return columnas;

  const filaAnio = filas[anioRow] ?? [];
  const filaTrimestre = filas[trimestreRow] ?? [];
  const numCols = Math.max(filaAnio.length, filaTrimestre.length);

  let anioActual: number | null = null;
  for (let j = 0; j < numCols; j++) {
    const celdaAnio = filaAnio[j];
    if (typeof celdaAnio === 'string') {
      const match = celdaAnio.match(RE_ANIO);
      if (match) anioActual = Number(match[1]);
    }

    const celdaTrimestre = filaTrimestre[j];
    if (anioActual !== null && typeof celdaTrimestre === 'string') {
      const trimestreTexto = normalizarNombre(celdaTrimestre);
      if (RE_TRIMESTRE.test(trimestreTexto)) {
        columnas.set(j, { anio: anioActual, trimestre: Number(trimestreTexto[0]) });
      }
    }
  }

  return columnas;
}

function parsearValor(celda: unknown): number | null {
  if (typeof celda === 'number' && Number.isFinite(celda)) return celda;
  if (typeof celda === 'string') {
    const texto = celda.trim().toLowerCase();
    if (texto === '' || texto === 'n.r' || texto === 'n.r.') return null;
    const num = Number(texto.replace(',', '.'));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function parsearHoja(filas: unknown[][], warnings: string[]): FilaPrecio[] {
  const filasCol1 = filas.map((f) => f?.[1]);
  const dataStart = filasCol1.findIndex(
    (c) => typeof c === 'string' && normalizarNombre(c) === NACIONAL,
  );
  if (dataStart === -1) return [];

  const columnas = construirColumnas(filas, dataStart);
  if (columnas.size === 0) {
    warnings.push('No se pudieron localizar las columnas de año/trimestre en una hoja.');
    return [];
  }

  const resultado: FilaPrecio[] = [];

  for (let i = dataStart; i < filas.length; i++) {
    const rawNombre = filas[i]?.[1];
    if (typeof rawNombre !== 'string' || rawNombre.trim() === '') break; // fin de la sección de datos

    const nombreNormalizado = normalizarNombre(rawNombre);
    const clasificaciones = LOOKUP.get(nombreNormalizado);
    if (!clasificaciones) {
      warnings.push(`Fila no reconocida, se omite: "${nombreNormalizado}"`);
      continue;
    }

    for (const clasificacion of clasificaciones) {
      for (const [col, meta] of columnas) {
        const valor = parsearValor(filas[i][col]);
        resultado.push({
          ambito: clasificacion.ambito,
          nombre: clasificacion.nombre,
          comunidad_autonoma: clasificacion.comunidad_autonoma,
          anio: meta.anio,
          trimestre: meta.trimestre,
          precio_m2: valor,
        });
      }
    }
  }

  return resultado;
}

/**
 * Parsea el workbook completo (las 8 hojas, ~1995-2026) y devuelve todas las
 * filas válidas. `warnings` acumula avisos no fatales (fila no reconocida,
 * hoja sin cabecera localizable) para que el importador los loguee sin
 * abortar la importación completa.
 */
export function parseWorkbook(buffer: Buffer, warnings: string[] = []): FilaPrecio[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', codepage: 1252 });
  const resultado: FilaPrecio[] = [];

  for (const nombreHoja of workbook.SheetNames) {
    const hoja = workbook.Sheets[nombreHoja];
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      raw: true,
      defval: '',
    });
    resultado.push(...parsearHoja(filas, warnings));
  }

  return resultado;
}

export { ESTRUCTURA_CANONICA, NACIONAL };
