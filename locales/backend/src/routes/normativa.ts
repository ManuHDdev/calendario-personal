import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { normativaPatchSchema } from '../schemas/locales.schema';
import { listNormativa } from '../db/queries';
import { pool } from '../db/pool';

export async function rutasNormativa(app: FastifyInstance): Promise<void> {
  /**
   * Las distancias legales son dato editable, no constantes.
   *
   * Se devuelve `verificado` sin adornos: distingue lo comprobado contra la
   * norma autonómica de lo que solo hereda el mínimo estatal. La UI lo enseña
   * en vez de aparentar que todas las filas valen lo mismo.
   */
  app.get('/locales/api/normativa', { preHandler: authMiddleware(['admin']) }, async () => {
    const filas = await listNormativa();
    return filas.map((f) => ({
      comunidad: f.comunidad,
      zonaExcepcion: f.zona_excepcion,
      distanciaFarmaciasM: f.distancia_farmacias_m,
      distanciaCentrosSanitariosM: f.distancia_centros_sanitarios_m,
      verificado: f.verificado,
      fuenteUrl: f.fuente_url,
      notas: f.notas,
    }));
  });

  app.patch<{ Params: { comunidad: string } }>(
    '/locales/api/normativa/:comunidad',
    { preHandler: authMiddleware(['admin']) },
    async (request, reply) => {
      const parsed = normativaPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
      }
      const d = parsed.data;

      const { rowCount } = await pool.query(
        `UPDATE normativa SET
           distancia_farmacias_m = COALESCE($2, distancia_farmacias_m),
           distancia_centros_sanitarios_m =
             CASE WHEN $3::boolean THEN $4 ELSE distancia_centros_sanitarios_m END,
           verificado = COALESCE($5, verificado),
           fuente_url = CASE WHEN $6::boolean THEN $7 ELSE fuente_url END,
           notas      = CASE WHEN $8::boolean THEN $9 ELSE notas END
         WHERE activo AND comunidad = $1 AND zona_excepcion IS NULL`,
        [
          request.params.comunidad,
          d.distanciaFarmaciasM ?? null,
          d.distanciaCentrosSanitariosM !== undefined,
          d.distanciaCentrosSanitariosM ?? null,
          d.verificado ?? null,
          d.fuenteUrl !== undefined,
          d.fuenteUrl ?? null,
          d.notas !== undefined,
          d.notas ?? null,
        ],
      );

      if (!rowCount) return reply.code(404).send({ error: 'Comunidad no encontrada' });
      return { ok: true };
    },
  );
}
