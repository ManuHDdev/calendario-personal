import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { actualizarAnuncioSchema } from '../schemas/locales.schema';
import {
  listAnuncios,
  actualizarAnuncio,
  marcarTodosVistos,
  borrarAnuncio,
} from '../db/queries';
import { precioPorMetro } from '../services/criterios';
import type { Anuncio } from '../types/locales';

const SOLO_ADMIN = ['admin'];

function idValido(bruto: string): number | null {
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** El €/m² es derivado del precio (que cambia): se calcula, no se guarda. */
function aDto(fila: Anuncio & { busqueda_nombre?: string }) {
  return { ...fila, precio_m2: precioPorMetro(fila.precio, fila.superficie_m2) };
}

export async function rutasAnuncios(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      busqueda?: string;
      tipo?: string;
      veredicto?: string;
      nuevos?: string;
      descartados?: string;
      limite?: string;
    };
  }>('/locales/api/listings', { preHandler: authMiddleware(SOLO_ADMIN) }, async (request, reply) => {
    const { busqueda, tipo, veredicto, nuevos, descartados, limite } = request.query;

    let busquedaId: number | undefined;
    if (busqueda !== undefined) {
      const n = idValido(busqueda);
      if (n === null) return reply.code(400).send({ error: 'busqueda no es un ID válido' });
      busquedaId = n;
    }
    if (tipo !== undefined && tipo !== 'local' && tipo !== 'farmacia') {
      return reply.code(400).send({ error: 'tipo debe ser local o farmacia' });
    }
    if (
      veredicto !== undefined &&
      !['verde', 'ambar', 'rojo', 'sin_datos'].includes(veredicto)
    ) {
      return reply.code(400).send({ error: 'veredicto no válido' });
    }

    const filas = await listAnuncios({
      busquedaId,
      tipo: tipo as 'local' | 'farmacia' | undefined,
      veredicto,
      soloNuevos: nuevos === 'true',
      incluirDescartados: descartados === 'true',
      limite: limite ? Number(limite) : undefined,
    });
    return filas.map(aDto);
  });

  app.patch<{ Params: { id: string } }>(
    '/locales/api/listings/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply) => {
      const id = idValido(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'ID no válido' });
      const parsed = actualizarAnuncioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Bad Request', detalles: parsed.error.issues });
      }
      const actualizado = await actualizarAnuncio(id, parsed.data);
      if (!actualizado) return reply.code(404).send({ error: 'Anuncio no encontrado' });
      return aDto(actualizado);
    },
  );

  app.post<{ Body: { busqueda_id?: number } }>(
    '/locales/api/listings/marcar-vistos',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply) => {
      const busquedaId = request.body?.busqueda_id;
      if (busquedaId !== undefined && !Number.isInteger(busquedaId)) {
        return reply.code(400).send({ error: 'busqueda_id no es un ID válido' });
      }
      const marcados = await marcarTodosVistos(busquedaId ?? null);
      return { marcados };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/locales/api/listings/:id',
    { preHandler: authMiddleware(SOLO_ADMIN) },
    async (request, reply) => {
      const id = idValido(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'ID no válido' });
      const ok = await borrarAnuncio(id);
      if (!ok) return reply.code(404).send({ error: 'Anuncio no encontrado' });
      return reply.code(204).send();
    },
  );
}
