import { describe, it, expect } from 'vitest';
import { createCamaraSchema, updateCamaraSchema, listCamarasQuerySchema, idParamSchema } from './camara.schema';

const base = { nombre: 'Plaza Mayor', ciudad: 'caceres', latitud: 39.47, longitud: -6.37 };

describe('createCamaraSchema', () => {
  it('acepta una cámara con URL de imagen', () => {
    expect(createCamaraSchema.safeParse({ ...base, urlImagen: 'https://a.test/x.jpg' }).success).toBe(true);
  });

  it('acepta una cámara solo con URL de página', () => {
    expect(createCamaraSchema.safeParse({ ...base, urlPagina: 'https://a.test/directo' }).success).toBe(true);
  });

  it('exige al menos una URL', () => {
    const r = createCamaraSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it('rechaza esquemas que no son http(s)', () => {
    expect(createCamaraSchema.safeParse({ ...base, urlImagen: 'javascript:alert(1)' }).success).toBe(false);
    expect(createCamaraSchema.safeParse({ ...base, urlImagen: 'file:///etc/passwd' }).success).toBe(false);
  });

  it('rechaza una ciudad desconocida y coordenadas fuera de rango', () => {
    expect(createCamaraSchema.safeParse({ ...base, ciudad: 'madrid', urlImagen: 'https://a.test/x.jpg' }).success).toBe(false);
    expect(createCamaraSchema.safeParse({ ...base, latitud: 95, urlImagen: 'https://a.test/x.jpg' }).success).toBe(false);
  });

  it('rechaza campos desconocidos (strict)', () => {
    expect(createCamaraSchema.safeParse({ ...base, urlImagen: 'https://a.test/x.jpg', origen: 'dgt' }).success).toBe(false);
  });

  it('rechaza nombre vacío', () => {
    expect(createCamaraSchema.safeParse({ ...base, nombre: '  ', urlImagen: 'https://a.test/x.jpg' }).success).toBe(false);
  });
});

describe('updateCamaraSchema', () => {
  it('permite cuerpo parcial y anular URLs con null', () => {
    expect(updateCamaraSchema.safeParse({ favorita: true }).success).toBe(true);
    expect(updateCamaraSchema.safeParse({ urlPagina: null }).success).toBe(true);
  });

  it('rechaza campos desconocidos', () => {
    expect(updateCamaraSchema.safeParse({ activo: false }).success).toBe(false);
  });
});

describe('listCamarasQuerySchema / idParamSchema', () => {
  it('valida filtros', () => {
    expect(listCamarasQuerySchema.safeParse({ ciudad: 'merida', favorita: 'true' }).success).toBe(true);
    expect(listCamarasQuerySchema.safeParse({ ciudad: 'atlantida' }).success).toBe(false);
  });

  it('el id debe ser entero positivo', () => {
    expect(idParamSchema.safeParse({ id: '12' }).success).toBe(true);
    expect(idParamSchema.safeParse({ id: '0' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
  });
});
