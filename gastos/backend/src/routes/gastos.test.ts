import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// Estos tests ejercitan las rutas con fastify.inject y el pool mockeado
// (como pipeline.test.ts): comprueban validación, parámetros pasados a SQL y
// montaje de la respuesta, no el SQL contra un Postgres real.
const mockQuery = vi.fn();
vi.mock('../db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// El guard de rol ya tiene sus propios tests (middleware/auth.test.ts).
vi.mock('../middleware/auth', () => ({
  authMiddleware: () => async () => undefined,
}));

vi.mock('../ocr/pipeline', () => ({ runOcrPipeline: vi.fn() }));

import { gastosRoutes } from './gastos';

describe('gastos routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    app = Fastify();
    await app.register(gastosRoutes);
    await app.ready();
  });

  describe('GET /totales', () => {
    it('returns the period totals for a month and keeps mes + total for older clients', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { tipo: 'gasto', categoria: 'Comida', total: '100.00' },
          { tipo: 'ganancia', categoria: 'Nómina', total: '2000.00' },
        ],
      });
      const res = await app.inject({ method: 'GET', url: '/totales?mes=2026-03' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        periodo: 'mes',
        mes: '2026-03',
        gastos: 100,
        ganancias: 2000,
        balance: 1900,
        total: 100,
        porCategoria: [
          { categoria: 'Comida', tipo: 'gasto', total: 100 },
          { categoria: 'Nómina', tipo: 'ganancia', total: 2000 },
        ],
      });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(['2026-03-01', '2026-04-01']);
    });

    it('returns income 3000 / expenses 1200 / balance 1800 and 12 zero-filled months for a year', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { tipo: 'gasto', categoria: 'Comida', total: '1200' },
            { tipo: 'ganancia', categoria: 'Nómina', total: '3000' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { mes: '2026-03', tipo: 'gasto', total: '1200' },
            { mes: '2026-03', tipo: 'ganancia', total: '3000' },
          ],
        });
      const res = await app.inject({ method: 'GET', url: '/totales?anio=2026' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        periodo: 'anio', anio: '2026', gastos: 1200, ganancias: 3000, balance: 1800, total: 1200,
      });
      expect(body.mes).toBeUndefined();
      expect(body.porMes).toHaveLength(12);
      expect(body.porMes[2]).toEqual({ mes: '2026-03', gastos: 1200, ganancias: 3000 });
      expect(body.porMes[0]).toEqual({ mes: '2026-01', gastos: 0, ganancias: 0 });
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('only ever asks the database for confirmed, active rows (drafts and forecasts never counted)', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await app.inject({ method: 'GET', url: '/totales?anio=2026' });
      expect(mockQuery).toHaveBeenCalledTimes(2);
      for (const call of mockQuery.mock.calls) {
        expect(call[0]).toContain("estado = 'confirmado'");
        expect(call[0]).toContain('activo = true');
      }
    });

    it('passes the categoria filter as a bound parameter to both queries for a year', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await app.inject({ method: 'GET', url: '/totales?anio=2026&categoria=Ocio' });
      for (const call of mockQuery.mock.calls) {
        expect(call[1]).toEqual(['2026-01-01', '2027-01-01', 'Ocio']);
      }
    });

    it('rejects a request with neither or both of mes and anio', async () => {
      const neither = await app.inject({ method: 'GET', url: '/totales' });
      const both = await app.inject({ method: 'GET', url: '/totales?mes=2026-03&anio=2026' });
      expect(neither.statusCode).toBe(400);
      expect(both.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('GET /gastos', () => {
    it('rejects anio together with mes', async () => {
      const res = await app.inject({ method: 'GET', url: '/gastos?anio=2026&mes=2026-03' });
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('filters a year and a tipo through bound parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await app.inject({ method: 'GET', url: '/gastos?anio=2026&estado=confirmado&tipo=ganancia' });
      expect(res.statusCode).toBe(200);
      const [text, values] = mockQuery.mock.calls[0];
      expect(text).toContain('fecha >= $1::date AND fecha < $2::date');
      expect(values).toEqual(['2026-01-01', '2027-01-01', 'confirmado', 'ganancia']);
    });
  });

  describe('POST /gastos', () => {
    it('stores a ganancia with the given tipo', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'x', tipo: 'ganancia' }] });
      const res = await app.inject({
        method: 'POST',
        url: '/gastos',
        payload: { importe: 1500, fecha: '2026-03-01', comercio: 'Empresa', tipo: 'ganancia' },
      });
      expect(res.statusCode).toBe(201);
      const [text, values] = mockQuery.mock.calls[0];
      expect(text).toContain('tipo');
      expect(values[5]).toBe('confirmado');
      expect(values[6]).toBe('ganancia');
    });

    it('defaults tipo to gasto when omitted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'x' }] });
      await app.inject({
        method: 'POST',
        url: '/gastos',
        payload: { importe: 10, fecha: '2026-03-01', comercio: 'Bar' },
      });
      expect(mockQuery.mock.calls[0][1][6]).toBe('gasto');
    });

    it('stores a forecast income with no fecha', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'x' }] });
      const res = await app.inject({
        method: 'POST',
        url: '/gastos',
        payload: { importe: 300, comercio: 'Cliente', tipo: 'ganancia', estado: 'previsto' },
      });
      expect(res.statusCode).toBe(201);
      const values = mockQuery.mock.calls[0][1];
      expect(values[1]).toBeNull();
      expect(values[5]).toBe('previsto');
      expect(values[6]).toBe('ganancia');
    });

    it('rejects an invalid tipo with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/gastos',
        payload: { importe: 10, fecha: '2026-03-01', comercio: 'Bar', tipo: 'ingreso' },
      });
      expect(res.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /gastos/:id', () => {
    it('persists tipo on update and rejects an invalid one', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'a' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'a', tipo: 'ganancia' }] });
      const ok = await app.inject({ method: 'PATCH', url: '/gastos/a', payload: { tipo: 'ganancia' } });
      expect(ok.statusCode).toBe(200);
      expect(mockQuery.mock.calls[1][0]).toContain('tipo = $2');
      expect(mockQuery.mock.calls[1][1]).toEqual(['a', 'ganancia']);

      const bad = await app.inject({ method: 'PATCH', url: '/gastos/a', payload: { tipo: 'otro' } });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('GET /categorias and /comercios', () => {
    it('returns a plain string[] in the order given by the usage-ranked query', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ valor: 'Comida', usos: '5' }, { valor: 'Ocio', usos: '2' }],
      });
      const res = await app.inject({ method: 'GET', url: '/categorias' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(['Comida', 'Ocio']);
      expect(mockQuery.mock.calls[0][0]).toContain('FROM gasto');
      expect(mockQuery.mock.calls[0][0]).toContain('categoria');
      expect(mockQuery.mock.calls[0][1]).toEqual([]);
    });

    it('scopes /categorias by tipo', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ valor: 'Nómina', usos: '3' }] });
      const res = await app.inject({ method: 'GET', url: '/categorias?tipo=ganancia' });
      expect(res.json()).toEqual(['Nómina']);
      expect(mockQuery.mock.calls[0][1]).toEqual(['ganancia']);
    });

    it('serves merchants from the comercio column', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ valor: 'Mercadona', usos: '9' }] });
      const res = await app.inject({ method: 'GET', url: '/comercios?tipo=gasto' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(['Mercadona']);
      expect(mockQuery.mock.calls[0][0]).toContain('comercio');
      expect(mockQuery.mock.calls[0][1]).toEqual(['gasto']);
    });

    it('rejects an invalid tipo on both endpoints', async () => {
      const a = await app.inject({ method: 'GET', url: '/categorias?tipo=otro' });
      const b = await app.inject({ method: 'GET', url: '/comercios?tipo=otro' });
      expect(a.statusCode).toBe(400);
      expect(b.statusCode).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
