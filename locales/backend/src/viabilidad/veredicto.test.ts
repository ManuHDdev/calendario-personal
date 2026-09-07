import { describe, it, expect } from 'vitest';
import { calcularVeredicto, MARGEN_POR_PRECISION, type EntradaVeredicto } from './veredicto';
import type { Establecimiento, Medicion, PrecisionCoordenadas, Umbrales } from '../types/locales';

const UMBRALES: Umbrales = {
  comunidad: 'madrid',
  distanciaFarmaciasM: 250,
  distanciaCentrosSanitariosM: 150,
  origen: 'normativa',
  verificado: true,
  fuenteUrl: null,
  notas: null,
};

function establecimiento(
  precision: PrecisionCoordenadas = 'exacta',
  nombre = 'Farmacia Central',
): Establecimiento {
  return {
    id: 1,
    nombre,
    direccion: null,
    municipio: 'Madrid',
    precision,
    fuente: 'oficial_madrid',
    lat: 40.4169,
    lng: -3.7035,
  };
}

function medicion(
  metros: number | null,
  precision: PrecisionCoordenadas = 'exacta',
  decisiva = true,
): Medicion {
  return { establecimiento: establecimiento(precision), metros, decisiva };
}

/** Entrada base: solo farmacias, todo exacto, padrón sano. */
function entrada(over: Partial<EntradaVeredicto> = {}): EntradaVeredicto {
  return {
    precisionPunto: 'exacta',
    farmacias: { umbralM: 250, mediciones: [] },
    centros: { umbralM: null, mediciones: [] },
    umbrales: UMBRALES,
    coberturaSuficiente: true,
    ...over,
  };
}

describe('calcularVeredicto — fronteras exactas con coordenadas exactas', () => {
  // Con precisión exacta en ambos extremos el margen es 0, así que la
  // frontera es el umbral estricto.
  it('verde justo por encima del umbral', () => {
    const r = calcularVeredicto(entrada({ farmacias: { umbralM: 250, mediciones: [medicion(251)] } }));
    expect(r.veredicto).toBe('verde');
  });

  it('rojo justo por debajo del umbral', () => {
    const r = calcularVeredicto(entrada({ farmacias: { umbralM: 250, mediciones: [medicion(249)] } }));
    expect(r.veredicto).toBe('rojo');
  });

  it('ámbar exactamente en el umbral: ni cumple ni incumple de forma demostrable', () => {
    const r = calcularVeredicto(entrada({ farmacias: { umbralM: 250, mediciones: [medicion(250)] } }));
    expect(r.veredicto).toBe('ambar');
  });
});

describe('calcularVeredicto — la banda de incertidumbre', () => {
  it('una coordenada aproximada convierte en ámbar lo que sería verde', () => {
    // 300 m con margen de 150 → 300-150 = 150, que no supera 250.
    const r = calcularVeredicto(
      entrada({
        precisionPunto: 'aproximada',
        farmacias: { umbralM: 250, mediciones: [medicion(300)] },
      }),
    );
    expect(r.veredicto).toBe('ambar');
    expect(r.motivo).toContain('±150 m');
  });

  it('con distancia suficiente, una coordenada aproximada sigue dando verde', () => {
    // 500 - 150 = 350 > 250.
    const r = calcularVeredicto(
      entrada({
        precisionPunto: 'aproximada',
        farmacias: { umbralM: 250, mediciones: [medicion(500)] },
      }),
    );
    expect(r.veredicto).toBe('verde');
  });

  it('los márgenes del punto y del establecimiento se suman', () => {
    // 550 m; margen 150 (punto) + 150 (farmacia) = 300 → 550-300 = 250, no > 250.
    const r = calcularVeredicto(
      entrada({
        precisionPunto: 'aproximada',
        farmacias: { umbralM: 250, mediciones: [medicion(550, 'aproximada')] },
      }),
    );
    expect(r.veredicto).toBe('ambar');
    expect(r.motivo).toContain('±300 m');
  });

  it('una coordenada desconocida exige mucha más holgura para el verde', () => {
    const holgado = calcularVeredicto(
      entrada({
        precisionPunto: 'desconocida',
        farmacias: { umbralM: 250, mediciones: [medicion(600)] },
      }),
    );
    expect(holgado.veredicto).toBe('verde');

    const justo = calcularVeredicto(
      entrada({
        precisionPunto: 'desconocida',
        farmacias: { umbralM: 250, mediciones: [medicion(500)] },
      }),
    );
    expect(justo.veredicto).toBe('ambar');
  });

  it('el rojo también exige demostración: cerca pero con margen amplio es ámbar', () => {
    // 200 m con margen 300 → 200+300 = 500, no < 250. No se puede afirmar que incumple.
    const r = calcularVeredicto(
      entrada({
        precisionPunto: 'desconocida',
        farmacias: { umbralM: 250, mediciones: [medicion(200)] },
      }),
    );
    expect(r.veredicto).toBe('ambar');
  });

  it('los márgenes declarados son los acordados', () => {
    expect(MARGEN_POR_PRECISION).toEqual({ exacta: 0, aproximada: 150, desconocida: 300 });
  });
});

describe('calcularVeredicto — ausencia de candidatas', () => {
  it('sin candidatas el prefiltro ya demuestra el cumplimiento', () => {
    const r = calcularVeredicto(entrada({ farmacias: { umbralM: 250, mediciones: [] } }));
    expect(r.veredicto).toBe('verde');
    expect(r.motivo).toContain('Ninguna farmacia');
    expect(r.farmaciaMasCercana).toBeNull();
  });

  it('candidatas sin ruta peatonal es sin_datos, no verde', () => {
    const r = calcularVeredicto(
      entrada({ farmacias: { umbralM: 250, mediciones: [medicion(null), medicion(null)] } }),
    );
    expect(r.veredicto).toBe('sin_datos');
    expect(r.motivo).toContain('no encontró camino peatonal');
  });

  it('una candidata DECISIVA sin rutar impide el verde aunque la medida cumpla', () => {
    // La sin rutar podría estar más cerca; afirmar cumplimiento sería el
    // falso verde que toda esta app intenta evitar.
    const r = calcularVeredicto(
      entrada({ farmacias: { umbralM: 250, mediciones: [medicion(800), medicion(null)] } }),
    );
    expect(r.veredicto).toBe('ambar');
    expect(r.motivo).toContain('1 sin rutar');
  });

  it('una candidata NO decisiva sin rutar no degrada nada', () => {
    // Está fuera del radio decisivo: no puede incumplir, así que no medirla
    // no oculta ningún riesgo y el verde se mantiene.
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(800), medicion(null, 'exacta', false)] },
      }),
    );
    expect(r.veredicto).toBe('verde');
    expect(r.motivo).not.toContain('sin rutar');
  });

  it('una candidata sin rutar no rescata un rojo', () => {
    const r = calcularVeredicto(
      entrada({ farmacias: { umbralM: 250, mediciones: [medicion(100), medicion(null)] } }),
    );
    expect(r.veredicto).toBe('rojo');
  });

  it('elige la más cercana de las medidas, no la primera', () => {
    const r = calcularVeredicto(
      entrada({ farmacias: { umbralM: 250, mediciones: [medicion(900), medicion(120)] } }),
    );
    expect(r.veredicto).toBe('rojo');
    expect(r.farmaciaMasCercana?.metros).toBe(120);
  });
});

describe('calcularVeredicto — umbral nulo', () => {
  it('un umbral nulo no comprueba nada y no penaliza', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(900)] },
        centros: { umbralM: null, mediciones: [medicion(10)] },
      }),
    );
    // El centro a 10 m sería un rojo clarísimo si se comprobase; como la
    // comunidad no regula esa distancia, no existe.
    expect(r.veredicto).toBe('verde');
    expect(r.centroMasCercano).toBeNull();
  });
});

describe('calcularVeredicto — combinación de las dos comprobaciones', () => {
  it('manda la peor: farmacia verde + centro rojo = rojo', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(900)] },
        centros: { umbralM: 150, mediciones: [medicion(50)] },
      }),
    );
    expect(r.veredicto).toBe('rojo');
  });

  it('farmacia verde + centro ámbar = ámbar', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(900)] },
        centros: { umbralM: 150, mediciones: [medicion(150)] },
      }),
    );
    expect(r.veredicto).toBe('ambar');
  });

  it('las dos verdes = verde, y el motivo cita las dos', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(900)] },
        centros: { umbralM: 150, mediciones: [medicion(400)] },
      }),
    );
    expect(r.veredicto).toBe('verde');
    expect(r.motivo).toContain('farmacia');
    expect(r.motivo).toContain('centro sanitario');
  });
});

describe('calcularVeredicto — cobertura del padrón', () => {
  it('un padrón incompleto degrada el verde a ámbar', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(900)] },
        coberturaSuficiente: false,
        coberturaMotivo: 'Padrón incompleto en Getafe: 4 conocidas, ~18 esperadas.',
      }),
    );
    expect(r.veredicto).toBe('ambar');
    expect(r.motivo).toContain('Getafe');
  });

  it('un padrón incompleto no cambia un rojo: ese ya está demostrado', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(50)] },
        coberturaSuficiente: false,
      }),
    );
    expect(r.veredicto).toBe('rojo');
  });

  it('degrada aunque no se dé un motivo concreto', () => {
    const r = calcularVeredicto(
      entrada({ farmacias: { umbralM: 250, mediciones: [] }, coberturaSuficiente: false }),
    );
    expect(r.veredicto).toBe('ambar');
    expect(r.motivo).toContain('incompleto');
  });
});

describe('calcularVeredicto — normativa sin verificar', () => {
  it('avisa cuando la distancia aplicada solo hereda el mínimo estatal', () => {
    const r = calcularVeredicto(
      entrada({
        farmacias: { umbralM: 250, mediciones: [medicion(900)] },
        umbrales: { ...UMBRALES, comunidad: 'galicia', verificado: false },
      }),
    );
    expect(r.veredicto).toBe('verde');
    expect(r.motivo).toContain('no está verificada');
  });

  it('no avisa cuando la normativa sí está verificada', () => {
    const r = calcularVeredicto(
      entrada({ farmacias: { umbralM: 250, mediciones: [medicion(900)] } }),
    );
    expect(r.motivo).not.toContain('no está verificada');
  });
});
