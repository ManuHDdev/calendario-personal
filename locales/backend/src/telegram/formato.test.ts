import { describe, it, expect } from 'vitest';
import { formatearVeredicto, AYUDA } from './formato';
import type { Medicion, ResultadoViabilidad, Umbrales, Veredicto } from '../types/locales';

const UMBRALES: Umbrales = {
  comunidad: 'madrid',
  distanciaFarmaciasM: 250,
  distanciaCentrosSanitariosM: 150,
  origen: 'normativa',
  verificado: true,
  fuenteUrl: null,
  notas: null,
};

function medicion(nombre: string, metros: number | null): Medicion {
  return {
    establecimiento: {
      id: 1, nombre, direccion: 'Calle Mayor, 3', municipio: 'Madrid',
      precision: 'exacta', fuente: 'oficial_madrid', lat: 40.4, lng: -3.7,
    },
    metros,
    decisiva: true,
  };
}

function resultado(veredicto: Veredicto, over: Partial<ResultadoViabilidad> = {}): ResultadoViabilidad {
  return {
    veredicto,
    motivo: 'Motivo de prueba.',
    farmaciaMasCercana: null,
    centroMasCercano: null,
    farmacias: [],
    centros: [],
    umbrales: UMBRALES,
    motor: 'ors',
    calculadoEn: new Date('2026-09-07T10:00:00Z'),
    ...over,
  };
}

describe('formatearVeredicto', () => {
  it('cada veredicto lleva su emoji y su titular', () => {
    expect(formatearVeredicto(resultado('verde'))).toContain('🟢');
    expect(formatearVeredicto(resultado('ambar'))).toContain('🟡');
    expect(formatearVeredicto(resultado('rojo'))).toContain('🔴');
    expect(formatearVeredicto(resultado('sin_datos'))).toContain('⚪');
    expect(formatearVeredicto(resultado('rojo'))).toContain('No cumple');
  });

  it('SIEMPRE incluye el aviso de que no certifica', () => {
    // No es decorativo: un verde sin ese aviso invita a decidir sobre un
    // cálculo que no es la medición oficial.
    for (const v of ['verde', 'ambar', 'rojo', 'sin_datos'] as Veredicto[]) {
      expect(formatearVeredicto(resultado(v))).toContain('no una medición oficial');
    }
  });

  it('dice qué umbrales ha aplicado y de qué comunidad', () => {
    const t = formatearVeredicto(resultado('verde'));
    expect(t).toContain('madrid');
    expect(t).toContain('farmacias 250 m');
    expect(t).toContain('centros sanitarios 150 m');
  });

  it('omite el umbral que no se comprueba, sin fingir un cero', () => {
    const t = formatearVeredicto(
      resultado('verde', { umbrales: { ...UMBRALES, distanciaCentrosSanitariosM: null } }),
    );
    expect(t).toContain('farmacias 250 m');
    expect(t).not.toContain('centros sanitarios');
  });

  it('lista las cercanas con sus metros', () => {
    const t = formatearVeredicto(
      resultado('rojo', { farmacias: [medicion('Farmacia A', 120), medicion('Farmacia B', 300)] }),
    );
    expect(t).toContain('1. Farmacia A: 120 m');
    expect(t).toContain('2. Farmacia B: 300 m');
  });

  it('dice "sin ruta peatonal" en vez de inventarse un número', () => {
    const t = formatearVeredicto(resultado('ambar', { farmacias: [medicion('Farmacia C', null)] }));
    expect(t).toContain('sin ruta peatonal');
  });

  it('recorta el listado al máximo pedido', () => {
    const muchas = Array.from({ length: 12 }, (_, i) => medicion(`F${i}`, 100 + i));
    const t = formatearVeredicto(resultado('rojo', { farmacias: muchas }), { maxListado: 3 });
    expect(t).toContain('3. F2');
    expect(t).not.toContain('4. F3');
  });

  it('muestra el punto tal como lo entendió el sistema', () => {
    const t = formatearVeredicto(resultado('verde'), { descripcionPunto: 'Calle Mayor, 12, Madrid' });
    expect(t).toContain('📍 Calle Mayor, 12, Madrid');
  });
});

describe('AYUDA', () => {
  it('explica los tres colores', () => {
    expect(AYUDA).toContain('🟢');
    expect(AYUDA).toContain('🟡');
    expect(AYUDA).toContain('🔴');
  });
  it('deja claro que la distancia es caminando', () => {
    expect(AYUDA).toContain('caminando');
    expect(AYUDA).toContain('no en línea recta');
  });
});
