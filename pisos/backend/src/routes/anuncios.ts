import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import { updateAnuncioSchema, updateScraperStateSchema } from '../schemas/pisos.schema';
import {
  listAnuncios,
  updateAnuncio,
  deleteAnuncio,
  marcarTodosVistos,
  getScraperState,
  setScraperState,
} from '../db/queries';
import { normalizarFila } from '../db/filas';
import { precioPorMetro } from '../services/criterios';
import { PORTALES, type Anuncio, type PortalId, type ScraperState } from '../types/pisos';

const SOLO_ADMIN = ['admin'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface FilaAnuncio extends Anuncio {
  busqueda_nombre: string;
}

/** El €/m² se calcula aquí y no se guarda: es derivado del precio, que cambia. */
function aDto(fila: FilaAnuncio) {
  const anuncio = normalizarFila(fila);
  return { ...anuncio, precio_m2: precioPorMetro(anuncio.precio, anuncio.metros) };
}

export async function anunciosRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      busqueda?: string;
      portal?: string;
      nuevos?: string;
      descartados?: string;
      limite?: string;
    };
  }>(
    '/listings',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      const { busqueda, portal, nuevos, descartados, limite } = request.query;

      if (busqueda && !UUID.test(busqueda)) {
        return reply.code(400).send({ error: 'busqueda no es un ID válido', statusCode: 400 });
      }
      // Se rechaza un portal desconocido en vez de ignorarlo: filtrar por algo
      // que no existe devolveria una lista vacia indistinguible de "no hay
      // nada", y el usuario creeria que no hay anuncios de esa fuente.
      if (portal && !PORTALES.includes(portal as PortalId)) {
        return reply.code(400).send({
          error: `portal debe ser uno de: ${PORTALES.join(', ')}`,
          statusCode: 400,
        });
      }

      try {
        const { text, values } = listAnuncios({
          busquedaId: busqueda,
          portal: portal as PortalId | undefined,
          soloNuevos: nuevos === 'true',
          incluirDescartados: descartados === 'true',
          limite: limite ? Number(limite) : undefined,
        });
        const { rows } = await pool.query<FilaAnuncio>(text, values);
        return reply.send(rows.map(aDto));
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/listings/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      if (!UUID.test(request.params.id)) {
        return reply.code(400).send({ error: 'ID no válido', statusCode: 400 });
      }
      const parsed = updateAnuncioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: parsed.error.issues[0]?.message ?? 'Validación fallida',
          statusCode: 400,
        });
      }
      try {
        const { text, values } = updateAnuncio(request.params.id, parsed.data);
        const { rows } = await pool.query<Anuncio>(text, values);
        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Anuncio no encontrado', statusCode: 404 });
        }
        return reply.send(normalizarFila(rows[0]));
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  /** "Marcar todo como visto", opcionalmente acotado a una búsqueda. */
  app.post<{ Body: { busqueda_id?: string; portal?: string } }>(
    '/listings/marcar-vistos',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      const busquedaId = request.body?.busqueda_id;
      const portal = request.body?.portal;
      if (busquedaId && !UUID.test(busquedaId)) {
        return reply.code(400).send({ error: 'busqueda_id no es un ID válido', statusCode: 400 });
      }
      if (portal && !PORTALES.includes(portal as PortalId)) {
        return reply.code(400).send({
          error: `portal debe ser uno de: ${PORTALES.join(', ')}`,
          statusCode: 400,
        });
      }
      try {
        const { text, values } = marcarTodosVistos({
          busquedaId,
          portal: portal as PortalId | undefined,
        });
        const { rowCount } = await pool.query(text, values);
        return reply.send({ marcados: rowCount ?? 0 });
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/listings/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply: FastifyReply) => {
      if (!UUID.test(request.params.id)) {
        return reply.code(400).send({ error: 'ID no válido', statusCode: 400 });
      }
      try {
        const { text, values } = deleteAnuncio(request.params.id);
        const { rows } = await pool.query(text, values);
        if (rows.length === 0) {
          return reply.code(404).send({ error: 'Anuncio no encontrado', statusCode: 404 });
        }
        return reply.code(204).send();
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
      }
    },
  );

  // ── On/off global del rastreador ───────────────────────────────────────────

  app.get('/scraper/state', { preHandler: authMiddleware(SOLO_ADMIN) }, async (request, reply) => {
    try {
      const { text, values } = getScraperState();
      const { rows } = await pool.query<ScraperState>(text, values);
      return reply.send(rows[0]);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
  });

  app.patch('/scraper/state', { preHandler: authMiddleware(SOLO_ADMIN) }, async (request, reply) => {
    const parsed = updateScraperStateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: parsed.error.issues[0]?.message ?? 'Validación fallida',
        statusCode: 400,
      });
    }
    try {
      const { text, values } = setScraperState(parsed.data.running);
      const { rows } = await pool.query<ScraperState>(text, values);
      return reply.send(rows[0]);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Error interno', statusCode: 500 });
    }
  });
}
