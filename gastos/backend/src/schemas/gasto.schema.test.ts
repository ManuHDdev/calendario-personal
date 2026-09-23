import { describe, it, expect } from 'vitest';
import { createGastoSchema, updateGastoSchema, listGastosQuerySchema, totalesQuerySchema } from './gasto.schema';

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
});

describe('listGastosQuerySchema', () => {
  it('accepts no filters', () => {
    expect(listGastosQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects a malformed mes', () => {
    expect(listGastosQuerySchema.safeParse({ mes: '2026/07' }).success).toBe(false);
  });
});

describe('totalesQuerySchema', () => {
  it('requires mes in YYYY-MM format', () => {
    expect(totalesQuerySchema.safeParse({ mes: '2026-07' }).success).toBe(true);
    expect(totalesQuerySchema.safeParse({}).success).toBe(false);
    expect(totalesQuerySchema.safeParse({ mes: 'julio' }).success).toBe(false);
  });
});
