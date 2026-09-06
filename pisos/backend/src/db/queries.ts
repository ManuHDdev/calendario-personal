import type { CreateBusquedaInput, UpdateBusquedaInput, UpdateAnuncioInput } from '../schemas/pisos.schema';
import type { AnuncioCrudo, PortalId } from '../types/pisos';

export interface Query {
  text: string;
  values: unknown[];
}

const COLS_BUSQUEDA = `id, nombre, ubicacion, latitud, longitud, radio_km,
                       precio_min, precio_max, metros_min, metros_max,
                       habitaciones_min, banos_min,
                       exige_ascensor, exige_garaje, exige_terraza,
                       excluir_palabras, portales, habilitada, notificar,
                       ultimo_rastreo_at, ultimo_rastreo_error,
                       created_at, updated_at`;

const COLS_ANUNCIO = `id, busqueda_id, portal, portal_id, url, titulo,
                      precio, precio_inicial, precio_previo, precio_notificado,
                      metros, habitaciones, banos,
                      planta, ascensor, garaje, terraza, ubicacion,
                      latitud, longitud, imagen_url,
                      visto, descartado, notificado_at, visto_ultima_vez_at,
                      created_at, updated_at`;

// ── Búsquedas ────────────────────────────────────────────────────────────────

export function listBusquedas(): Query {
  return {
    text: `SELECT ${COLS_BUSQUEDA} FROM busqueda WHERE activo = true ORDER BY created_at DESC`,
    values: [],
  };
}

/** Las que el planificador debe rastrear: activas Y no pausadas por el propietario. */
export function listBusquedasRastreables(): Query {
  return {
    text: `SELECT ${COLS_BUSQUEDA}
             FROM busqueda
            WHERE activo = true AND habilitada = true
            ORDER BY created_at ASC`,
    values: [],
  };
}

export function getBusquedaById(id: string): Query {
  return {
    text: `SELECT ${COLS_BUSQUEDA} FROM busqueda WHERE id = $1 AND activo = true`,
    values: [id],
  };
}

export function createBusqueda(data: CreateBusquedaInput): Query {
  return {
    text: `INSERT INTO busqueda
             (nombre, ubicacion, latitud, longitud, radio_km,
              precio_min, precio_max, metros_min, metros_max,
              habitaciones_min, banos_min,
              exige_ascensor, exige_garaje, exige_terraza,
              excluir_palabras, portales, habilitada, notificar)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           RETURNING ${COLS_BUSQUEDA}`,
    values: [
      data.nombre,
      data.ubicacion,
      data.latitud ?? null,
      data.longitud ?? null,
      data.radio_km ?? null,
      data.precio_min ?? null,
      data.precio_max ?? null,
      data.metros_min ?? null,
      data.metros_max ?? null,
      data.habitaciones_min ?? null,
      data.banos_min ?? null,
      data.exige_ascensor ?? false,
      data.exige_garaje ?? false,
      data.exige_terraza ?? false,
      data.excluir_palabras ?? null,
      JSON.stringify(data.portales),
      data.habilitada ?? true,
      data.notificar ?? true,
    ],
  };
}

/**
 * UPDATE parcial construido desde una allowlist fija de columnas: una clave
 * inesperada del body nunca puede llegar al texto SQL, y todo valor va
 * parametrizado.
 */
export function updateBusqueda(id: string, data: UpdateBusquedaInput): Query {
  const allowed: Array<keyof UpdateBusquedaInput> = [
    'nombre', 'ubicacion', 'latitud', 'longitud', 'radio_km',
    'precio_min', 'precio_max', 'metros_min', 'metros_max',
    'habitaciones_min', 'banos_min',
    'exige_ascensor', 'exige_garaje', 'exige_terraza',
    'excluir_palabras', 'portales', 'habilitada', 'notificar',
  ];

  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const column of allowed) {
    const value = data[column];
    if (value === undefined) continue;
    values.push(column === 'portales' ? JSON.stringify(value) : value);
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) {
    throw new Error('Se debe enviar al menos un campo a actualizar');
  }

  values.push(id);
  return {
    text: `UPDATE busqueda SET ${assignments.join(', ')}
            WHERE id = $${values.length} AND activo = true
        RETURNING ${COLS_BUSQUEDA}`,
    values,
  };
}

/** Borrado lógico, regla global del monorepo: nunca un DELETE físico. */
export function deleteBusqueda(id: string): Query {
  return {
    text: `UPDATE busqueda SET activo = false, deleted_at = NOW()
            WHERE id = $1 AND activo = true RETURNING id`,
    values: [id],
  };
}

export function marcarRastreo(id: string, error: string | null): Query {
  return {
    text: `UPDATE busqueda SET ultimo_rastreo_at = NOW(), ultimo_rastreo_error = $2
            WHERE id = $1 RETURNING id`,
    values: [id, error],
  };
}

// ── Anuncios ─────────────────────────────────────────────────────────────────

export interface FiltroAnuncios {
  busquedaId?: string;
  /** Portal de origen. El valor lo valida la ruta contra PORTALES. */
  portal?: PortalId;
  soloNuevos?: boolean;
  incluirDescartados?: boolean;
  limite?: number;
}

export function listAnuncios(filtro: FiltroAnuncios): Query {
  // b.activo: al borrar (logicamente) una busqueda, sus anuncios dejan de
  // listarse. Sin esto seguirian apareciendo en el feed, porque el borrado
  // logico de la busqueda no toca las filas de anuncio.
  const where = ['a.activo = true', 'b.activo = true'];
  const values: unknown[] = [];

  if (filtro.busquedaId) {
    values.push(filtro.busquedaId);
    where.push(`a.busqueda_id = $${values.length}`);
  }
  if (filtro.portal) {
    values.push(filtro.portal);
    where.push(`a.portal = $${values.length}`);
  }
  if (filtro.soloNuevos) where.push('a.visto = false');
  if (!filtro.incluirDescartados) where.push('a.descartado = false');

  values.push(Math.min(Math.max(filtro.limite ?? 200, 1), 500));

  return {
    text: `SELECT ${COLS_ANUNCIO.split(',').map((c) => `a.${c.trim()}`).join(', ')},
                  b.nombre AS busqueda_nombre
             FROM anuncio a
             JOIN busqueda b ON b.id = a.busqueda_id
            WHERE ${where.join(' AND ')}
            ORDER BY a.created_at DESC
            LIMIT $${values.length}`,
    values,
  };
}

export function updateAnuncio(id: string, data: UpdateAnuncioInput): Query {
  const allowed: Array<keyof UpdateAnuncioInput> = ['visto', 'descartado'];
  const assignments: string[] = [];
  const values: unknown[] = [];

  for (const column of allowed) {
    if (data[column] === undefined) continue;
    values.push(data[column]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (assignments.length === 0) {
    throw new Error('Se debe enviar al menos un campo a actualizar');
  }

  values.push(id);
  return {
    text: `UPDATE anuncio SET ${assignments.join(', ')}
            WHERE id = $${values.length} AND activo = true
        RETURNING ${COLS_ANUNCIO}`,
    values,
  };
}

/**
 * Marca como vistos los anuncios que encajan en el filtro.
 *
 * Recibe el mismo filtro que el listado a proposito: el boton dice "marcar
 * todo como visto" estando el usuario mirando una vista ya acotada, y marcar
 * ademas lo que no esta viendo seria una sorpresa desagradable — sobre todo
 * porque `visto` es lo que decide si un anuncio destaca como novedad.
 */
export function marcarTodosVistos(filtro: Pick<FiltroAnuncios, 'busquedaId' | 'portal'>): Query {
  const where = ['activo = true', 'visto = false'];
  const values: unknown[] = [];

  if (filtro.busquedaId) {
    values.push(filtro.busquedaId);
    where.push(`busqueda_id = $${values.length}`);
  }
  if (filtro.portal) {
    values.push(filtro.portal);
    where.push(`portal = $${values.length}`);
  }

  return {
    text: `UPDATE anuncio SET visto = true
            WHERE ${where.join(' AND ')}
        RETURNING id`,
    values,
  };
}

export function deleteAnuncio(id: string): Query {
  return {
    text: `UPDATE anuncio SET activo = false, deleted_at = NOW()
            WHERE id = $1 AND activo = true RETURNING id`,
    values: [id],
  };
}

/**
 * Alta o refresco de un anuncio en una sola ida y vuelta.
 *
 * El UPSERT es lo que hace el rastreo idempotente: volver a ver el mismo
 * anuncio refresca precio y `visto_ultima_vez_at` sin resucitar su estado de
 * visto/descartado y sin duplicar la fila. `xmax = 0` es el truco estándar de
 * Postgres para saber si la fila se INSERTÓ (novedad real que hay que
 * notificar) o se ACTUALIZÓ.
 *
 * `precio_previo` se calcula dentro del propio DO UPDATE, donde `anuncio.x`
 * es el valor ANTERIOR de la fila: así la bajada de precio se detecta con un
 * valor guardado y explícito, en vez de depender de que una subconsulta del
 * RETURNING no vea los cambios de su propio comando.
 */
export function upsertAnuncio(busquedaId: string, a: AnuncioCrudo): Query {
  return {
    text: `INSERT INTO anuncio
             (busqueda_id, portal, portal_id, url, titulo,
              precio, precio_inicial, precio_notificado,
              metros, habitaciones, banos, planta, ascensor, garaje, terraza,
              ubicacion, latitud, longitud, imagen_url)
           VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (busqueda_id, portal, portal_id) DO UPDATE
              SET url = EXCLUDED.url,
                  titulo = EXCLUDED.titulo,
                  precio = EXCLUDED.precio,
                  precio_previo = CASE
                      WHEN EXCLUDED.precio IS DISTINCT FROM anuncio.precio
                      THEN anuncio.precio
                      ELSE anuncio.precio_previo
                  END,
                  metros = COALESCE(EXCLUDED.metros, anuncio.metros),
                  habitaciones = COALESCE(EXCLUDED.habitaciones, anuncio.habitaciones),
                  banos = COALESCE(EXCLUDED.banos, anuncio.banos),
                  planta = COALESCE(EXCLUDED.planta, anuncio.planta),
                  ascensor = COALESCE(EXCLUDED.ascensor, anuncio.ascensor),
                  garaje = COALESCE(EXCLUDED.garaje, anuncio.garaje),
                  terraza = COALESCE(EXCLUDED.terraza, anuncio.terraza),
                  ubicacion = COALESCE(EXCLUDED.ubicacion, anuncio.ubicacion),
                  latitud = COALESCE(EXCLUDED.latitud, anuncio.latitud),
                  longitud = COALESCE(EXCLUDED.longitud, anuncio.longitud),
                  imagen_url = COALESCE(EXCLUDED.imagen_url, anuncio.imagen_url),
                  visto_ultima_vez_at = NOW(),
                  -- Un anuncio que reaparece tras un borrado lógico vuelve a
                  -- estar activo; su estado de visto/descartado no se toca.
                  activo = true,
                  deleted_at = NULL
        RETURNING ${COLS_ANUNCIO}, (xmax = 0) AS es_nuevo`,
    values: [
      busquedaId,
      a.portal,
      a.portalId,
      a.url,
      a.titulo,
      a.precio,
      a.metros,
      a.habitaciones,
      a.banos,
      a.planta,
      a.ascensor,
      a.garaje,
      a.terraza,
      a.ubicacion,
      a.latitud,
      a.longitud,
      a.imagenUrl,
    ],
  };
}

/**
 * Marca un anuncio como avisado y FIJA LA NUEVA REFERENCIA de precio.
 *
 * Las dos cosas van juntas y en el mismo UPDATE a proposito: mover
 * `precio_notificado` es lo que impide que la misma bajada se vuelva a contar
 * en la siguiente vuelta. Y como esto solo se llama cuando Telegram ha
 * aceptado el mensaje, un envio fallido deja la referencia intacta y el aviso
 * se reintenta, en vez de perderse.
 */
export function marcarNotificado(id: string): Query {
  return {
    text: `UPDATE anuncio
              SET notificado_at = NOW(), precio_notificado = precio
            WHERE id = $1
        RETURNING id`,
    values: [id],
  };
}

// ── Estado del rastreador ────────────────────────────────────────────────────

export function getScraperState(): Query {
  return { text: `SELECT running, updated_at FROM scraper_state WHERE id = 1`, values: [] };
}

export function setScraperState(running: boolean): Query {
  return {
    text: `UPDATE scraper_state SET running = $1 WHERE id = 1 RETURNING running, updated_at`,
    values: [running],
  };
}
