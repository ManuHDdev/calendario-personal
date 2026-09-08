import { describe, it, expect, vi } from 'vitest';
import { rastrearBusqueda, mapearViabilidad, type DepsRastreo } from './rastreo';
import type { PortalProvider } from '../portales/types';
import type {
  AnuncioCrudo,
  Busqueda,
  ResultadoViabilidad,
} from '../types/locales';

function busqueda(over: Partial<Busqueda> = {}): Busqueda {
  return {
    id: 7,
    nombre: 'Locales Badajoz',
    tipo: 'local',
    comunidad: 'extremadura',
    provincia: 'Badajoz',
    municipio: 'Badajoz',
    zona_texto: 'Badajoz',
    latitud: null,
    longitud: null,
    radio_km: null,
    precio_min: null,
    precio_max: null,
    superficie_min: null,
    superficie_max: null,
    pie_calle: null,
    facturacion_min: null,
    facturacion_max: null,
    comprobar_farmacias: true,
    comprobar_centros_sanitarios: true,
    distancia_farmacias_m: null,
    distancia_centros_sanitarios_m: null,
    portales: ['fotocasa'],
    habilitada: true,
    notificar: true,
    ultimo_rastreo: null,
    ultimo_rastreo_error: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function crudo(over: Partial<AnuncioCrudo> = {}): AnuncioCrudo {
  return {
    tipo: 'local',
    portal: 'fotocasa',
    portalId: 'a1',
    url: 'https://fotocasa.es/a1',
    titulo: 'Local en Badajoz',
    descripcion: null,
    precio: 90000,
    precioAnterior: null,
    superficieM2: 120,
    facturacion: null,
    direccion: null,
    municipio: 'Badajoz',
    provincia: 'Badajoz',
    comunidad: null,
    latitud: 38.88,
    longitud: -6.97,
    precision: 'aproximada',
    imagenUrl: null,
    ...over,
  };
}

const VIAB_VERDE: ResultadoViabilidad = {
  veredicto: 'verde',
  motivo: 'Cumple.',
  farmaciaMasCercana: {
    establecimiento: {
      id: 55, nombre: 'F', direccion: null, municipio: 'Badajoz', precision: 'exacta', fuente: 'osm', lat: 38.9, lng: -6.9,
    },
    metros: 410.6,
    decisiva: true,
  },
  centroMasCercano: null,
  farmacias: [],
  centros: [],
  umbrales: {
    comunidad: 'extremadura', distanciaFarmaciasM: 250, distanciaCentrosSanitariosM: null,
    origen: 'normativa', verificado: false, fuenteUrl: null, notas: null,
  },
  motor: 'ors',
  calculadoEn: new Date('2026-09-08T00:00:00Z'),
};

function providerFake(over: Partial<PortalProvider> & { anuncios?: AnuncioCrudo[] } = {}): PortalProvider {
  return {
    id: 'fotocasa',
    nombre: 'Fotocasa',
    tipo: 'local',
    puedeBuscar: () => ({ ok: true }),
    buscar: async () => over.anuncios ?? [crudo()],
    puedeParsearUrl: () => false,
    parsearUrl: async () => null,
    ...over,
  };
}

interface FilaFake {
  id: number;
  es_nuevo: boolean;
  precio: number | null;
  precio_anterior: number | null;
  tipo: 'local' | 'farmacia';
  veredicto: string;
  [k: string]: unknown;
}

function deps(over: Partial<DepsRastreo> & { provider?: PortalProvider } = {}): {
  deps: DepsRastreo;
  upsert: ReturnType<typeof vi.fn>;
  marcar: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  const release = vi.fn();
  const upsert = vi.fn(async (_id, c: AnuncioCrudo, v) => ({
    id: 100,
    es_nuevo: true,
    precio: c.precio,
    precio_anterior: null,
    tipo: c.tipo,
    veredicto: v.veredicto,
  })) as ReturnType<typeof vi.fn>;
  const marcar = vi.fn(async () => undefined);
  const provider = over.provider ?? providerFake();
  const base: DepsRastreo = {
    providersParaTipo: () => [provider],
    getProvider: (id) => (id === provider.id ? provider : undefined),
    comprobarPunto: vi.fn(async () => VIAB_VERDE) as never,
    conectar: async () => ({ query: vi.fn(), release }) as never,
    upsertAnuncio: upsert as never,
    marcarRastreo: marcar as never,
    ...over,
  };
  return { deps: base, upsert, marcar, release };
}

describe('rastrearBusqueda', () => {
  it('guarda el anuncio que cumple, con su veredicto, y suelta el cliente', async () => {
    const { deps: d, upsert, marcar, release } = deps();
    const r = await rastrearBusqueda(busqueda(), { notificarNovedades: true }, d);

    expect(r.encontrados).toBe(1);
    expect(r.guardados).toBe(1);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][2].veredicto).toBe('verde');
    expect(marcar).toHaveBeenCalledWith(7, null, expect.anything());
    expect(release).toHaveBeenCalledOnce();
    expect(r.novedades).toEqual([{ anuncio: expect.objectContaining({ id: 100 }), tipo: 'nuevo' }]);
  });

  it('un portal caído degrada: se registra el fallo y no aborta', async () => {
    const roto = providerFake({ buscar: async () => { throw new Error('403 bloqueo'); } });
    const { deps: d, marcar } = deps({ provider: roto });
    const r = await rastrearBusqueda(busqueda(), {}, d);

    expect(r.fallos).toEqual([{ portal: 'fotocasa', motivo: '403 bloqueo' }]);
    expect(r.guardados).toBe(0);
    expect(marcar).toHaveBeenCalledWith(7, 'fotocasa: 403 bloqueo', expect.anything());
  });

  it('un id de portal desconocido va a omitidos', async () => {
    const { deps: d } = deps();
    const r = await rastrearBusqueda(busqueda({ portales: ['noexiste'] }), {}, d);
    expect(r.omitidos).toEqual([{ portal: 'noexiste', motivo: 'portal desconocido' }]);
  });

  it('farmacia sin coordenadas: se guarda con sin_datos, no es un fallo', async () => {
    const provider = providerFake({
      tipo: 'farmacia',
      id: 'farmaconsulting',
      anuncios: [crudo({ tipo: 'farmacia', portal: 'farmaconsulting', latitud: null, longitud: null, superficieM2: null })],
    });
    const comprobar = vi.fn();
    const { deps: d, upsert } = deps({ provider, comprobarPunto: comprobar as never });
    const r = await rastrearBusqueda(
      busqueda({ tipo: 'farmacia', portales: ['farmaconsulting'] }),
      {},
      d,
    );

    expect(comprobar).not.toHaveBeenCalled();
    expect(r.guardados).toBe(1);
    expect(upsert.mock.calls[0][2]).toMatchObject({
      veredicto: 'sin_datos',
      veredicto_motivo: 'El anuncio no publica una ubicación',
    });
  });

  it('no marca novedades si notificarNovedades es false', async () => {
    const { deps: d } = deps();
    const r = await rastrearBusqueda(busqueda(), { notificarNovedades: false }, d);
    expect(r.novedades).toEqual([]);
  });
});

describe('mapearViabilidad', () => {
  it('redondea metros y toma los ids de los establecimientos', () => {
    const v = mapearViabilidad(VIAB_VERDE);
    expect(v.distancia_farmacia_m).toBe(411);
    expect(v.farmacia_mas_cercana_id).toBe(55);
    expect(v.distancia_centro_m).toBeNull();
    expect(v.viabilidad_motor).toBe('ors');
  });
});
