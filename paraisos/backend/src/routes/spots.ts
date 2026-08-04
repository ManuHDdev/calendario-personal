import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { spotCreateSchema, spotUpdateSchema, parkingSchema } from '../schemas/spot.schema';
import {
  listSpots,
  getSpotById,
  createSpot,
  updateSpot,
  deleteSpot,
  getStats,
  getRegions,
  getParkingBySpotId,
  createParking,
  updateParking,
  deleteParking,
} from '../db/queries';
import type { Spot, ParkingSpot } from '../types/spot';

/** Excluye activo y deleted_at del objeto devuelto al cliente. */
function toSpotDto(row: Spot & { activo?: boolean; deleted_at?: string | null }) {
  const { activo: _a, deleted_at: _d, ...dto } = row as unknown as Record<string, unknown>;
  return dto;
}

/** Excluye activo y deleted_at del parking devuelto al cliente. */
function toParkingDto(row: ParkingSpot & { activo?: boolean; deleted_at?: string | null }) {
  const { activo: _a, deleted_at: _d, ...dto } = row as unknown as Record<string, unknown>;
  return dto;
}

export async function spotsRoutes(app: FastifyInstance): Promise<void> {
  // ─── Rutas publicas (sin auth) ────────────────────────────────

  // GET /spots/stats — registrado ANTES de /spots/:id para evitar
  // que Fastify lo interprete como parametro :id = "stats"
  app.get('/spots/stats', async (_request, reply: FastifyReply) => {
    try {
      const { text, values } = getStats();
      const result = await pool.query(text, values);

      const stats: Record<string, number> = { piscinas: 0, rutas: 0, playas: 0 };
      for (const row of result.rows) {
        const cat = row.categoria as string;
        if (cat === 'piscina') stats.piscinas = row.total;
        else if (cat === 'ruta') stats.rutas = row.total;
        else if (cat === 'playa') stats.playas = row.total;
      }

      return reply.send(stats);
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /spots/regions
  app.get('/spots/regions', async (_request, reply: FastifyReply) => {
    try {
      const { text, values } = getRegions();
      const result = await pool.query(text, values);
      return reply.send(result.rows.map((r: { region: string }) => r.region));
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /spots
  app.get(
    '/spots',
    async (request: FastifyRequest<{ Querystring: { categoria?: string } }>, reply: FastifyReply) => {
      try {
        const categoria = (request.query as { categoria?: string }).categoria;
        const { text, values } = listSpots(categoria);
        const result = await pool.query<Spot>(text, values);
        return reply.send(result.rows.map(toSpotDto));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // GET /spots/:id — includes parking data
  app.get<{ Params: { id: string } }>('/spots/:id', async (request, reply: FastifyReply) => {
    const id = Number(request.params.id);
    if (Number.isNaN(id)) {
      return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
    }
    try {
      const { text, values } = getSpotById(id);
      const result = await pool.query<Spot>(text, values);
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Spot no encontrado', statusCode: 404 });
      }

      const parkingQuery = getParkingBySpotId(id);
      const parkingResult = await pool.query(parkingQuery.text, parkingQuery.values);

      const spotDto = toSpotDto(result.rows[0]);
      return reply.send({
        ...spotDto,
        parking: parkingResult.rows.length > 0 ? toParkingDto(parkingResult.rows[0]) : null,
      });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // ─── Rutas admin (Keycloak JWT + rol admin) ───────────────────

  // POST /spots
  app.post('/spots', { preHandler: authMiddleware(['admin', 'paraisos_admin']) }, async (request, reply: FastifyReply) => {
    const parsed = spotCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validacion fallida', statusCode: 400 });
    }
    try {
      const { text, values } = createSpot(parsed.data);
      const result = await pool.query<Spot>(text, values);
      return reply.code(201).send(toSpotDto(result.rows[0]));
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // PATCH /spots/:id
  app.patch<{ Params: { id: string } }>(
    '/spots/:id',
    { preHandler: authMiddleware(['admin', 'paraisos_admin']) },
    async (request, reply: FastifyReply) => {
      const parsed = spotUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validacion fallida', statusCode: 400 });
      }

      const id = Number(request.params.id);
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }
      try {
        const check = await pool.query('SELECT id FROM spot WHERE id = $1 AND activo = true', [id]);
        if (check.rows.length === 0) {
          return reply.code(404).send({ error: 'Spot no encontrado', statusCode: 404 });
        }

        const { text, values } = updateSpot(id, parsed.data);
        const result = await pool.query<Spot>(text, values);
        return reply.send(toSpotDto(result.rows[0]));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /spots/:id — soft delete
  app.delete<{ Params: { id: string } }>(
    '/spots/:id',
    { preHandler: authMiddleware(['admin', 'paraisos_admin']) },
    async (request, reply: FastifyReply) => {
      const id = Number(request.params.id);
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }
      try {
        const { text, values } = deleteSpot(id);
        const result = await pool.query(text, values);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Spot no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // ─── Parking routes ───────────────────────────────────────────

  // PUT /spots/:id/parking — create or update
  app.put<{ Params: { id: string } }>(
    '/spots/:id/parking',
    { preHandler: authMiddleware(['admin', 'paraisos_admin']) },
    async (request, reply: FastifyReply) => {
      const id = Number(request.params.id);
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }

      const parsed = parkingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Validacion fallida', statusCode: 400 });
      }

      try {
        const spotCheck = await pool.query('SELECT id FROM spot WHERE id = $1 AND activo = true', [id]);
        if (spotCheck.rows.length === 0) {
          return reply.code(404).send({ error: 'Spot no encontrado', statusCode: 404 });
        }

        const existingQuery = getParkingBySpotId(id);
        const existing = await pool.query(existingQuery.text, existingQuery.values);

        let result;
        if (existing.rows.length > 0) {
          const q = updateParking(id, parsed.data);
          result = await pool.query(q.text, q.values);
        } else {
          const q = createParking(id, parsed.data);
          result = await pool.query(q.text, q.values);
        }
        return reply.send(toParkingDto(result.rows[0]));
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );

  // DELETE /spots/:id/parking — soft delete
  app.delete<{ Params: { id: string } }>(
    '/spots/:id/parking',
    { preHandler: authMiddleware(['admin', 'paraisos_admin']) },
    async (request, reply: FastifyReply) => {
      const id = Number(request.params.id);
      if (Number.isNaN(id)) {
        return reply.code(400).send({ error: 'ID debe ser un numero valido', statusCode: 400 });
      }

      try {
        const q = deleteParking(id);
        const result = await pool.query(q.text, q.values);
        if (result.rows.length === 0) {
          return reply.code(404).send({ error: 'Aparcamiento no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
      }
    },
  );
}
