import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, hasAnyRole, JwtPayload } from '../middleware/auth';
import { canMutateFile, canMutateFolder, folderExists, resolveFile, Viewer } from '../services/fileService';
import { getGrantees, setGrantees } from '../db';
import { listUsers } from '../services/keycloakAdmin';

function decodePathParam(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf-8');
}

function toViewer(user: JwtPayload | undefined): Viewer {
  return { sub: user?.sub ?? '', isAdmin: hasAnyRole(user, ['admin']) };
}

export async function permissionsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.addHook('preHandler', async (request, reply) => {
    if (!hasAnyRole(request.user, ['admin', 'familia'])) {
      reply.code(403).send({ error: 'Forbidden', message: 'Insufficient role' });
    }
  });

  // ── GET /storage/api/users — para el selector de "compartir con..." ──────
  app.get('/storage/api/users', async (_request, reply) => {
    try {
      const users = await listUsers();
      return users;
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Failed to list users' });
    }
  });

  // ── GET/PATCH /storage/api/files/:encodedPath/permissions ────────────────
  app.get(
    '/storage/api/files/:encodedPath/permissions',
    async (request: FastifyRequest<{ Params: { encodedPath: string } }>, reply: FastifyReply) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      try {
        resolveFile(relativePath);
      } catch {
        return reply.code(404).send({ error: 'File not found' });
      }
      if (!canMutateFile(relativePath, toViewer(request.user))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can view permissions' });
      }
      return { userIds: getGrantees('file', relativePath) };
    },
  );

  app.patch(
    '/storage/api/files/:encodedPath/permissions',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string }; Body: { userIds?: string[] } }>,
      reply: FastifyReply,
    ) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      try {
        resolveFile(relativePath);
      } catch {
        return reply.code(404).send({ error: 'File not found' });
      }
      const viewer = toViewer(request.user);
      if (!canMutateFile(relativePath, viewer)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can set permissions' });
      }
      const userIds = request.body?.userIds ?? [];
      setGrantees('file', relativePath, userIds, viewer.sub);
      return { userIds: getGrantees('file', relativePath) };
    },
  );

  // ── GET/PATCH /storage/api/folders/:encodedPath/permissions ──────────────
  app.get(
    '/storage/api/folders/:encodedPath/permissions',
    async (request: FastifyRequest<{ Params: { encodedPath: string } }>, reply: FastifyReply) => {
      let folderPath: string;
      try { folderPath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      if (!folderExists(folderPath)) {
        return reply.code(404).send({ error: 'Folder not found' });
      }
      if (!canMutateFolder(folderPath, toViewer(request.user))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can view permissions' });
      }
      return { userIds: getGrantees('folder', folderPath) };
    },
  );

  app.patch(
    '/storage/api/folders/:encodedPath/permissions',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string }; Body: { userIds?: string[] } }>,
      reply: FastifyReply,
    ) => {
      let folderPath: string;
      try { folderPath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      if (!folderExists(folderPath)) {
        return reply.code(404).send({ error: 'Folder not found' });
      }
      const viewer = toViewer(request.user);
      if (!canMutateFolder(folderPath, viewer)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can set permissions' });
      }
      const userIds = request.body?.userIds ?? [];
      setGrantees('folder', folderPath, userIds, viewer.sub);
      return { userIds: getGrantees('folder', folderPath) };
    },
  );
}
