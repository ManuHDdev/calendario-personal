import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { setPreferenciaSchema } from '../schemas/preferences.schema';
import { geocodeCiudad } from '../services/geocoding';

const CACERES = { ciudad: 'Cáceres', latitud: 39.4753, longitud: -6.3724 };

export async function preferencesRoutes(app: FastifyInstance): Promise<void> {

  // GET /api/preferences — ciudad preferida del usuario autenticado
  app.get(
    '/preferences',
    { preHandler: authMiddleware(['admin', 'familia']) },
    async (request, reply: FastifyReply) => {
      try {
        const userId = request.user!.sub as string;
        const result = await pool.query(
          'SELECT ciudad_preferida AS ciudad, latitud, longitud FROM user_preferences WHERE user_id = $1',
          [userId],
        );
        if (result.rows.length === 0) {
          return reply.send(CACERES);
        }
        const row = result.rows[0];
        return reply.send({ ciudad: row.ciudad, latitud: Number(row.latitud), longitud: Number(row.longitud) });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // PUT /api/preferences — cambia la ciudad preferida (geocodificada)
  app.put(
    '/preferences',
    { preHandler: authMiddleware(['admin', 'familia']) },
    async (request, reply: FastifyReply) => {
      const parsed = setPreferenciaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }

      const userId = request.user!.sub as string;
      const { ciudad } = parsed.data;

      let coords;
      try {
        coords = await geocodeCiudad(ciudad);
      } catch (err) {
        return reply.code(502).send({
          error: err instanceof Error ? err.message : 'No se pudo geolocalizar la ciudad',
          statusCode: 502,
        });
      }

      try {
        await pool.query(
          `INSERT INTO user_preferences (user_id, ciudad_preferida, latitud, longitud, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET ciudad_preferida = EXCLUDED.ciudad_preferida,
               latitud = EXCLUDED.latitud,
               longitud = EXCLUDED.longitud,
               updated_at = NOW()`,
          [userId, ciudad, coords.latitud, coords.longitud],
        );
        return reply.send({ ciudad, latitud: coords.latitud, longitud: coords.longitud });
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
