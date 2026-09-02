import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { authMiddleware, hasAnyRole, JwtPayload } from '../middleware/auth';
import {
  getAllFiles,
  getFolders,
  saveFile,
  deleteFile,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFile,
  resolveFile,
  canViewFile,
  canMutateFile,
  canMutateFolder,
  ensureBasePath,
  ALLOWED_MIME_TYPES,
  resolveMimeType,
  Viewer,
} from '../services/fileService';

function encodePathParam(relativePath: string): string {
  return Buffer.from(relativePath).toString('base64url');
}

function decodePathParam(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf-8');
}

function toViewer(user: JwtPayload | undefined): Viewer {
  return { sub: user?.sub ?? '', isAdmin: hasAnyRole(user, ['admin']) };
}

function toOwner(user: JwtPayload | undefined): { sub: string; username: string } {
  return { sub: user?.sub ?? '', username: user?.preferred_username ?? user?.sub ?? 'unknown' };
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  ensureBasePath();

  app.addHook('preHandler', authMiddleware);

  // Verificar que el usuario tenga rol familia o admin
  app.addHook('preHandler', async (request, reply) => {
    if (!hasAnyRole(request.user, ['admin', 'familia'])) {
      reply.code(403).send({ error: 'Forbidden', message: 'Insufficient role' });
    }
  });

  // ── GET /storage/api/files?folder= ────────────────────────────────────────
  app.get(
    '/storage/api/files',
    async (
      request: FastifyRequest<{ Querystring: { folder?: string } }>,
      _reply: FastifyReply,
    ) => {
      const { folder } = request.query;
      return getAllFiles(folder, toViewer(request.user));
    },
  );

  // ── GET /storage/api/folders ───────────────────────────────────────────────
  app.get('/storage/api/folders', async (request) => getFolders(toViewer(request.user)));

  // ── POST /storage/api/upload?folder= ──────────────────────────────────────
  app.post(
    '/storage/api/upload',
    async (
      request: FastifyRequest<{ Querystring: { folder?: string } }>,
      reply: FastifyReply,
    ) => {
      const { folder } = request.query;
      const data = await request.file();
      if (!data) return reply.code(400).send({ error: 'No file provided' });

      const mimeType = resolveMimeType(data.filename, data.mimetype);
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        data.file.resume();
        return reply.code(415).send({ error: `MIME type not allowed: ${mimeType}` });
      }

      try {
        const entry = await saveFile(data.filename, mimeType, data.file, folder, toOwner(request.user));
        return reply.code(201).send(entry);
      } catch (err) {
        // @fastify/multipart corta el stream al superar el límite: es un 413,
        // no un fallo del servidor.
        if (data.file.truncated) {
          return reply
            .code(413)
            .send({ error: 'El archivo supera el límite de 500 MB' });
        }
        return reply.code(500).send({ error: err instanceof Error ? err.message : 'Upload failed' });
      }
    },
  );

  // ── GET /storage/api/files/:encodedPath/download ──────────────────────────
  app.get(
    '/storage/api/files/:encodedPath/download',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string } }>,
      reply: FastifyReply,
    ) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      try {
        const { absolute, entry } = resolveFile(relativePath);
        if (!canViewFile(relativePath, toViewer(request.user))) {
          return reply.code(404).send({ error: 'File not found' });
        }
        reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(entry.name)}`);
        reply.header('Content-Type', entry.mimeType);
        reply.header('Content-Length', entry.size);
        return reply.send(fs.createReadStream(absolute));
      } catch (err) {
        return reply.code(404).send({ error: err instanceof Error ? err.message : 'Not found' });
      }
    },
  );

  // ── GET /storage/api/files/:encodedPath/preview ───────────────────────────
  app.get(
    '/storage/api/files/:encodedPath/preview',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string } }>,
      reply: FastifyReply,
    ) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      try {
        const { absolute, entry } = resolveFile(relativePath);
        if (!canViewFile(relativePath, toViewer(request.user))) {
          return reply.code(404).send({ error: 'File not found' });
        }
        const isVideo = entry.mimeType.startsWith('video/');

        if (isVideo) {
          const fileSize = entry.size;
          const rangeHeader = request.headers['range'];
          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (!match) { return reply.code(416).send({ error: 'Invalid Range header' }); }
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            if (start > end || end >= fileSize) {
              reply.header('Content-Range', `bytes */${fileSize}`);
              return reply.code(416).send({ error: 'Range Not Satisfiable' });
            }
            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            reply.header('Accept-Ranges', 'bytes');
            reply.header('Content-Length', end - start + 1);
            reply.header('Content-Type', entry.mimeType);
            return reply.send(fs.createReadStream(absolute, { start, end }));
          }
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Length', fileSize);
          reply.header('Content-Type', entry.mimeType);
          return reply.send(fs.createReadStream(absolute));
        }

        // Convertir HEIC/HEIF a JPEG para compatibilidad con navegadores
        const needsConversion = ['image/heic', 'image/heif'].includes(entry.mimeType);
        if (needsConversion) {
          try {
            const buffer = await sharp(absolute).jpeg({ quality: 95 }).toBuffer();
            reply.header('Content-Type', 'image/jpeg');
            reply.header('Content-Length', buffer.length);
            reply.header('Content-Disposition', 'inline');
            reply.header('Cache-Control', 'private, max-age=3600');
            return reply.send(buffer);
          } catch {
            // sharp no puede procesar el HEIC: servir original igualmente
          }
        }

        reply.header('Content-Type', entry.mimeType);
        reply.header('Content-Length', entry.size);
        reply.header('Content-Disposition', 'inline');
        reply.header('Cache-Control', 'private, max-age=3600');
        return reply.send(fs.createReadStream(absolute));
      } catch (err) {
        return reply.code(404).send({ error: err instanceof Error ? err.message : 'Not found' });
      }
    },
  );

  // ── GET /storage/api/files/:encodedPath/thumbnail ────────────────────────
  app.get(
    '/storage/api/files/:encodedPath/thumbnail',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string } }>,
      reply: FastifyReply,
    ) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      try {
        const { absolute, entry } = resolveFile(relativePath);
        if (!canViewFile(relativePath, toViewer(request.user))) {
          return reply.code(404).send({ error: 'File not found' });
        }

        if (!entry.mimeType.startsWith('image/')) {
          // No es imagen: devolver el archivo original
          reply.header('Content-Type', entry.mimeType);
          reply.header('Content-Length', entry.size);
          reply.header('Cache-Control', 'private, max-age=604800');
          return reply.send(fs.createReadStream(absolute));
        }

        try {
          const ext = path.extname(entry.name).toLowerCase();
          const transformer = ext === '.gif'
            ? sharp(absolute, { animated: false }).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 })
            : sharp(absolute).resize(400, 400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 });

          const buffer = await transformer.toBuffer();
          reply.header('Content-Type', 'image/jpeg');
          reply.header('Content-Length', buffer.length);
          reply.header('Cache-Control', 'private, max-age=604800');
          reply.header('Content-Disposition', 'inline');
          return reply.send(buffer);
        } catch {
          // Fallback: servir imagen original si sharp no puede procesarla
          reply.header('Content-Type', entry.mimeType);
          reply.header('Content-Length', entry.size);
          reply.header('Cache-Control', 'private, max-age=604800');
          reply.header('Content-Disposition', 'inline');
          return reply.send(fs.createReadStream(absolute));
        }
      } catch (err) {
        return reply.code(404).send({ error: err instanceof Error ? err.message : 'Not found' });
      }
    },
  );

  // ── PATCH /storage/api/files/:encodedPath — mover archivo ─────────────────
  app.patch(
    '/storage/api/files/:encodedPath',
    async (
      request: FastifyRequest<{
        Params: { encodedPath: string };
        Body: { folder?: string | null };
      }>,
      reply: FastifyReply,
    ) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      const targetFolder = request.body?.folder ?? undefined;
      if (!canMutateFile(relativePath, toViewer(request.user))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can move this file' });
      }
      try {
        const entry = moveFile(relativePath, targetFolder || undefined);
        return reply.send(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Move failed';
        const code = message === 'File not found' ? 404 : 400;
        return reply.code(code).send({ error: message });
      }
    },
  );

  // ── DELETE /storage/api/files/:encodedPath ────────────────────────────────
  app.delete(
    '/storage/api/files/:encodedPath',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string } }>,
      reply: FastifyReply,
    ) => {
      let relativePath: string;
      try { relativePath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      if (!canMutateFile(relativePath, toViewer(request.user))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can delete this file' });
      }
      try {
        await deleteFile(relativePath);
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete failed';
        return reply.code(message === 'File not found' ? 404 : 500).send({ error: message });
      }
    },
  );

  // ── POST /storage/api/folders ─────────────────────────────────────────────
  app.post(
    '/storage/api/folders',
    async (
      request: FastifyRequest<{ Body: { name?: string } }>,
      reply: FastifyReply,
    ) => {
      const { name } = request.body ?? {};
      if (!name) return reply.code(400).send({ error: 'Folder name is required' });

      try {
        createFolder(name, toOwner(request.user));
        return reply.code(201).send({ name });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Create folder failed';
        return reply.code(message === 'Folder already exists' ? 409 : 400).send({ error: message });
      }
    },
  );

  // ── PATCH /storage/api/folders/:encodedPath — renombrar carpeta ───────────
  app.patch(
    '/storage/api/folders/:encodedPath',
    async (
      request: FastifyRequest<{
        Params: { encodedPath: string };
        Body: { newName?: string };
      }>,
      reply: FastifyReply,
    ) => {
      let folderPath: string;
      try { folderPath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      const { newName } = request.body ?? {};
      if (!newName) return reply.code(400).send({ error: 'newName is required' });

      if (!canMutateFolder(folderPath, toViewer(request.user))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can rename this folder' });
      }
      try {
        const newPath = renameFolder(folderPath, newName);
        return reply.send({ path: newPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Rename failed';
        const code = message === 'Folder not found' ? 404
          : message.includes('already exists') ? 409 : 400;
        return reply.code(code).send({ error: message });
      }
    },
  );

  // ── DELETE /storage/api/folders/:encodedPath ──────────────────────────────
  app.delete(
    '/storage/api/folders/:encodedPath',
    async (
      request: FastifyRequest<{ Params: { encodedPath: string } }>,
      reply: FastifyReply,
    ) => {
      let folderPath: string;
      try { folderPath = decodePathParam(request.params.encodedPath); }
      catch { return reply.code(400).send({ error: 'Invalid path encoding' }); }

      if (!canMutateFolder(folderPath, toViewer(request.user))) {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only the owner or admin can delete this folder' });
      }
      try {
        deleteFolder(folderPath);
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Delete folder failed';
        let code = 500;
        if (message === 'Folder not found') code = 404;
        if (message === 'Folder is not empty') code = 409;
        return reply.code(code).send({ error: message });
      }
    },
  );
}

export { encodePathParam, decodePathParam };
