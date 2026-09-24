import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { CIUDADES_AIRBNB, esCiudadAirbnbSoportada } from '../services/airbnbCiudades';
import {
  alquilerTuristicoResumenQuerySchema,
  alquilerTuristicoBarriosQuerySchema,
} from '../schemas/alquilerTuristico.schema';

const ROLES_LECTURA = ['admin', 'invitado'];

interface FilaAgregada {
  snapshot_date: string;
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
    if (!porFecha.has(fila.snapshot_date)) {
      const datosOverall = overall.get(fila.snapshot_date);
      porFecha.set(fila.snapshot_date, {
        snapshotDate: fila.snapshot_date,
        medianaPrecioNoche: datosOverall?.mediana ?? null,
        numAnuncios: datosOverall?.total ?? 0,
        ocupacionEstimadaPct: datosOverall?.ocupacion ?? null,
        porTipoHabitacion: [],
      });
    }
    porFecha.get(fila.snapshot_date)!.porTipoHabitacion.push({
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
          snapshot_date: string;
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
            r.snapshot_date,
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
