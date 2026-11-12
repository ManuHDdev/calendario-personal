import type { FastifyInstance } from 'fastify';
import { HttpError } from '../errors';
import { filterProducts } from '../domain/listFilter';
import { parseAsin, parseStoredFilename } from '../domain/validation';
import { createGuestLink, linkStatus } from '../services/guestLinkService';
import { removeMedia } from '../services/mediaService';
import { changeEstado, editProduct, requireProduct } from '../services/productService';
import type { AppDeps } from './deps';
import {
  GUEST_PAGE_BASE,
  UI_BASE,
  presentBare,
  presentGuestLinkAdmin,
  presentMedia,
  presentProduct,
  presentSummary,
} from './presenters';
import { contentPatchSchema, createGuestLinkSchema, uiListQuerySchema } from './schemas';
import { serveMedia } from './serveMedia';
import { processUploads } from './uploadParts';

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

      const { uploaded: rows, replaced, rejected } = await processUploads(deps, request, asin);
      const uploaded = rows.map((m) => presentMedia(m, UI_BASE));

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

    // Guest links: the owner hands a per-product URL to a relative without an account (see routes/guest.ts).
    app.post('/products/:asin/guest-links', { onRequest: auth.write }, async (request, reply) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      const { expiresInDays } = createGuestLinkSchema.parse(request.body ?? {});
      const user = request.user;
      const createdBy = user?.preferred_username ?? user?.sub ?? null;
      const { link, token } = await createGuestLink(repo, asin, { expiresInDays, createdBy });
      // The raw token is returned exactly once; only its hash is stored.
      return reply.code(201).send({
        id: link.id,
        url: `${GUEST_PAGE_BASE}/${token}`,
        token,
        expiresAt: link.expires_at,
      });
    });

    app.get('/products/:asin/guest-links', { onRequest: auth.write }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      await requireProduct(repo, asin);
      const now = new Date();
      return (await repo.listGuestLinks(asin)).map((l) => presentGuestLinkAdmin(l, linkStatus(l, now)));
    });

    app.delete('/guest-links/:id', { onRequest: auth.write }, async (request, reply) => {
      const id = Number((request.params as { id: string }).id);
      if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'BadRequest', 'Invalid link id');
      const revoked = await repo.revokeGuestLink(id);
      if (!revoked) throw new HttpError(404, 'NotFound', 'Guest link not found');
      return reply.code(204).send();
    });

    app.get('/media/:asin/:filename', { onRequest: auth.readMedia }, async (request, reply) => {
      const p = request.params as { asin: string; filename: string };
      return serveMedia(deps, request, reply, p.asin, p.filename);
    });
  };
}
