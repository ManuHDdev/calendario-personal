import { describe, it, expect } from 'vitest';
import { createBusquedaSchema, updateBusquedaSchema } from './pisos.schema';

const BASE = {
  nombre: 'Test',
  ubicacion: 'Badajoz',
  portales: { fotocasa: { enabled: true }, pisos: { enabled: true }, wallapop: { enabled: false } },
};

describe('createBusquedaSchema — tipo', () => {
  it('sin tipo cae a vivienda', () => {
    const r = createBusquedaSchema.safeParse({ ...BASE });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe('vivienda');
  });

  it('acepta tipo local', () => {
    const r = createBusquedaSchema.safeParse({ ...BASE, tipo: 'local' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe('local');
  });

  it('rechaza un tipo desconocido', () => {
    expect(createBusquedaSchema.safeParse({ ...BASE, tipo: 'garaje' }).success).toBe(false);
  });
});

describe('updateBusquedaSchema — tipo es inmutable', () => {
  it('mandar tipo en un PATCH es un error (Unrecognized key por .strict())', () => {
    const r = updateBusquedaSchema.safeParse({ nombre: 'Nuevo', tipo: 'local' });
    expect(r.success).toBe(false);
  });

  it('reenviar el mismo tipo tambien es un error: el frontend nunca lo envia', () => {
    const r = updateBusquedaSchema.safeParse({ nombre: 'Nuevo', tipo: 'vivienda' });
    expect(r.success).toBe(false);
  });

  it('un PATCH sin tipo pasa y no inyecta un tipo por defecto', () => {
    const r = updateBusquedaSchema.safeParse({ nombre: 'Nuevo' });
    expect(r.success).toBe(true);
    if (r.success) expect('tipo' in r.data).toBe(false);
  });
});
