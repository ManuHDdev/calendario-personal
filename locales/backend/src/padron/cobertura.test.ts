import { describe, it, expect } from 'vitest';
import { evaluarCobertura, HABITANTES_POR_FARMACIA, UMBRAL_COBERTURA } from './cobertura';

const base = { municipio: 'Getafe', provincia: 'Madrid' };

describe('evaluarCobertura', () => {
  it('un municipio bien cubierto pasa sin motivo', () => {
    const r = evaluarCobertura({ ...base, poblacion: 28_000, farmaciasConocidas: 10 });
    expect(r.farmaciasEsperadas).toBe(10);
    expect(r.suficiente).toBe(true);
    expect(r.motivo).toBeNull();
  });

  it('detecta el caso que motiva todo esto: muchos habitantes, pocas farmacias', () => {
    const r = evaluarCobertura({ ...base, poblacion: 50_000, farmaciasConocidas: 4 });
    expect(r.farmaciasEsperadas).toBe(18);
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toContain('Getafe');
    expect(r.motivo).toContain('4 farmacias conocidas');
  });

  it('tolera la dispersión estadística hasta el umbral', () => {
    const poblacion = 28_000; // esperadas: 10
    const justo = Math.ceil(10 * UMBRAL_COBERTURA);
    expect(evaluarCobertura({ ...base, poblacion, farmaciasConocidas: justo }).suficiente).toBe(true);
    expect(evaluarCobertura({ ...base, poblacion, farmaciasConocidas: justo - 1 }).suficiente).toBe(false);
  });

  it('sin población no da el padrón por bueno', () => {
    // La dirección segura del error: no saber nunca puede leerse como "cumple".
    const r = evaluarCobertura({ ...base, poblacion: null, farmaciasConocidas: 30 });
    expect(r.suficiente).toBe(false);
    expect(r.farmaciasEsperadas).toBeNull();
    expect(r.motivo).toContain('No se conoce la población');
  });

  it('una población absurda se trata como desconocida', () => {
    expect(evaluarCobertura({ ...base, poblacion: 0, farmaciasConocidas: 5 }).suficiente).toBe(false);
  });

  it('un pueblo diminuto espera al menos una farmacia', () => {
    const r = evaluarCobertura({ ...base, poblacion: 300, farmaciasConocidas: 0 });
    expect(r.farmaciasEsperadas).toBe(1);
    expect(r.suficiente).toBe(false);
  });

  it('el módulo poblacional declarado es el de referencia en España', () => {
    expect(HABITANTES_POR_FARMACIA).toBe(2800);
  });
});
