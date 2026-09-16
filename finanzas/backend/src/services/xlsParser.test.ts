import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook } from './xlsParser';

/**
 * Construye un workbook sintético en memoria con la MISMA estructura que el
 * XLS real del Ministerio (verificada contra el fichero descargado el
 * 2026-09-16): fila de título, fila "Año XXXX" (con forward-fill implícito —
 * el valor solo aparece en la primera columna del grupo), fila de trimestre
 * (1º/2º/3º/4º), fila "TOTAL NACIONAL" y las filas de comunidad
 * autónoma/provincia debajo, sin fila en blanco final.
 *
 * CI no tiene salida a red, así que el test NO descarga el fichero real —
 * lo reconstruye en memoria con `xlsx`, evitando además depender de un
 * fixture binario versionado en el repo.
 */
function construirWorkbookSintetico(): Buffer {
  const filas: (string | number)[][] = [
    [],
    [],
    ['', 'Tabla 1'],
    ['', 'Valor tasado medio de vivienda libre'],
    ['', 'Años: 2023, 2024'],
    [],
    ['', 'Unidad: euros / m2'],
    ['', '', 'Año 2023', '', '', '', 'Año 2024'],
    ['', '', '(trimestre)'],
    ['', '', '1º', '2º', '3º', '4º', '1º', '2º', '3º', '4º', 'Trimestral', 'Anual'],
    ['', 'TOTAL NACIONAL', 1788.4, 1793.2, 1812.4, 1842.3, 1865.8, 1895.6, 1921, 1972.1, 3.8, 13.9],
    ['', 'Andalucía', 1466.3, 1477.2, 1501.1, 1527.7, 1555.7, 1588.7, 1597.7, 1646.2],
    ['', 'Almería           ', 1156.6, 1176.4, 1194.6, 1205.7, 1218.1, 1240.8, 1241.6, 'n.r'],
    ['', 'Cádiz             ', 1300, 1310, 1320, 1330, 1340, 1350, 1360, 1370],
    ['', 'Córdoba           ', 1000, 1010, 1020, 1030, 1040, 1050, 1060, 1070],
    ['', 'Granada           ', 1100, 1110, 1120, 1130, 1140, 1150, 1160, 1170],
    ['', 'Huelva            ', 1050, 1060, 1070, 1080, 1090, 1100, 1110, 1120],
    ['', 'Jaén              ', 900, 910, 920, 930, 940, 950, 960, 970],
    ['', 'Málaga            ', 1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870],
    ['', 'Sevilla           ', 1400, 1410, 1420, 1430, 1440, 1450, 1460, 1470],
    ['', 'Cataluña', 2000, 2010, 2020, 2030, 2040, 2050, 2060, 2070],
    ['', 'Barcelona', 2200, 2210, 2220, 2230, 2240, 2250, 2260, 2270],
    ['', 'Girona', 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970],
    ['', 'Lleida', 1300, 1310, 1320, 1330, 1340, 1350, 1360, 1370],
    ['', 'Tarragona', 1500, 1510, 1520, 1530, 1540, 1550, 1560, 1570],
    ['', 'Cantabria', 1250, 1260, 1270, 1280, 1290, 1300, 1310, 1320],
    // Espacio antes del paréntesis de cierre — así aparece LITERALMENTE en el
    // fichero real (verificado 2026-09-16). Si el mapa canónico no incluye
    // ese espacio exacto, esta fila no hace match y Asturias desaparece en
    // silencio de cada importación (bug real encontrado y corregido).
    ['', 'Asturias (Principado de )', 1600, 1610, 1620, 1630, 1640, 1650, 1660, 1670],
    // El propio fichero real NO es consistente consigo mismo entre hojas:
    // la hoja "2015-2018" abrevia Navarra así, mientras las otras 7 hojas
    // usan "Navarra (Comunidad Foral de)" — verificado contra las 8 hojas
    // del fichero real el 2026-09-16 (bug real detectado en producción:
    // Navarra desaparecía de esa franja de años en cada importación).
    ['', 'Navarra (Com. Foral de)', 1700, 1710, 1720, 1730, 1740, 1750, 1760, 1770],
  ];

  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '2023, 2024');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xls' });
  return buf as Buffer;
}

describe('xlsParser', () => {
  const filas = parseWorkbook(construirWorkbookSintetico());

  it('clasifica TOTAL NACIONAL como ambito nacional', () => {
    const nacional = filas.filter((f) => f.nombre === 'TOTAL NACIONAL');
    expect(nacional.length).toBeGreaterThan(0);
    expect(nacional.every((f) => f.ambito === 'nacional')).toBe(true);
  });

  it('clasifica Almería como provincia de Andalucía', () => {
    const almeria = filas.filter((f) => f.nombre === 'Almería');
    expect(almeria.length).toBeGreaterThan(0);
    expect(almeria.every((f) => f.ambito === 'provincia' && f.comunidad_autonoma === 'Andalucía')).toBe(
      true,
    );
  });

  it('lee los acentos correctamente (Andalucía, no una versión corrupta)', () => {
    const nombres = new Set(filas.map((f) => f.nombre));
    expect(nombres.has('Andalucía')).toBe(true);
    expect([...nombres].some((n) => n.includes('Andaluc�') || n.includes('AndalucÃ­a'))).toBe(false);
  });

  it('traduce una celda n.r a precio_m2 null', () => {
    const almeria2024T4 = filas.find(
      (f) => f.nombre === 'Almería' && f.anio === 2024 && f.trimestre === 4,
    );
    expect(almeria2024T4).toBeDefined();
    expect(almeria2024T4?.precio_m2).toBeNull();
  });

  it('excluye las columnas de Variación Trimestral/Anual como datos', () => {
    const anios = new Set(filas.map((f) => f.trimestre));
    // Solo deben existir trimestres 1-4, nunca una columna "extra" colada
    // como si fuera un trimestre 5+ por culpa de Variación Trimestral/Anual.
    expect([...anios].every((t) => t >= 1 && t <= 4)).toBe(true);
  });

  it('Cataluña reconoce sus 4 provincias aunque no lleven relleno de espacios', () => {
    for (const provincia of ['Barcelona', 'Girona', 'Lleida', 'Tarragona']) {
      const filaProvincia = filas.find((f) => f.nombre === provincia);
      expect(filaProvincia?.ambito).toBe('provincia');
      expect(filaProvincia?.comunidad_autonoma).toBe('Cataluña');
    }
  });

  it('una comunidad uniprovincial (Cantabria) también aparece como provincia', () => {
    const comoComunidad = filas.find((f) => f.nombre === 'Cantabria' && f.ambito === 'ccaa');
    const comoProvincia = filas.find((f) => f.nombre === 'Cantabria' && f.ambito === 'provincia');
    expect(comoComunidad).toBeDefined();
    expect(comoProvincia).toBeDefined();
    expect(comoProvincia?.comunidad_autonoma).toBe('Cantabria');
  });

  it('reconoce Asturias pese al espacio antes del paréntesis de cierre en el fichero real', () => {
    const comoComunidad = filas.find(
      (f) => f.nombre === 'Asturias (Principado de )' && f.ambito === 'ccaa',
    );
    const comoProvincia = filas.find(
      (f) => f.nombre === 'Asturias (Principado de )' && f.ambito === 'provincia',
    );
    expect(comoComunidad).toBeDefined();
    expect(comoProvincia).toBeDefined();
  });

  it('reconoce Navarra abreviada ("Com. Foral de") y la resuelve al nombre canónico completo', () => {
    const comoAlias = filas.filter((f) => f.nombre === 'Navarra (Com. Foral de)');
    const comoCanonico = filas.filter((f) => f.nombre === 'Navarra (Comunidad Foral de)');
    // El alias nunca debe aparecer como nombre propio en el resultado — se
    // resuelve siempre al nombre canónico, para no crear una serie separada.
    expect(comoAlias.length).toBe(0);
    expect(comoCanonico.some((f) => f.ambito === 'ccaa')).toBe(true);
    expect(comoCanonico.some((f) => f.ambito === 'provincia')).toBe(true);
  });
});
