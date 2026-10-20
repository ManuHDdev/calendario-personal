import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import {
  accesoCreateSchema,
  accesoUpdateSchema,
  ciudadQuerySchema,
  cruceUpdateSchema,
  idParamSchema,
  importarSchema,
  observacionCreateSchema,
} from '../schemas/semaforos.schema';
import {
  listarCiudades,
  listarCruces,
  listarObservaciones,
  obtenerAcceso,
} from '../db/queries';
import { importarCiudad } from '../services/importadorOsm';

const ADMIN_ONLY = ['admin'];
const guard = { preHandler: authMiddleware(ADMIN_ONLY) };

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: message, statusCode: 400 });
}
function notFound(reply: FastifyReply, message: string) {
  return reply.code(404).send({ error: message, statusCode: 404 });
}

export async function semaforosRoutes(app: FastifyInstance): Promise<void> {
  // ── Ciudades ───────────────────────────────────────────────────────────────
  app.get('/ciudades', guard, async (_req, reply) => reply.send(await listarCiudades()));

  app.post('/ciudades/importar', guard, async (request, reply) => {
    const parsed = importarSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues[0]?.message ?? 'Validacion fallida');
    try {
      return reply.send(await importarCiudad(parsed.data.ciudad));
    } catch (err) {
      request.log.error(err);
      // El mensaje es nuestro (ciudad sin resultados / Overpass caido), no un volcado interno.
      return reply.code(502).send({
        error: err instanceof Error ? err.message : 'Error al importar',
        statusCode: 502,
      });
    }
  });

  // ── Cruces ─────────────────────────────────────────────────────────────────
  app.get('/cruces', guard, async (request, reply) => {
    const q = ciudadQuerySchema.safeParse(request.query);
    if (!q.success) return badRequest(reply, 'Ciudad no valida');
    return reply.send(await listarCruces(q.data.ciudad));
  });

  app.patch('/cruces/:id', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    const b = cruceUpdateSchema.safeParse(request.body);
    if (!p.success) return badRequest(reply, 'ID no valido');
    if (!b.success) return badRequest(reply, b.error.issues[0]?.message ?? 'Validacion fallida');
    const r = await pool.query(
      `UPDATE cruce SET nombre = $2, updated_at = NOW() WHERE id = $1 AND activo = TRUE RETURNING id`,
      [p.data.id, b.data.nombre],
    );
    if (r.rows.length === 0) return notFound(reply, 'Cruce no encontrado');
    return reply.send({ id: p.data.id, nombre: b.data.nombre });
  });

  app.delete('/cruces/:id', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return badRequest(reply, 'ID no valido');
    const r = await pool.query(
      `UPDATE cruce SET activo = FALSE, deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND activo = TRUE RETURNING id`,
      [p.data.id],
    );
    if (r.rows.length === 0) return notFound(reply, 'Cruce no encontrado');
    return reply.code(204).send();
  });

  // ── Accesos ────────────────────────────────────────────────────────────────
  app.post('/cruces/:id/accesos', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    const b = accesoCreateSchema.safeParse(request.body);
    if (!p.success) return badRequest(reply, 'ID no valido');
    if (!b.success) return badRequest(reply, b.error.issues[0]?.message ?? 'Validacion fallida');
    const cruce = await pool.query('SELECT 1 FROM cruce WHERE id = $1 AND activo = TRUE', [p.data.id]);
    if (cruce.rows.length === 0) return notFound(reply, 'Cruce no encontrado');
    const r = await pool.query<{ id: number }>(
      `INSERT INTO acceso (cruce_id, nombre, rumbo_grados) VALUES ($1, $2, $3) RETURNING id`,
      [p.data.id, b.data.nombre, b.data.rumbo_grados ?? null],
    );
    return reply.code(201).send(await obtenerAcceso(r.rows[0].id));
  });

  app.get('/accesos/:id', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return badRequest(reply, 'ID no valido');
    const acceso = await obtenerAcceso(p.data.id);
    if (!acceso) return notFound(reply, 'Acceso no encontrado');
    return reply.send({ ...acceso, observaciones: await listarObservaciones(acceso.id) });
  });

  app.patch('/accesos/:id', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    const b = accesoUpdateSchema.safeParse(request.body);
    if (!p.success) return badRequest(reply, 'ID no valido');
    if (!b.success) return badRequest(reply, b.error.issues[0]?.message ?? 'Validacion fallida');
    if (Object.keys(b.data).length === 0) return badRequest(reply, 'No hay nada que actualizar');

    // Lista blanca de columnas: nada del body llega al SQL como identificador.
    const columnas = ['nombre', 'rumbo_grados', 'verde_manual_s', 'ambar_manual_s', 'rojo_manual_s'] as const;
    const sets: string[] = [];
    const values: unknown[] = [p.data.id];
    for (const col of columnas) {
      if (col in b.data) {
        values.push((b.data as Record<string, unknown>)[col]);
        sets.push(`${col} = $${values.length}`);
      }
    }
    const r = await pool.query(
      `UPDATE acceso SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND activo = TRUE RETURNING id`,
      values,
    );
    if (r.rows.length === 0) return notFound(reply, 'Acceso no encontrado');
    return reply.send(await obtenerAcceso(p.data.id));
  });

  app.delete('/accesos/:id', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return badRequest(reply, 'ID no valido');
    const r = await pool.query(
      `UPDATE acceso SET activo = FALSE, deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND activo = TRUE RETURNING id`,
      [p.data.id],
    );
    if (r.rows.length === 0) return notFound(reply, 'Acceso no encontrado');
    return reply.code(204).send();
  });

  // ── Observaciones ──────────────────────────────────────────────────────────
  app.post('/accesos/:id/observaciones', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    const b = observacionCreateSchema.safeParse(request.body);
    if (!p.success) return badRequest(reply, 'ID no valido');
    if (!b.success) return badRequest(reply, b.error.issues[0]?.message ?? 'Validacion fallida');
    const acceso = await pool.query(
      `SELECT 1 FROM acceso a JOIN cruce c ON c.id = a.cruce_id
        WHERE a.id = $1 AND a.activo = TRUE AND c.activo = TRUE`,
      [p.data.id],
    );
    if (acceso.rows.length === 0) return notFound(reply, 'Acceso no encontrado');

    // La hora la pone el servidor: el reloj del movil puede ir desfasado.
    await pool.query(
      `INSERT INTO observacion (acceso_id, color, observado_at)
       VALUES ($1, $2, NOW() - make_interval(secs => $3::double precision))`,
      [p.data.id, b.data.color, b.data.hace_s ?? 0],
    );
    return reply.code(201).send(await obtenerAcceso(p.data.id));
  });

  app.delete('/observaciones/:id', guard, async (request, reply) => {
    const p = idParamSchema.safeParse(request.params);
    if (!p.success) return badRequest(reply, 'ID no valido');
    const r = await pool.query<{ acceso_id: number }>(
      `UPDATE observacion SET activo = FALSE, deleted_at = NOW()
        WHERE id = $1 AND activo = TRUE RETURNING acceso_id`,
      [p.data.id],
    );
    if (r.rows.length === 0) return notFound(reply, 'Observacion no encontrada');
    return reply.send(await obtenerAcceso(r.rows[0].acceso_id));
  });
}
