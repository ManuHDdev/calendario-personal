import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { CIUDADES_AIRBNB, esCiudadAirbnbSoportada } from '../services/airbnbCiudades';
import {
  alquilerTuristicoResumenQuerySchema,
  alquilerTuristicoBarriosQuerySchema,
} from '../schemas/alquilerTuristico.schema';

const ROLES_LECTURA = ['admin', 'invitado'];

/**
 * `pg` NO devuelve una columna `DATE` como string: la parsea a un objeto
 * `Date` de JS (construido con hora LOCAL del proceso, `new Date(y, m-1,
 * d)`, no UTC — por eso aquí se leen los componentes con los getters
 * locales, nunca `getUTCFullYear`/`toISOString`, que en un proceso con
 * timezone distinta de UTC desplazarían la fecha un día). Bug real
 * detectado en producción (2026-09-24): `agruparPorSnapshot` comparaba
 * `snapshot_date` con `.localeCompare`, que no existe en `Date` — solo
 * pasaba desapercibido en otras rutas de finanzas (p. ej.
 * `precios-vivienda/capital`) porque ahí la fecha nunca se manipula como
 * string en el backend, solo se reenvía tal cual y Fastify la serializa a
 * ISO por su cuenta al hacer `reply.send()`.
 */
export function fechaSqlAString(valor: unknown): string {
  if (valor instanceof Date) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(valor);
}

interface FilaAgregada {
  snapshot_date: Date | string; // pg devuelve DATE como Date, no string — ver fechaSqlAString
  tipo_habitacion: string | null;
  mediana_precio: string | null;
  num_anuncios: string;
  ocupacion_estimada_pct: string | null;
}

interface PuntoResumen {
  snapshotDate: string;
  medianaPrecioNoche: number | null;
  numAnuncios: number;
  ocupacionEstimadaPct: number | null;
  porTipoHabitacion: { tipoHabitacion: string; medianaPrecioNoche: number | null; numAnuncios: number }[];
}

/**
 * Agrega las filas (una por snapshot_date × tipo_habitacion) en un punto por
 * snapshot_date, con el desglose por tipo dentro. La mediana/ocupación
 * "overall" de cada punto se recalcula aparte (ver la ruta) porque no es la
 * media ponderada de las medianas por tipo — una mediana no se puede
 * recomponer así.
 */
function agruparPorSnapshot(filas: FilaAgregada[], overall: Map<string, { mediana: number | null; ocupacion: number | null; total: number }>): PuntoResumen[] {
  const porFecha = new Map<string, PuntoResumen>();

  for (const fila of filas) {
    const snapshotDate = fechaSqlAString(fila.snapshot_date);
    if (!porFecha.has(snapshotDate)) {
      const datosOverall = overall.get(snapshotDate);
      porFecha.set(snapshotDate, {
        snapshotDate,
        medianaPrecioNoche: datosOverall?.mediana ?? null,
        numAnuncios: datosOverall?.total ?? 0,
        ocupacionEstimadaPct: datosOverall?.ocupacion ?? null,
        porTipoHabitacion: [],
      });
    }
    porFecha.get(snapshotDate)!.porTipoHabitacion.push({
      tipoHabitacion: fila.tipo_habitacion ?? 'Desconocido',
      medianaPrecioNoche: fila.mediana_precio === null ? null : Number(fila.mediana_precio),
      numAnuncios: Number(fila.num_anuncios),
    });
  }

  return [...porFecha.values()].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
}

export async function alquilerTuristicoRoutes(app: FastifyInstance): Promise<void> {
  // GET /alquiler-turistico/ciudades
  app.get(
    '/alquiler-turistico/ciudades',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (_request, reply: FastifyReply) => {
      try {
        const result = await pool.query<{ ciudad: string }>(
          `SELECT DISTINCT ciudad FROM alquiler_turistico_listing`,
        );
        const conDatos = new Set(result.rows.map((r) => r.ciudad));
        const ciudades = CIUDADES_AIRBNB.filter((c) => conDatos.has(c.slug));
        return reply.send(ciudades);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /alquiler-turistico/barrios?ciudad=
  app.get<{ Querystring: { ciudad?: string } }>(
    '/alquiler-turistico/barrios',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = alquilerTuristicoBarriosQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      if (!esCiudadAirbnbSoportada(parsed.data.ciudad)) {
        return reply.code(400).send({ error: `ciudad desconocida: "${parsed.data.ciudad}"`, statusCode: 400 });
      }

      try {
        const result = await pool.query<{ barrio: string }>(
          `SELECT DISTINCT barrio FROM alquiler_turistico_listing
           WHERE ciudad = $1 AND barrio IS NOT NULL
           ORDER BY barrio`,
          [parsed.data.ciudad],
        );
        return reply.send(result.rows.map((r) => r.barrio));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /alquiler-turistico/resumen?ciudad=&barrio=
  app.get<{ Querystring: { ciudad?: string; barrio?: string } }>(
    '/alquiler-turistico/resumen',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (request, reply: FastifyReply) => {
      const parsed = alquilerTuristicoResumenQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validación fallida', statusCode: 400 });
      }
      if (!esCiudadAirbnbSoportada(parsed.data.ciudad)) {
        return reply.code(400).send({ error: `ciudad desconocida: "${parsed.data.ciudad}"`, statusCode: 400 });
      }

      try {
        const filtroBarrio = parsed.data.barrio ? 'AND barrio = $2' : '';
        const valores = parsed.data.barrio ? [parsed.data.ciudad, parsed.data.barrio] : [parsed.data.ciudad];

        // Agregado "overall" por snapshot: mediana de precio (excluyendo
        // nulos, nunca tratados como 0 — ver airbnbCsvParser.ts) y
        // ocupación ESTIMADA a partir de disponibilidad_365 (excluyendo
        // anuncios sin ese dato). PERCENTILE_CONT calcula la mediana real
        // en el propio motor, sin traer cada fila a Node.
        const overallResult = await pool.query<{
          snapshot_date: Date | string; // pg devuelve DATE como Date — ver fechaSqlAString
          mediana_precio: string | null;
          num_anuncios: string;
          ocupacion_estimada_pct: string | null;
        }>(
          `SELECT
             snapshot_date,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_noche) FILTER (WHERE precio_noche IS NOT NULL) AS mediana_precio,
             COUNT(*) AS num_anuncios,
             AVG((365.0 - disponibilidad_365) / 365.0 * 100) FILTER (WHERE disponibilidad_365 IS NOT NULL) AS ocupacion_estimada_pct
           FROM alquiler_turistico_listing
           WHERE ciudad = $1 ${filtroBarrio}
           GROUP BY snapshot_date`,
          valores,
        );

        const overall = new Map(
          overallResult.rows.map((r) => [
            fechaSqlAString(r.snapshot_date),
            {
              mediana: r.mediana_precio === null ? null : Number(r.mediana_precio),
              ocupacion: r.ocupacion_estimada_pct === null ? null : Number(r.ocupacion_estimada_pct),
              total: Number(r.num_anuncios),
            },
          ]),
        );

        const porTipoResult = await pool.query<FilaAgregada>(
          `SELECT
             snapshot_date,
             tipo_habitacion,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_noche) FILTER (WHERE precio_noche IS NOT NULL) AS mediana_precio,
             COUNT(*) AS num_anuncios,
             NULL AS ocupacion_estimada_pct
           FROM alquiler_turistico_listing
           WHERE ciudad = $1 ${filtroBarrio}
           GROUP BY snapshot_date, tipo_habitacion`,
          valores,
        );

        const puntos = agruparPorSnapshot(porTipoResult.rows, overall);
        return reply.send({ ciudad: parsed.data.ciudad, barrio: parsed.data.barrio ?? null, puntos });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /alquiler-turistico/estado
  app.get(
    '/alquiler-turistico/estado',
    { preHandler: authMiddleware(ROLES_LECTURA) },
    async (_request, reply: FastifyReply) => {
      try {
        const result = await pool.query(
          `SELECT ultima_ejecucion, ultima_ejecucion_ok, filas_importadas, error FROM alquiler_turistico_estado WHERE id = 1`,
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Sin estado de importación registrado', statusCode: 404 });
        }
        return reply.send(result.rows[0]);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
