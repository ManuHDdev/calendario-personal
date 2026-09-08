import { describe, it, expect } from 'vitest';
import { formatearVeredicto, formatearNovedad, AYUDA } from './formato';
import type {
  Anuncio,
  Medicion,
  ResultadoViabilidad,
  Umbrales,
  Veredicto,
} from '../types/locales';
import type { NovedadAnuncio } from '../services/rastreo';

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

function anuncioFila(over: Partial<Anuncio> = {}): Anuncio {
  return {
    id: 1, busqueda_id: 2, tipo: 'local', portal: 'fotocasa', portal_id: 'x1',
    url: 'https://fotocasa.es/x1', titulo: 'Local céntrico', descripcion: null,
    precio: 95000, precio_anterior: null, superficie_m2: 130, facturacion: null, imagen_url: null,
    direccion: null, municipio: 'Badajoz', provincia: 'Badajoz', comunidad: null,
    latitud: 38.8, longitud: -6.9, precision_coordenadas: 'aproximada',
    veredicto: 'verde', veredicto_motivo: 'Cumple incluso en el peor caso.',
    distancia_farmacia_m: 410, farmacia_mas_cercana_id: 5, distancia_centro_m: null,
    centro_mas_cercano_id: null, viabilidad_calculada_en: null, viabilidad_motor: 'ors',
    visto: false, descartado: false, notificado: false,
    created_at: '', updated_at: '',
    ...over,
  };
}
const nov = (a: Partial<Anuncio>, tipo: NovedadAnuncio['tipo'] = 'nuevo'): NovedadAnuncio => ({
  anuncio: anuncioFila(a),
  tipo,
});

describe('formatearNovedad', () => {
  it('un local nuevo verde: cabecera, verdicto, precio, superficie, distancia y aviso', () => {
    const t = formatearNovedad(nov({}), 'Locales Badajoz');
    expect(t).toContain('🟢 *Local nuevo* · Locales Badajoz');
    expect(t).toContain('Cumple incluso en el peor caso.');
    expect(t).toContain('💶 95.000 €');
    expect(t).toContain('📐 130 m²');
    expect(t).toContain('🚶 A 410 m de la farmacia más cercana');
    expect(t).toContain('no una medición oficial');
  });

  it('un ámbar se avisa como "necesita confirmación"', () => {
    const t = formatearNovedad(nov({ veredicto: 'ambar', veredicto_motivo: 'El dato no permite decidir.' }), 'B');
    expect(t).toContain('🟡 *Local nuevo*');
    expect(t).toContain('Necesita confirmación');
  });

  it('una farmacia nueva muestra facturación en vez de superficie', () => {
    const t = formatearNovedad(
      nov({ tipo: 'farmacia', facturacion: 620000, superficie_m2: null }),
      'Farmacias Madrid',
    );
    expect(t).toContain('*Farmacia nueva*');
    expect(t).toContain('💰 Facturación 620.000 €');
    expect(t).not.toContain('m²');
  });

  it('una bajada de precio muestra el precio anterior tachado en texto', () => {
    const t = formatearNovedad(nov({ precio: 80000, precio_anterior: 95000 }, 'bajada'), 'B');
    expect(t).toContain('📉 *Bajada de precio* · B');
    expect(t).toContain('💶 80.000 € (antes 95.000 €)');
  });

  it('el veredicto sin_datos NO forma parte del texto de novedad de una bajada', () => {
    // (sin_datos/rojo no se emiten; el filtro está en notificarNovedades, pero
    // la cabecera de bajada no debe depender del veredicto)
    const t = formatearNovedad(nov({ veredicto: 'sin_datos' }, 'bajada'), 'B');
    expect(t).toContain('📉 *Bajada de precio*');
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
