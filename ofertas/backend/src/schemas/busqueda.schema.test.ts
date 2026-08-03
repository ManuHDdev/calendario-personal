import { describe, it, expect } from 'vitest';
import { createBusquedaSchema, updateBusquedaSchema } from './busqueda.schema';

const validSitios = {
  wallapop: { enabled: true },
  milanuncios: { enabled: false },
  vinted: { enabled: false },
};

const validBody = {
  nombre: 'Juegos DS baratos',
  keyword: 'juegos ds',
  precio_max: 15,
  latitude: 39.4753,
  longitude: -6.3724,
  distance_km: 30,
  sitios: validSitios,
};

describe('createBusquedaSchema', () => {
  it('accepts a well-formed saved search', () => {
    expect(createBusquedaSchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts nullable precio_min/precio_max and milanuncios_province_slug', () => {
    const result = createBusquedaSchema.safeParse({
      ...validBody,
      precio_min: null,
      precio_max: null,
      milanuncios_province_slug: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid language_filter code', () => {
    const result = createBusquedaSchema.safeParse({ ...validBody, language_filter: 'es' });
    expect(result.success).toBe(true);
  });

  it('accepts a null or omitted language_filter', () => {
    expect(createBusquedaSchema.safeParse({ ...validBody, language_filter: null }).success).toBe(true);
    expect(createBusquedaSchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts an exclude_keywords string', () => {
    const result = createBusquedaSchema.safeParse({ ...validBody, exclude_keywords: 'carta,cartas,tcg' });
    expect(result.success).toBe(true);
  });

  it('accepts a null or omitted exclude_keywords', () => {
    expect(createBusquedaSchema.safeParse({ ...validBody, exclude_keywords: null }).success).toBe(true);
    expect(createBusquedaSchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts a boolean console_only', () => {
    expect(createBusquedaSchema.safeParse({ ...validBody, console_only: true }).success).toBe(true);
    expect(createBusquedaSchema.safeParse({ ...validBody, console_only: false }).success).toBe(true);
  });

  it('accepts an omitted console_only', () => {
    expect(createBusquedaSchema.safeParse(validBody).success).toBe(true);
  });

  it('accepts a boolean habilitada', () => {
    expect(createBusquedaSchema.safeParse({ ...validBody, habilitada: true }).success).toBe(true);
    expect(createBusquedaSchema.safeParse({ ...validBody, habilitada: false }).success).toBe(true);
  });

  it('accepts an omitted habilitada', () => {
    expect(createBusquedaSchema.safeParse(validBody).success).toBe(true);
  });

  it.each([
    { ...validBody, nombre: '' },
    { ...validBody, keyword: '' },
    { ...validBody, latitude: 200 },
    { ...validBody, longitude: -200 },
    { ...validBody, distance_km: 0 },
    { ...validBody, distance_km: -5 },
    { ...validBody, precio_min: -1 },
    { ...validBody, sitios: { wallapop: { enabled: true } } },
    { ...validBody, sitios: { ...validSitios, extra: { enabled: true } } },
    { ...validBody, language_filter: 'spanish' },
    { ...validBody, language_filter: 'e' },
    { ...validBody, language_filter: 123 },
    { ...validBody, exclude_keywords: 123 },
    { ...validBody, console_only: 'true' },
    { ...validBody, console_only: 1 },
    { ...validBody, habilitada: 'true' },
    { ...validBody, habilitada: 1 },
  ])('rejects a malformed body: %j', (body) => {
    expect(createBusquedaSchema.safeParse(body).success).toBe(false);
  });

  it('rejects precio_min greater than precio_max', () => {
    const result = createBusquedaSchema.safeParse({ ...validBody, precio_min: 50, precio_max: 15 });
    expect(result.success).toBe(false);
  });

  it('accepts precio_min equal to precio_max', () => {
    const result = createBusquedaSchema.safeParse({ ...validBody, precio_min: 15, precio_max: 15 });
    expect(result.success).toBe(true);
  });
});

describe('updateBusquedaSchema', () => {
  it('accepts a partial update with a single field', () => {
    expect(updateBusquedaSchema.safeParse({ nombre: 'Nuevo nombre' }).success).toBe(true);
  });

  it('accepts an empty object (caller rejects it separately as a no-op)', () => {
    expect(updateBusquedaSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown fields', () => {
    expect(updateBusquedaSchema.safeParse({ foo: 'bar' }).success).toBe(false);
  });

  it('still enforces precio_min <= precio_max on partial updates', () => {
    expect(updateBusquedaSchema.safeParse({ precio_min: 100, precio_max: 10 }).success).toBe(false);
  });

  it('rejects an invalid nested sitios shape', () => {
    expect(updateBusquedaSchema.safeParse({ sitios: { wallapop: { enabled: 'yes' } } }).success).toBe(false);
  });

  it('accepts a partial update of language_filter, including setting it back to null', () => {
    expect(updateBusquedaSchema.safeParse({ language_filter: 'en' }).success).toBe(true);
    expect(updateBusquedaSchema.safeParse({ language_filter: null }).success).toBe(true);
  });

  it('rejects a malformed language_filter on partial update', () => {
    expect(updateBusquedaSchema.safeParse({ language_filter: 'english' }).success).toBe(false);
  });

  it('accepts a partial update of exclude_keywords, including setting it back to null', () => {
    expect(updateBusquedaSchema.safeParse({ exclude_keywords: 'carta,cartas,tcg' }).success).toBe(true);
    expect(updateBusquedaSchema.safeParse({ exclude_keywords: null }).success).toBe(true);
  });

  it('rejects a non-string exclude_keywords on partial update', () => {
    expect(updateBusquedaSchema.safeParse({ exclude_keywords: 123 }).success).toBe(false);
  });

  it('accepts a partial update of console_only', () => {
    expect(updateBusquedaSchema.safeParse({ console_only: true }).success).toBe(true);
    expect(updateBusquedaSchema.safeParse({ console_only: false }).success).toBe(true);
  });

  it('rejects a non-boolean console_only on partial update', () => {
    expect(updateBusquedaSchema.safeParse({ console_only: 'true' }).success).toBe(false);
  });

  it('accepts a partial update of habilitada', () => {
    expect(updateBusquedaSchema.safeParse({ habilitada: true }).success).toBe(true);
    expect(updateBusquedaSchema.safeParse({ habilitada: false }).success).toBe(true);
  });

  it('rejects a non-boolean habilitada on partial update', () => {
    expect(updateBusquedaSchema.safeParse({ habilitada: 'true' }).success).toBe(false);
  });
});
