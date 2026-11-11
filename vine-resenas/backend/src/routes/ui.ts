import path from 'path';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors';
import { filterProducts } from '../domain/listFilter';
import { parseAsin, parseStoredFilename } from '../domain/validation';
import { removeMedia, storeUpload } from '../services/mediaService';
import { changeEstado, editProduct, requireProduct } from '../services/productService';
import type { AppDeps } from './deps';
import { UI_BASE, presentBare, presentMedia, presentProduct, presentSummary } from './presenters';
import { contentPatchSchema, uiListQuerySchema } from './schemas';
import { serveMedia } from './serveMedia';

/** Routes for the web UI (Keycloak JWT). Mounted under /vine-resenas/api/ui. */
export function uiRoutes(deps: AppDeps) {
  const { repo, auth } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.get('/products', { onRequest: auth.read }, async (request) => {
      const query = uiListQuerySchema.parse(request.query);
      const all = await repo.listAll();
      return filterProducts(all, query).map((p) => presentSummary(p, UI_BASE));
    });

    app.get('/counts', { onRequest: auth.read }, async () => {
      const c = await repo.counts();
      const total = c.pendiente + c.listo + c.resena_generada + c.publicado;
      return { ...c, pendientes: c.pendiente, total };
    });

    app.get('/products/:asin', { onRequest: auth.read }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      return presentProduct(await requireProduct(repo, asin), UI_BASE);
    });

    // Autosave: content fields only. The state is never touched here.
    app.put('/products/:asin', { onRequest: auth.write }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      const patch = contentPatchSchema.parse(request.body ?? {});
      return presentBare(await editProduct(repo, asin, patch));
    });

    app.post('/products/:asin/listo', { onRequest: auth.write }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      return presentBare(await changeEstado(repo, asin, 'listo'));
    });

    app.post('/products/:asin/publicado', { onRequest: auth.write }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      return presentBare(await changeEstado(repo, asin, 'publicado'));
    });

    app.post('/products/:asin/media', { onRequest: auth.write }, async (request, reply) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      await requireProduct(repo, asin);
      if (!request.isMultipart()) {
        throw new HttpError(400, 'BadRequest', 'Expected multipart/form-data');
      }

      const uploaded: ReturnType<typeof presentMedia>[] = [];
      const replaced: string[] = [];
      const rejected: { filename: string; error: string; message: string; status: number }[] = [];

      for await (const part of request.parts()) {
        if (part.type !== 'file') continue;
        try {
          const result = await storeUpload(deps, asin, {
            originalName: part.filename,
            mimetype: part.mimetype,
            stream: part.file,
          });
          uploaded.push(presentMedia(result.media, UI_BASE));
          replaced.push(...result.replaced);
        } catch (err) {
          part.file.resume();
          const e = err instanceof HttpError ? err : new HttpError(500, 'InternalError', 'Upload failed');
          if (!(err instanceof HttpError)) request.log.error({ err }, 'media upload failed');
          rejected.push({
            filename: path.basename(part.filename ?? '').slice(0, 120),
            error: e.code,
            message: e.message,
            status: e.statusCode,
          });
        }
      }

      if (uploaded.length === 0) {
        if (rejected.length === 0) throw new HttpError(400, 'BadRequest', 'No files received');
        reply.code(rejected[0].status);
      } else {
        reply.code(201);
      }
      return { uploaded, replaced, rejected };
    });

    app.delete('/products/:asin/media/:filename', { onRequest: auth.write }, async (request, reply) => {
      const params = request.params as { asin: string; filename: string };
      const asin = parseAsin(params.asin);
      const filename = parseStoredFilename(params.filename);
      const existed = await removeMedia(deps, asin, filename);
      if (!existed) throw new HttpError(404, 'NotFound', 'Media not found');
      return reply.code(204).send();
    });

    app.get('/media/:asin/:filename', { onRequest: auth.readMedia }, async (request, reply) => {
      const p = request.params as { asin: string; filename: string };
      return serveMedia(deps, request, reply, p.asin, p.filename);
    });
  };
}
