import { FastifyInstance, FastifyReply } from 'fastify';
import { pool } from '../db/pool';
import { authMiddleware } from '../middleware/auth';
import {
  createCamaraSchema, updateCamaraSchema, listCamarasQuerySchema, idParamSchema,
} from '../schemas/camara.schema';
import { aDto, construirListadoQuery, COLUMNAS_CAMARA } from '../db/queries';
import { CIUDADES } from '../services/ciudades';
import { CacheImagenes, crearCapturadorHttp, ImagenNoDisponibleError } from '../services/imagenProxy';
import { UrlNoPermitidaError } from '../services/urlSeguridad';
import { ejecutarImportacion } from '../services/importador';
import type { CamaraRow } from '../types/camara';

const admin = authMiddleware(['admin']);
// <img> no puede mandar Authorization: la imagen acepta el token en `?token=`
// (mismo patrón que storage/descargas; nunca se loguea, ver services/redact.ts).
const adminConTokenEnUrl = authMiddleware(['admin'], { allowQueryToken: true });

const TTL_SEGUNDOS = Number(process.env.CAMARAS_CACHE_SEGUNDOS) || 60;

const cacheImagenes = new CacheImagenes({
  ttlMs: TTL_SEGUNDOS * 1000,
  ttlErrorMs: 15_000,
  maxEntradas: 300,
  capturador: crearCapturadorHttp(),
});

function validacion(reply: FastifyReply, mensaje: string | undefined) {
  return reply.code(400).send({ error: mensaje ?? 'Validación fallida', statusCode: 400 });
}

function errorInterno(reply: FastifyReply, err: unknown) {
  return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
}

export async function camarasRoutes(app: FastifyInstance): Promise<void> {
  // GET /ciudades — las ciudades configuradas con cuántas cámaras visibles tiene cada una
  app.get('/ciudades', { preHandler: admin }, async (_request, reply) => {
    try {
      const { rows } = await pool.query<{ ciudad: string; total: string }>(
        `SELECT ciudad, COUNT(*) AS total FROM camara WHERE activo = true AND retirada = false GROUP BY ciudad`,
      );
      const cuenta = new Map(rows.map((r) => [r.ciudad, Number(r.total)]));
      return reply.send(
        CIUDADES.map((c) => ({
          slug: c.slug, nombre: c.nombre, latitud: c.latitud, longitud: c.longitud, camaras: cuenta.get(c.slug) ?? 0,
        })),
      );
    } catch (err) {
      return errorInterno(reply, err);
    }
  });

  // GET /camaras?ciudad=&favorita=
  app.get('/camaras', { preHandler: admin }, async (request, reply) => {
    const parsed = listCamarasQuerySchema.safeParse(request.query);
    if (!parsed.success) return validacion(reply, parsed.error.issues[0]?.message);
    try {
      const { text, values } = construirListadoQuery(parsed.data);
      const { rows } = await pool.query<CamaraRow>(text, values);
      return reply.send(rows.map(aDto));
    } catch (err) {
      return errorInterno(reply, err);
    }
  });

  // POST /camaras — alta manual (la de la DGT entra sola por el importador)
  app.post('/camaras', { preHandler: admin }, async (request, reply) => {
    const parsed = createCamaraSchema.safeParse(request.body);
    if (!parsed.success) return validacion(reply, parsed.error.issues[0]?.message);
    const c = parsed.data;
    try {
      const { rows } = await pool.query<CamaraRow>(
        `INSERT INTO camara (origen, nombre, carretera, ciudad, latitud, longitud, url_imagen, url_pagina, fuente, favorita)
         VALUES ('manual', $1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${COLUMNAS_CAMARA}`,
        [c.nombre, c.carretera ?? null, c.ciudad, c.latitud, c.longitud, c.urlImagen ?? null, c.urlPagina ?? null, c.fuente ?? null, c.favorita ?? false],
      );
      return reply.code(201).send(aDto(rows[0]));
    } catch (err) {
      return errorInterno(reply, err);
    }
  });

  // PATCH /camaras/:id — manual: todo editable; DGT: solo `favorita`
  app.patch('/camaras/:id', { preHandler: admin }, async (request, reply) => {
    const id = idParamSchema.safeParse(request.params);
    if (!id.success) return validacion(reply, 'Identificador no válido');
    const parsed = updateCamaraSchema.safeParse(request.body);
    if (!parsed.success) return validacion(reply, parsed.error.issues[0]?.message);
    const campos = parsed.data;
    if (Object.keys(campos).length === 0) return validacion(reply, 'No se han enviado campos a actualizar');

    try {
      const actual = await pool.query<{ origen: string; url_imagen: string | null; url_pagina: string | null }>(
        'SELECT origen, url_imagen, url_pagina FROM camara WHERE id = $1 AND activo = true',
        [id.data.id],
      );
      if (actual.rows.length === 0) return reply.code(404).send({ error: 'Cámara no encontrada', statusCode: 404 });

      if (actual.rows[0].origen === 'dgt' && Object.keys(campos).some((k) => k !== 'favorita')) {
        return validacion(reply, 'Una cámara de la DGT solo permite marcarla como favorita: el resto lo reescribe la importación');
      }

      // Una cámara no puede quedarse sin ninguna URL (lo impone también un CHECK en BD).
      const imagen = campos.urlImagen !== undefined ? campos.urlImagen : actual.rows[0].url_imagen;
      const pagina = campos.urlPagina !== undefined ? campos.urlPagina : actual.rows[0].url_pagina;
      if (imagen === null && pagina === null) {
        return validacion(reply, 'La cámara debe conservar al menos una URL de imagen o de página');
      }

      const columnas: Record<string, string> = {
        nombre: 'nombre', ciudad: 'ciudad', latitud: 'latitud', longitud: 'longitud', carretera: 'carretera',
        urlImagen: 'url_imagen', urlPagina: 'url_pagina', fuente: 'fuente', favorita: 'favorita',
      };
      const entradas = Object.entries(campos);
      const sets = entradas.map(([k], i) => `${columnas[k]} = $${i + 2}`).join(', ');
      const { rows } = await pool.query<CamaraRow>(
        `UPDATE camara SET ${sets}, updated_at = NOW() WHERE id = $1 AND activo = true RETURNING ${COLUMNAS_CAMARA}`,
        [id.data.id, ...entradas.map(([, v]) => v)],
      );
      return reply.send(aDto(rows[0]));
    } catch (err) {
      return errorInterno(reply, err);
    }
  });

  // DELETE /camaras/:id — borrado lógico
  app.delete('/camaras/:id', { preHandler: admin }, async (request, reply) => {
    const id = idParamSchema.safeParse(request.params);
    if (!id.success) return validacion(reply, 'Identificador no válido');
    try {
      const { rows } = await pool.query(
        `UPDATE camara SET activo = false, deleted_at = NOW() WHERE id = $1 AND activo = true RETURNING id`,
        [id.data.id],
      );
      if (rows.length === 0) return reply.code(404).send({ error: 'Cámara no encontrada', statusCode: 404 });
      return reply.code(204).send();
    } catch (err) {
      return errorInterno(reply, err);
    }
  });

  // GET /camaras/:id/imagen — proxy con caché; la URL de origen nunca sale del backend
  app.get('/camaras/:id/imagen', { preHandler: adminConTokenEnUrl }, async (request, reply) => {
    const id = idParamSchema.safeParse(request.params);
    if (!id.success) return validacion(reply, 'Identificador no válido');
    try {
      const { rows } = await pool.query<{ url_imagen: string | null }>(
        'SELECT url_imagen FROM camara WHERE id = $1 AND activo = true AND retirada = false',
        [id.data.id],
      );
      const url = rows[0]?.url_imagen;
      if (!url) return reply.code(404).send({ error: 'Esta cámara no tiene imagen', statusCode: 404 });

      const imagen = await cacheImagenes.obtener(`${id.data.id}:${url}`, url);
      return reply
        .header('Content-Type', imagen.tipo)
        .header('Cache-Control', `private, max-age=${Math.min(TTL_SEGUNDOS, 30)}`)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "sandbox; default-src 'none'")
        .header('X-Captured-At', new Date(imagen.capturadaEn).toISOString())
        .send(imagen.cuerpo);
    } catch (err) {
      if (err instanceof ImagenNoDisponibleError || err instanceof UrlNoPermitidaError) {
        // 502 y no 404: la cámara existe, lo que falla es el origen. La UI lo pinta como "sin señal".
        return reply.code(502).send({ error: err.message, statusCode: 502 });
      }
      return errorInterno(reply, err);
    }
  });

  // GET /estado — última importación del feed de la DGT
  app.get('/estado', { preHandler: admin }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT ultima_ejecucion, ultima_ok, total_feed, total_cercanas, por_ciudad, error FROM importacion_estado WHERE id = 1`,
      );
      const r = rows[0] ?? {};
      return reply.send({
        ultimaEjecucion: r.ultima_ejecucion ? new Date(r.ultima_ejecucion).toISOString() : null,
        ok: r.ultima_ok ?? null,
        totalFeed: r.total_feed ?? null,
        totalCercanas: r.total_cercanas ?? null,
        porCiudad: r.por_ciudad ?? null,
        error: r.error ?? null,
      });
    } catch (err) {
      return errorInterno(reply, err);
    }
  });

  // POST /importacion — lanza el importador a mano (botón "Actualizar catálogo")
  app.post('/importacion', { preHandler: admin }, async (request, reply) => {
    try {
      const resultado = await ejecutarImportacion(request.log);
      return reply.send(resultado);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error en la importación';
      request.log.error(`[importador] manual: ${mensaje}`);
      await pool
        .query(`UPDATE importacion_estado SET ultima_ejecucion = NOW(), ultima_ok = false, error = $1 WHERE id = 1`, [mensaje])
        .catch(() => undefined);
      return reply.code(502).send({ error: mensaje, statusCode: 502 });
    }
  });
}
