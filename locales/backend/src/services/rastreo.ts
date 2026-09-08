/**
 * Un rastreo = una búsqueda guardada, contra todos sus portales.
 *
 * Dos principios, los mismos que en `pisos`:
 *  - un portal caído DEGRADA el resultado, no lo aborta: se guarda lo que
 *    respondieron los demás y el motivo del fallo queda en la búsqueda;
 *  - todo anuncio que se guarda lleva un veredicto de viabilidad. Si no se
 *    puede calcular (farmacia sin coordenadas, motor caído…), el veredicto es
 *    `sin_datos` con su motivo — nunca se pierde el anuncio.
 */

import type { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { getProvider, providersParaTipo } from '../portales';
import type { CriteriosPortal, PortalProvider } from '../portales/types';
import { comprobarPunto } from '../viabilidad';
import {
  Ejecutor,
  marcarRastreo as marcarRastreoDb,
  upsertAnuncio as upsertAnuncioDb,
} from '../db/queries';
import { cumpleCriterios, criteriosDeBusqueda } from './criterios';
import type {
  Anuncio,
  AnuncioCrudo,
  Busqueda,
  PuntoConPrecision,
  ResultadoViabilidad,
  ViabilidadColumnas,
} from '../types/locales';

export interface NovedadAnuncio {
  anuncio: Anuncio;
  /** 'nuevo' = no se había visto nunca; 'bajada' = ya existía y bajó de precio. */
  tipo: 'nuevo' | 'bajada';
}

export interface ResultadoRastreo {
  busquedaId: number;
  busquedaNombre: string;
  encontrados: number;
  guardados: number;
  novedades: NovedadAnuncio[];
  fallos: Array<{ portal: string; motivo: string }>;
  omitidos: Array<{ portal: string; motivo: string }>;
}

export interface OpcionesRastreo {
  maxPaginas?: number;
  /** Si es `false`, se guardan los anuncios pero no se marcan como novedad. */
  notificarNovedades?: boolean;
}

/** Dependencias inyectables — así el test no toca ni red ni base de datos. */
export interface DepsRastreo {
  providersParaTipo: typeof providersParaTipo;
  getProvider: typeof getProvider;
  comprobarPunto: typeof comprobarPunto;
  conectar: () => Promise<Pick<PoolClient, 'query' | 'release'>>;
  upsertAnuncio: typeof upsertAnuncioDb;
  marcarRastreo: (id: number, error: string | null, exec: Ejecutor) => Promise<void>;
}

const DEPS_REALES: DepsRastreo = {
  providersParaTipo,
  getProvider,
  comprobarPunto,
  conectar: () => pool.connect(),
  upsertAnuncio: upsertAnuncioDb,
  marcarRastreo: (id, error, exec) => marcarRastreoDb(id, error, exec),
};

const MAX_PAGINAS_DEFECTO = Number(process.env.LOCALES_PAGINAS_POR_PORTAL) || 2;

export function viabilidadSinDatos(motivo: string): ViabilidadColumnas {
  return {
    veredicto: 'sin_datos',
    veredicto_motivo: motivo,
    distancia_farmacia_m: null,
    farmacia_mas_cercana_id: null,
    distancia_centro_m: null,
    centro_mas_cercano_id: null,
    viabilidad_calculada_en: new Date(),
    viabilidad_motor: null,
  };
}

export function mapearViabilidad(r: ResultadoViabilidad): ViabilidadColumnas {
  const metros = (m: ResultadoViabilidad['farmaciaMasCercana']): number | null =>
    m && m.metros !== null ? Math.round(m.metros) : null;
  return {
    veredicto: r.veredicto,
    veredicto_motivo: r.motivo,
    distancia_farmacia_m: metros(r.farmaciaMasCercana),
    farmacia_mas_cercana_id: r.farmaciaMasCercana?.establecimiento.id ?? null,
    distancia_centro_m: metros(r.centroMasCercano),
    centro_mas_cercano_id: r.centroMasCercano?.establecimiento.id ?? null,
    viabilidad_calculada_en: r.calculadoEn,
    viabilidad_motor: r.motor,
  };
}

function aCriteriosPortal(b: Busqueda): CriteriosPortal {
  return {
    tipo: b.tipo,
    zonaTexto: b.zona_texto ?? b.municipio ?? b.provincia ?? b.comunidad ?? '',
    comunidad: b.comunidad,
    provincia: b.provincia,
    municipio: b.municipio,
    latitud: b.latitud,
    longitud: b.longitud,
    radioKm: b.radio_km,
    precioMin: b.precio_min,
    precioMax: b.precio_max,
    superficieMin: b.superficie_min,
    superficieMax: b.superficie_max,
    pieCalle: b.pie_calle,
    facturacionMin: b.facturacion_min,
    facturacionMax: b.facturacion_max,
  };
}

async function recolectar(
  busqueda: Busqueda,
  maxPaginas: number,
  deps: DepsRastreo,
): Promise<{
  anuncios: AnuncioCrudo[];
  fallos: ResultadoRastreo['fallos'];
  omitidos: ResultadoRastreo['omitidos'];
}> {
  const criterios = aCriteriosPortal(busqueda);
  const anuncios: AnuncioCrudo[] = [];
  const fallos: ResultadoRastreo['fallos'] = [];
  const omitidos: ResultadoRastreo['omitidos'] = [];

  for (const portalId of busqueda.portales ?? []) {
    const provider: PortalProvider | undefined = deps.getProvider(portalId);
    if (!provider) {
      omitidos.push({ portal: portalId, motivo: 'portal desconocido' });
      continue;
    }
    if (provider.tipo !== busqueda.tipo) {
      omitidos.push({ portal: portalId, motivo: `no cubre búsquedas de tipo "${busqueda.tipo}"` });
      continue;
    }

    const disponibilidad = provider.puedeBuscar(criterios);
    if (!disponibilidad.ok) {
      omitidos.push({ portal: portalId, motivo: disponibilidad.motivo });
      continue;
    }

    try {
      anuncios.push(...(await provider.buscar(criterios, { maxPaginas })));
    } catch (err) {
      fallos.push({ portal: portalId, motivo: err instanceof Error ? err.message : String(err) });
    }
  }

  return { anuncios, fallos, omitidos };
}

async function calcularViabilidad(
  crudo: AnuncioCrudo,
  busqueda: Busqueda,
  deps: DepsRastreo,
): Promise<ViabilidadColumnas> {
  if (crudo.latitud === null || crudo.longitud === null) {
    return viabilidadSinDatos('El anuncio no publica una ubicación');
  }

  const punto: PuntoConPrecision = {
    lat: crudo.latitud,
    lng: crudo.longitud,
    precision: crudo.precision,
  };

  try {
    const resultado = await deps.comprobarPunto(punto, {
      comunidad: crudo.comunidad ?? busqueda.comunidad,
      provincia: crudo.provincia ?? busqueda.provincia,
      municipio: crudo.municipio ?? busqueda.municipio,
      sobreescritura: {
        comprobarFarmacias: busqueda.comprobar_farmacias,
        comprobarCentrosSanitarios: busqueda.comprobar_centros_sanitarios,
        // Solo se sobreescribe si la búsqueda fijó un valor: un `null` en la
        // columna significa "hereda el de la comunidad", no "apágalo".
        ...(busqueda.distancia_farmacias_m !== null
          ? { distanciaFarmaciasM: busqueda.distancia_farmacias_m }
          : {}),
        ...(busqueda.distancia_centros_sanitarios_m !== null
          ? { distanciaCentrosSanitariosM: busqueda.distancia_centros_sanitarios_m }
          : {}),
      },
    });
    return mapearViabilidad(resultado);
  } catch (err) {
    // comprobarPunto no debería lanzar por fallos previsibles, pero si lo hace
    // el anuncio se guarda igual con sin_datos.
    return viabilidadSinDatos(
      `No se pudo calcular la viabilidad: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function rastrearBusqueda(
  busqueda: Busqueda,
  opciones: OpcionesRastreo = {},
  deps: DepsRastreo = DEPS_REALES,
): Promise<ResultadoRastreo> {
  const maxPaginas = opciones.maxPaginas ?? MAX_PAGINAS_DEFECTO;
  const criterios = criteriosDeBusqueda(busqueda);
  const { anuncios, fallos, omitidos } = await recolectar(busqueda, maxPaginas, deps);

  const novedades: NovedadAnuncio[] = [];
  let guardados = 0;

  const client = await deps.conectar();
  try {
    for (const crudo of anuncios) {
      if (!cumpleCriterios(crudo, criterios).cumple) continue;

      const viabilidad = await calcularViabilidad(crudo, busqueda, deps);
      const fila = await deps.upsertAnuncio(busqueda.id, crudo, viabilidad, client);
      if (!fila) continue;
      guardados++;

      if (!opciones.notificarNovedades) continue;

      if (fila.es_nuevo) {
        novedades.push({ anuncio: fila, tipo: 'nuevo' });
      } else if (
        fila.precio !== null &&
        fila.precio_anterior !== null &&
        fila.precio < fila.precio_anterior
      ) {
        novedades.push({ anuncio: fila, tipo: 'bajada' });
      }
    }

    const resumenFallos =
      fallos.length > 0 ? fallos.map((f) => `${f.portal}: ${f.motivo}`).join(' | ') : null;
    await deps.marcarRastreo(busqueda.id, resumenFallos, client);
  } finally {
    client.release();
  }

  return {
    busquedaId: busqueda.id,
    busquedaNombre: busqueda.nombre,
    encontrados: anuncios.length,
    guardados,
    novedades,
    fallos,
    omitidos,
  };
}
