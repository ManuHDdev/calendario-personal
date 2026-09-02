import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Readable } from 'stream';
import { authMiddleware, hasAnyRole, toOwner } from '../middleware/auth';
import { resolveMimeType } from '../services/fileService';
import {
  createUpload,
  getUploadProgress,
  appendChunk,
  completeUpload,
  cancelUpload,
  UploadError,
} from '../services/uploadService';

/** Traduce un UploadError a su respuesta; el resto burbujea como 500. */
function fail(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof UploadError) return reply.code(err.statusCode).send({ error: err.message });
  throw err;
}

/**
 * Subidas troceadas y reanudables.
 *
 * La subida de una sola tacada (POST /upload) sigue existiendo y es la que se
 * usa para archivos pequeños. Estas rutas son para lo que no sobrevive a un
 * móvil que se bloquea a mitad: el archivo se parte en trozos y, si se corta,
 * se retoma por donde iba en vez de empezar de cero.
 */
export async function uploadsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', async (request, reply) => {
    if (!hasAnyRole(request.user, ['admin', 'familia'])) {
      reply.code(403).send({ error: 'Forbidden', message: 'Insufficient role' });
    }
  });

  // Los trozos viajan como binario crudo. El parser devuelve el stream tal cual
  // para escribirlo directo a disco, sin pasar por memoria.
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
    done(null, payload);
  });

  // ── POST /storage/api/uploads ─────────────────────────────────────────────
  app.post(
    '/storage/api/uploads',
    async (
      request: FastifyRequest<{
        Body: { filename?: string; mimeType?: string; size?: number; folder?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { filename, mimeType, size, folder } = request.body ?? {};
      if (!filename) return reply.code(400).send({ error: 'Falta el nombre del archivo' });

      try {
        // Mismo criterio que la subida directa: no fiarse del MIME que declara
        // el navegador cuando es genérico (los .heic y .mov de iPhone llegan
        // como octet-stream en Windows).
        return createUpload({
          filename,
          mimeType: resolveMimeType(filename, mimeType ?? ''),
          totalBytes: Number(size),
          folder,
          owner: toOwner(request.user),
        });
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ── GET /storage/api/uploads/:id ──────────────────────────────────────────
  // Por dónde va la subida. Es lo que consulta el cliente al reanudar: el
  // servidor es la autoridad sobre cuántos bytes tiene de verdad.
  app.get(
    '/storage/api/uploads/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        return getUploadProgress(request.params.id, toOwner(request.user).sub);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ── PATCH /storage/api/uploads/:id ────────────────────────────────────────
  app.patch(
    '/storage/api/uploads/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Headers: { 'x-chunk-offset'?: string } }>,
      reply: FastifyReply,
    ) => {
      const offset = Number(request.headers['x-chunk-offset']);
      if (!Number.isFinite(offset)) {
        return reply.code(400).send({ error: 'Falta la cabecera X-Chunk-Offset' });
      }

      try {
        return await appendChunk(
          request.params.id,
          toOwner(request.user).sub,
          offset,
          request.body as Readable,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ── POST /storage/api/uploads/:id/complete ────────────────────────────────
  app.post(
    '/storage/api/uploads/:id/complete',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        return reply.code(201).send(completeUpload(request.params.id, toOwner(request.user).sub));
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ── DELETE /storage/api/uploads/:id ───────────────────────────────────────
  app.delete(
    '/storage/api/uploads/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        cancelUpload(request.params.id, toOwner(request.user).sub);
        return reply.code(204).send();
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
}
