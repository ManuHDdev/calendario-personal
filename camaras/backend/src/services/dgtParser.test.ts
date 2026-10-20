import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsearFeedDgt, textoDe } from './dgtParser';

const fixture = (nombre: string): string =>
  readFileSync(join(__dirname, '__fixtures__', nombre), 'utf-8');

describe('parsearFeedDgt — formato DATEX II v1', () => {
  const camaras = parsearFeedDgt(fixture('dgt-v1.xml'));

  it('reconoce las cámaras con coordenadas + URL y descarta las que no tienen imagen', () => {
    expect(camaras.map((c) => c.externalId)).toEqual(['CAM-001', 'CAM-002']);
  });

  it('extrae nombre, carretera, coordenadas y URL', () => {
    expect(camaras[0]).toEqual({
      externalId: 'CAM-001',
      nombre: 'A-5 Mérida acceso este',
      carretera: 'A-5',
      latitud: 38.918,
      longitud: -6.33,
      urlImagen: 'https://ejemplo.dgt.test/camaras/001.jpg',
    });
  });
});

describe('parsearFeedDgt — formato DATEX II v3 (prefijos de espacio de nombres)', () => {
  const camaras = parsearFeedDgt(fixture('dgt-v3.xml'));

  it('ignora los prefijos y descarta el id duplicado', () => {
    expect(camaras.map((c) => c.externalId)).toEqual(['BA-0007', 'MD-9001']);
  });

  it('lee el nombre multilingüe y las coordenadas anidadas', () => {
    expect(camaras[0].nombre).toBe('A-5 Badajoz salida oeste');
    expect(camaras[0].carretera).toBe('A-5');
    expect(camaras[0].latitud).toBeCloseTo(38.88, 5);
    expect(camaras[0].longitud).toBeCloseTo(-6.94, 5);
  });

  it('conserva todas las cámaras aunque caigan fuera de las ciudades (el filtrado es del importador)', () => {
    expect(camaras[1].nombre).toBe('Fuera de Extremadura');
  });
});

describe('parsearFeedDgt — robustez', () => {
  it('un XML sin cámaras devuelve lista vacía, no lanza', () => {
    expect(parsearFeedDgt('<a><b>hola</b></a>')).toEqual([]);
  });

  it('rechaza coordenadas fuera de rango', () => {
    const xml = `<r id="X"><latitude>123</latitude><longitude>-6</longitude><urlLinkAddress>https://x.test/a.jpg</urlLinkAddress></r>`;
    expect(parsearFeedDgt(xml)).toEqual([]);
  });

  it('sin id en ningún sitio usa la URL como identificador estable', () => {
    const xml = `<r><latitude>38.9</latitude><longitude>-6.3</longitude><urlLinkAddress>https://x.test/a.jpg</urlLinkAddress></r>`;
    expect(parsearFeedDgt(xml)[0].externalId).toBe('https://x.test/a.jpg');
  });

  it('mantiene los ceros iniciales de un id', () => {
    const xml = `<r><cctvCameraIdentification>007</cctvCameraIdentification><latitude>38.9</latitude><longitude>-6.3</longitude><urlLinkAddress>https://x.test/a.jpg</urlLinkAddress></r>`;
    expect(parsearFeedDgt(xml)[0].externalId).toBe('007');
  });
});

describe('textoDe', () => {
  it('lee cadenas, #text y el patrón multilingüe', () => {
    expect(textoDe('  hola ')).toBe('hola');
    expect(textoDe({ '#text': 'x', '@_lang': 'es' })).toBe('x');
    expect(textoDe({ values: { value: { '#text': 'y' } } })).toBe('y');
    expect(textoDe('')).toBeNull();
    expect(textoDe(undefined)).toBeNull();
  });
});
