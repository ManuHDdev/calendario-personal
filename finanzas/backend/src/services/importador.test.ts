import { describe, it, expect } from 'vitest';
import { construirUpsertFilaQuery } from './importador';
import type { FilaPrecio } from './xlsParser';

describe('construirUpsertFilaQuery', () => {
  const fila: FilaPrecio = {
    ambito: 'provincia',
    nombre: 'Almería',
    comunidad_autonoma: 'Andalucía',
    anio: 2024,
    trimestre: 1,
    precio_m2: 1218.1,
  };

  it('usa ON CONFLICT sobre (ambito, nombre, anio, trimestre) para no duplicar', () => {
    const { text } = construirUpsertFilaQuery(fila);
    expect(text).toMatch(/ON CONFLICT \(ambito, nombre, anio, trimestre\)/);
    expect(text).toMatch(/DO UPDATE SET/);
  });

  it('importar dos veces la misma fila produce la misma query parametrizada (idempotente)', () => {
    const primera = construirUpsertFilaQuery(fila);
    const segunda = construirUpsertFilaQuery({ ...fila });
    expect(primera.text).toBe(segunda.text);
    expect(primera.values).toEqual(segunda.values);
  });

  it('actualiza el valor si el Ministerio revisa un dato pasado', () => {
    const { text } = construirUpsertFilaQuery(fila);
    expect(text).toMatch(/precio_m2 = EXCLUDED\.precio_m2/);
  });
});
