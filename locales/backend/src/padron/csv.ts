/**
 * Lector de CSV mínimo, sin dependencias.
 *
 * Los CSV de los portales de datos abiertos españoles suelen venir con punto y
 * coma como separador, comillas dobles alrededor de los campos con comas
 * dentro, y BOM al principio si los ha tocado Excel. Eso es todo lo que hace
 * falta soportar, y añadir una librería para ello no compensa.
 */

/** Detecta el separador por el que produce más columnas en la cabecera. */
export function detectarSeparador(primeraLinea: string): string {
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ';';
  let maxColumnas = 0;
  for (const sep of candidatos) {
    const n = partirLinea(primeraLinea, sep).length;
    if (n > maxColumnas) {
      maxColumnas = n;
      mejor = sep;
    }
  }
  return mejor;
}

/** Parte una línea respetando las comillas dobles y sus escapes (`""`). */
export function partirLinea(linea: string, separador: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

/**
 * Convierte un CSV en filas indexadas por nombre de columna NORMALIZADO
 * (minúsculas, sin acentos, sin espacios), para poder buscar "codigoPostal",
 * "Código Postal" o "CODIGO_POSTAL" con la misma clave.
 */
export function normalizarCabecera(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface CsvParseado {
  cabeceras: string[];
  /** Cabeceras normalizadas, en el mismo orden. */
  claves: string[];
  filas: Array<Record<string, string>>;
}

export function parsearCsv(texto: string): CsvParseado {
  const limpio = texto.replace(/^﻿/, '');
  const lineas = limpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return { cabeceras: [], claves: [], filas: [] };

  const separador = detectarSeparador(lineas[0]);
  const cabeceras = partirLinea(lineas[0], separador);
  const claves = cabeceras.map(normalizarCabecera);

  const filas = lineas.slice(1).map((linea) => {
    const valores = partirLinea(linea, separador);
    const fila: Record<string, string> = {};
    claves.forEach((clave, i) => {
      fila[clave] = valores[i] ?? '';
    });
    return fila;
  });

  return { cabeceras, claves, filas };
}

/**
 * Primer valor no vacío entre varios nombres de columna posibles.
 *
 * Existe porque los portales de datos abiertos renombran columnas entre
 * versiones sin avisar, y un importador que se rompe por eso es un importador
 * que hay que arreglar cada seis meses.
 */
export function campo(fila: Record<string, string>, ...alias: string[]): string | null {
  for (const a of alias) {
    const v = fila[normalizarCabecera(a)];
    if (v !== undefined && v.trim() !== '') return v.trim();
  }
  return null;
}

/**
 * Número decimal tolerante con la coma española.
 *
 * Ojo: solo se trata la coma como separador decimal cuando NO hay punto, para
 * no romper "1.234,56" ni convertir "-3.7035" en algo distinto.
 */
export function numero(valor: string | null): number | null {
  if (valor === null) return null;
  const limpio = valor.includes('.') && valor.includes(',')
    ? valor.replace(/\./g, '').replace(',', '.')
    : valor.replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}
