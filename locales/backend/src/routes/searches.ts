import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import {
  crearBusquedaSchema,
  actualizarBusquedaSchema,
} from '../schemas/locales.schema';
import {
  listBusquedas,
  getBusqueda,
  crearBusqueda,
  actualizarBusqueda,
  borrarBusqueda,
} from '../db/queries';
import { rastrearBusqueda } from '../services/rastreo';

const SOLO_ADMIN = ['admin'];

/** `busqueda.id` es SERIAL: se valida como entero, no como UUID. */
function idValido(bruto: string): number | null {
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function rutasBusquedas(app: FastifyInstance): Promise<void> {
  app.get('/locales/api/searches', { preHandler: authMiddleware(SOLO_ADMIN) }, async () => {
    return listBusquedas();
  });

  app.post('/locales/api/searches', { preHandler: authMiddleware(SOLO_ADMIN) }, async (request, reply) => {
    const parsed = crearBusquedaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
    }
    const creada = await crearBusqueda(parsed.data as never);
    return reply.code(201).send(creada);
  });

  app.patch<{ Params: { id: string } }>(
    '/locales/api/searches/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply) => {
      const id = idValido(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'ID no válido' });

      const parsed = actualizarBusquedaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
      }
      const { tipo: _tipo, ...campos } = parsed.data as Record<string, unknown>;
      const actualizada = await actualizarBusqueda(id, campos);
      if (!actualizada) return reply.code(404).send({ error: 'Búsqueda no encontrada' });
      return actualizada;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/locales/api/searches/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply) => {
      const id = idValido(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'ID no válido' });
      const ok = await borrarBusqueda(id);
      if (!ok) return reply.code(404).send({ error: 'Búsqueda no encontrada' });
      return reply.code(204).send();
    },
  );

  /**
   * Rastreo manual: "mira AHORA". No notifica a propósito — quien lo pulsa está
   * mirando la pantalla, y la primera pasada trae decenas de anuncios viejos.
   */
  app.post<{ Params: { id: string } }>(
    '/locales/api/searches/:id/rastrear',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply) => {
      const id = idValido(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'ID no válido' });

      const busqueda = await getBusqueda(id);
      if (!busqueda) return reply.code(404).send({ error: 'Búsqueda no encontrada' });

      const resultado = await rastrearBusqueda(busqueda, { notificarNovedades: false });
      return {
        encontrados: resultado.encontrados,
        guardados: resultado.guardados,
        fallos: resultado.fallos,
        omitidos: resultado.omitidos,
      };
    },
  );
}
