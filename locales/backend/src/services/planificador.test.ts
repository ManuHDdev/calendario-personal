import { describe, it, expect, vi, beforeEach } from 'vitest';

const listBusquedasRastreables = vi.fn();
const marcarNotificado = vi.fn(async () => undefined);
const rastrearBusqueda = vi.fn();
const notificarNovedades = vi.fn(async () => [] as number[]);

vi.mock('../db/queries', async (orig) => ({
  ...(await orig<typeof import('./../db/queries')>()),
  listBusquedasRastreables: (...a: unknown[]) => listBusquedasRastreables(...a),
  marcarNotificado: (...a: unknown[]) => marcarNotificado(...a),
  anunciosParaRecalcular: vi.fn(async () => []),
  actualizarViabilidad: vi.fn(async () => undefined),
  comunidadesEnPadron: vi.fn(async () => []),
  getScraperState: vi.fn(async () => ({ running: true, updatedAt: new Date() })),
}));
vi.mock('./rastreo', async (orig) => ({
  ...(await orig<typeof import('./rastreo')>()),
  rastrearBusqueda: (...a: unknown[]) => rastrearBusqueda(...a),
}));
vi.mock('../telegram/emision', () => ({
  notificarNovedades: (...a: unknown[]) => notificarNovedades(...a),
}));
vi.mock('../padron/importar', () => ({
  importarComunidad: vi.fn(async () => ({ farmaciasImportadas: 0, centrosImportados: 0, errores: [] })),
  padronVacio: vi.fn(async () => false),
}));

import { esPrimeraVuelta, ejecutarVuelta } from './planificador';

const LOG = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function busqueda(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    nombre: 'B',
    tipo: 'local',
    portales: ['fotocasa'],
    notificar: true,
    ultimo_rastreo: null,
    comunidad: null,
    provincia: null,
    municipio: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('esPrimeraVuelta', () => {
  it('true solo mientras no se haya rastreado nunca', () => {
    expect(esPrimeraVuelta({ ultimo_rastreo: null })).toBe(true);
    expect(esPrimeraVuelta({ ultimo_rastreo: '2026-09-01T00:00:00Z' })).toBe(false);
  });
});

describe('ejecutarVuelta', () => {
  it('la primera vuelta de una búsqueda no notifica (línea base)', async () => {
    listBusquedasRastreables.mockResolvedValue([busqueda({ ultimo_rastreo: null })]);
    rastrearBusqueda.mockResolvedValue({
      busquedaId: 1, busquedaNombre: 'B', encontrados: 3, guardados: 3, novedades: [], fallos: [], omitidos: [],
    });

    await ejecutarVuelta(LOG);

    expect(rastrearBusqueda).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ notificarNovedades: false }),
    );
    expect(notificarNovedades).not.toHaveBeenCalled();
  });

  it('en vueltas posteriores notifica y marca los ids enviados', async () => {
    listBusquedasRastreables.mockResolvedValue([busqueda({ ultimo_rastreo: '2026-09-01T00:00:00Z' })]);
    rastrearBusqueda.mockResolvedValue({
      busquedaId: 1, busquedaNombre: 'B', encontrados: 1, guardados: 1,
      novedades: [{ anuncio: { id: 42, veredicto: 'verde' }, tipo: 'nuevo' }],
      fallos: [], omitidos: [],
    });
    notificarNovedades.mockResolvedValue([42]);

    await ejecutarVuelta(LOG);

    expect(notificarNovedades).toHaveBeenCalledOnce();
    expect(marcarNotificado).toHaveBeenCalledWith(42);
  });

  it('una búsqueda que revienta no se lleva por delante a las demás', async () => {
    listBusquedasRastreables.mockResolvedValue([busqueda({ id: 1 }), busqueda({ id: 2 })]);
    rastrearBusqueda
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        busquedaId: 2, busquedaNombre: 'B', encontrados: 0, guardados: 0, novedades: [], fallos: [], omitidos: [],
      });

    vi.useFakeTimers();
    const promesa = ejecutarVuelta(LOG);
    await vi.runAllTimersAsync();
    const r = await promesa;
    vi.useRealTimers();

    expect(LOG.error).toHaveBeenCalled();
    expect(r).toHaveLength(1);
    expect(r[0].busquedaId).toBe(2);
  });
});
