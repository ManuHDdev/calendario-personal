import { describe, it, expect } from 'vitest';
import {
  createGastoSchema,
  updateGastoSchema,
  listGastosQuerySchema,
  totalesQuerySchema,
  sugerenciasQuerySchema,
} from './gasto.schema';

describe('createGastoSchema', () => {
  it('accepts a well-formed manual expense', () => {
    const result = createGastoSchema.safeParse({
      importe: 23.5,
      fecha: '2026-07-25',
      comercio: 'Mercadona',
      concepto: 'Compra semanal',
      categoria: 'Alimentación',
    });
    expect(result.success).toBe(true);
  });

  it('accepts the minimal required fields', () => {
    const result = createGastoSchema.safeParse({
      importe: 10,
      fecha: '2026-07-25',
      comercio: 'Bar',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    { importe: -5, fecha: '2026-07-25', comercio: 'Bar' },
    { importe: 0, fecha: '2026-07-25', comercio: 'Bar' },
    { importe: 10, fecha: '25-07-2026', comercio: 'Bar' },
    { importe: 10, fecha: '2026-07-25', comercio: '' },
    { importe: '10', fecha: '2026-07-25', comercio: 'Bar' },
    { fecha: '2026-07-25', comercio: 'Bar' },
  ])('rejects a malformed body: %j', (body) => {
    const result = createGastoSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('accepts estado previsto with no fecha', () => {
    const result = createGastoSchema.safeParse({
      importe: 50,
      comercio: 'Alquiler',
      estado: 'previsto',
    });
    expect(result.success).toBe(true);
  });

  it('rejects estado confirmado with no fecha', () => {
    const result = createGastoSchema.safeParse({
      importe: 50,
      comercio: 'Alquiler',
      estado: 'confirmado',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an omitted estado with no fecha (defaults to confirmado, fecha still required)', () => {
    const result = createGastoSchema.safeParse({
      importe: 50,
      comercio: 'Alquiler',
    });
    expect(result.success).toBe(false);
  });

  it("rejects estado 'pendiente_revision' (OCR-only, never settable via manual POST)", () => {
    const result = createGastoSchema.safeParse({
      importe: 50,
      fecha: '2026-07-25',
      comercio: 'Alquiler',
      estado: 'pendiente_revision',
    });
    expect(result.success).toBe(false);
  });
});

describe('createGastoSchema tipo', () => {
  const base = { importe: 1500, fecha: '2026-07-25', comercio: 'Empresa' };

  it('accepts tipo ganancia and gasto', () => {
    expect(createGastoSchema.safeParse({ ...base, tipo: 'ganancia' }).success).toBe(true);
    expect(createGastoSchema.safeParse({ ...base, tipo: 'gasto' }).success).toBe(true);
  });

  it('leaves tipo undefined when omitted (the route defaults it to gasto)', () => {
    const result = createGastoSchema.safeParse(base);
    expect(result.success && result.data.tipo).toBeUndefined();
  });

  it('rejects an unknown tipo', () => {
    expect(createGastoSchema.safeParse({ ...base, tipo: 'ingreso' }).success).toBe(false);
  });

  it('still requires a positive importe for ganancia', () => {
    expect(createGastoSchema.safeParse({ ...base, importe: -1, tipo: 'ganancia' }).success).toBe(false);
  });

  it('accepts a forecast ganancia without fecha', () => {
    const result = createGastoSchema.safeParse({
      importe: 300, comercio: 'Cliente', tipo: 'ganancia', estado: 'previsto',
    });
    expect(result.success).toBe(true);
  });

  it('still requires fecha for a confirmed ganancia', () => {
    expect(createGastoSchema.safeParse({ importe: 300, comercio: 'Cliente', tipo: 'ganancia' }).success).toBe(false);
  });
});

describe('updateGastoSchema', () => {
  it('accepts a partial update flipping estado', () => {
    const result = updateGastoSchema.safeParse({ estado: 'confirmado' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (caller rejects it separately as a no-op)', () => {
    expect(updateGastoSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an invalid estado value', () => {
    expect(updateGastoSchema.safeParse({ estado: 'aprobado' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(updateGastoSchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });

  it('accepts estado previsto (picked up automatically via the extended enum)', () => {
    expect(updateGastoSchema.safeParse({ estado: 'previsto' }).success).toBe(true);
  });

  it('accepts changing tipo and rejects an invalid one', () => {
    expect(updateGastoSchema.safeParse({ tipo: 'ganancia' }).success).toBe(true);
    expect(updateGastoSchema.safeParse({ tipo: 'otro' }).success).toBe(false);
  });
});

describe('listGastosQuerySchema', () => {
  it('accepts no filters', () => {
    expect(listGastosQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects a malformed mes', () => {
    expect(listGastosQuerySchema.safeParse({ mes: '2026/07' }).success).toBe(false);
    expect(listGastosQuerySchema.safeParse({ mes: '2026-13' }).success).toBe(false);
  });

  it('accepts anio and tipo', () => {
    const result = listGastosQuerySchema.safeParse({ anio: '2026', tipo: 'ganancia' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed anio or an invalid tipo', () => {
    expect(listGastosQuerySchema.safeParse({ anio: '26' }).success).toBe(false);
    expect(listGastosQuerySchema.safeParse({ anio: '2026-07' }).success).toBe(false);
    expect(listGastosQuerySchema.safeParse({ tipo: 'otro' }).success).toBe(false);
  });

  it('rejects anio together with mes', () => {
    expect(listGastosQuerySchema.safeParse({ anio: '2026', mes: '2026-07' }).success).toBe(false);
  });
});

describe('totalesQuerySchema', () => {
  it('accepts mes in YYYY-MM format', () => {
    expect(totalesQuerySchema.safeParse({ mes: '2026-07' }).success).toBe(true);
    expect(totalesQuerySchema.safeParse({ mes: 'julio' }).success).toBe(false);
  });

  it('accepts anio in YYYY format', () => {
    expect(totalesQuerySchema.safeParse({ anio: '2026' }).success).toBe(true);
    expect(totalesQuerySchema.safeParse({ anio: 'este' }).success).toBe(false);
  });

  it('requires exactly one of mes / anio', () => {
    expect(totalesQuerySchema.safeParse({}).success).toBe(false);
    expect(totalesQuerySchema.safeParse({ mes: '2026-07', anio: '2026' }).success).toBe(false);
    expect(totalesQuerySchema.safeParse({ categoria: 'Ocio' }).success).toBe(false);
  });

  it('accepts an optional categoria alongside the period', () => {
    const result = totalesQuerySchema.safeParse({ anio: '2026', categoria: 'Ocio' });
    expect(result.success && result.data.categoria).toBe('Ocio');
  });
});

describe('sugerenciasQuerySchema', () => {
  it('accepts no tipo, gasto or ganancia, and rejects anything else', () => {
    expect(sugerenciasQuerySchema.safeParse({}).success).toBe(true);
    expect(sugerenciasQuerySchema.safeParse({ tipo: 'gasto' }).success).toBe(true);
    expect(sugerenciasQuerySchema.safeParse({ tipo: 'ganancia' }).success).toBe(true);
    expect(sugerenciasQuerySchema.safeParse({ tipo: 'otro' }).success).toBe(false);
  });
});
