import { describe, it, expect } from 'vitest';
import {
  haversineM,
  cajaEnvolvente,
  radioDecisivoM,
  radioInformativoM,
  candidatasEnRadio,
  claveGeo,
  FACTOR_RODEO,
} from './geo';
import type { LatLng } from '../types/locales';

// Puerta del Sol, Madrid — origen de todas las mediciones de referencia.
const SOL: LatLng = { lat: 40.4169, lng: -3.7035 };

describe('haversineM', () => {
  it('da cero para el mismo punto', () => {
    expect(haversineM(SOL, SOL)).toBe(0);
  });

  it('mide un grado de latitud como ~111,2 km', () => {
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('es simétrica', () => {
    const a = { lat: 40.4169, lng: -3.7035 };
    const b = { lat: 40.4200, lng: -3.7100 };
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 9);
  });

  it('mide Sol–Plaza Mayor en el orden de los 400 m', () => {
    const plazaMayor = { lat: 40.4155, lng: -3.7074 };
    const d = haversineM(SOL, plazaMayor);
    expect(d).toBeGreaterThan(300);
    expect(d).toBeLessThan(500);
  });
});

describe('cajaEnvolvente', () => {
  it('contiene siempre al círculo que envuelve', () => {
    // Se recorre el borde del círculo: ningún punto puede quedar fuera de la
    // caja, o el prefiltro perdería farmacias sin que nadie se entere.
    for (const radioM of [250, 750, 3000]) {
      const caja = cajaEnvolvente(SOL, radioM);
      for (let grado = 0; grado < 360; grado += 5) {
        const rad = (grado * Math.PI) / 180;
        // Punto a `radioM` del centro en ese rumbo (aprox. equirrectangular).
        const dLat = (radioM * Math.cos(rad)) / 111_320;
        const dLng =
          (radioM * Math.sin(rad)) / (111_320 * Math.cos((SOL.lat * Math.PI) / 180));
        const p = { lat: SOL.lat + dLat, lng: SOL.lng + dLng };
        expect(p.lat).toBeGreaterThanOrEqual(caja.minLat);
        expect(p.lat).toBeLessThanOrEqual(caja.maxLat);
        expect(p.lng).toBeGreaterThanOrEqual(caja.minLng);
        expect(p.lng).toBeLessThanOrEqual(caja.maxLng);
      }
    }
  });

  it('no degenera en el ecuador ni cerca del polo', () => {
    for (const lat of [0, 40, 89.9]) {
      const caja = cajaEnvolvente({ lat, lng: 0 }, 1000);
      expect(Number.isFinite(caja.minLng)).toBe(true);
      expect(Number.isFinite(caja.maxLng)).toBe(true);
      expect(caja.maxLng).toBeGreaterThan(caja.minLng);
    }
  });
});

describe('radioDecisivoM / radioInformativoM', () => {
  it('el radio decisivo suma SIEMPRE el margen de incertidumbre', () => {
    // Sin esta suma, una farmacia a 260 m del punto reportado quedaría fuera
    // del prefiltro; si el punto está desplazado 150 m hacia ella, su
    // distancia real serían 110 m — un incumplimiento reportado como verde.
    expect(radioDecisivoM(250, 0)).toBe(250);
    expect(radioDecisivoM(250, 150)).toBe(400);
    expect(radioDecisivoM(250, 600)).toBe(850);
  });

  it('cubre el peor caso de márgenes acumulados', () => {
    // Punto desconocido (300) + establecimiento desconocido (300) = 600.
    const peorMargen = 600;
    expect(radioDecisivoM(250, peorMargen)).toBeGreaterThanOrEqual(250 + peorMargen);
  });

  it('el radio informativo contiene siempre al decisivo', () => {
    for (const umbral of [150, 250, 1000]) {
      for (const margen of [0, 150, 300, 600]) {
        expect(radioInformativoM(umbral, margen)).toBeGreaterThanOrEqual(
          radioDecisivoM(umbral, margen),
        );
      }
    }
  });

  it('el radio informativo aplica el factor de rodeo', () => {
    expect(radioInformativoM(250, 0)).toBe(250 * FACTOR_RODEO);
  });
});

describe('candidatasEnRadio', () => {
  const cerca = { lat: 40.4172, lng: -3.7036, nombre: 'cerca' };    // ~35 m
  const media = { lat: 40.4190, lng: -3.7050, nombre: 'media' };    // ~250 m
  const lejos = { lat: 40.4400, lng: -3.7300, nombre: 'lejos' };    // ~3 km

  it('descarta lo que queda fuera del radio', () => {
    const r = candidatasEnRadio(SOL, [cerca, media, lejos], 750);
    expect(r.map((x) => x.nombre)).toEqual(['cerca', 'media']);
  });

  it('devuelve de más cerca a más lejos, para poder recortar por el final', () => {
    const r = candidatasEnRadio(SOL, [lejos, media, cerca], 10_000);
    expect(r.map((x) => x.nombre)).toEqual(['cerca', 'media', 'lejos']);
  });

  it('con el radio decisivo conserva toda candidata que podría incumplir', () => {
    const umbral = 250;
    const margen = 600;
    const todas = [cerca, media, lejos];
    // Cualquier candidata cuya distancia real pudiera bajar del umbral tras
    // corregir la posición hasta `margen` metros.
    const podriaIncumplir = todas.filter((c) => haversineM(SOL, c) - margen <= umbral);
    const prefiltradas = candidatasEnRadio(SOL, todas, radioDecisivoM(umbral, margen));
    for (const c of podriaIncumplir) {
      expect(prefiltradas).toContain(c);
    }
  });

  it('lista vacía entra y sale vacía', () => {
    expect(candidatasEnRadio(SOL, [], 750)).toEqual([]);
  });
});

describe('claveGeo', () => {
  it('agrupa puntos a menos de ~10 m en la misma clave', () => {
    expect(claveGeo({ lat: 40.41690, lng: -3.70350 })).toBe(
      claveGeo({ lat: 40.416904, lng: -3.703498 }),
    );
  });

  it('separa puntos claramente distintos', () => {
    expect(claveGeo(SOL)).not.toBe(claveGeo({ lat: 40.4200, lng: -3.7100 }));
  });
});
