import type { FastifyInstance } from 'fastify';
import { assertEstadoViaPut, assertTransition } from '../domain/state';
import { parseAsin } from '../domain/validation';
import { changeEstado, editProduct, requireProduct, storeResena } from '../services/productService';
import { syncProducts } from '../services/syncService';
import type { AppDeps } from './deps';
import { V1_BASE, presentBare, presentProduct } from './presenters';
import { apiListQuerySchema, apiPatchSchema, resenaSchema } from './schemas';
import { serveMedia } from './serveMedia';

/**
 * Claude API (static bearer token). Mounted under /vine-resenas/api/v1.
 * Registration order is fixed on purpose: the literal `/products/sync` goes
 * BEFORE the parametric `/products/:asin` routes so it can never be shadowed.
 */
export function apiRoutes(deps: AppDeps) {
  const { repo, auth } = deps;
  const onRequest = auth.api;
  return async function (app: FastifyInstance): Promise<void> {
    app.post('/products/sync', { onRequest }, async () => {
      return syncProducts(repo, deps.fetcher, deps.syncConfig());
    });

    app.get('/products', { onRequest }, async (request) => {
      const { estado } = apiListQuerySchema.parse(request.query);
      const all = await repo.listAll();
      return (estado ? all.filter((p) => p.estado === estado) : all).map((p) => presentProduct(p, V1_BASE));
    });

    app.get('/products/:asin', { onRequest }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      return presentProduct(await requireProduct(repo, asin), V1_BASE);
    });

    app.put('/products/:asin', { onRequest }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      const { estado, ...patch } = apiPatchSchema.parse(request.body ?? {});
      const current = await requireProduct(repo, asin);
      // Validate the transition against the state AFTER applying the patch (feedback/stars may complete it).
      if (estado) {
        assertEstadoViaPut(current.estado, estado);
        assertTransition(
          {
            estado: current.estado,
            feedback: patch.feedback ?? current.feedback,
            estrellas: patch.estrellas === undefined ? current.estrellas : patch.estrellas,
          },
          estado,
        );
      }
      await editProduct(repo, asin, patch);
      if (estado) await changeEstado(repo, asin, estado);
      return presentProduct(await requireProduct(repo, asin), V1_BASE);
    });

    app.put('/products/:asin/resena', { onRequest }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      const body = resenaSchema.parse(request.body ?? {});
      return presentBare(await storeResena(repo, asin, body));
    });

    app.post('/products/:asin/publicado', { onRequest }, async (request) => {
      const asin = parseAsin((request.params as { asin: string }).asin);
      return presentBare(await changeEstado(repo, asin, 'publicado'));
    });

    app.get('/media/:asin/:filename', { onRequest }, async (request, reply) => {
      const p = request.params as { asin: string; filename: string };
      return serveMedia(deps, request, reply, p.asin, p.filename);
    });
  };
}
