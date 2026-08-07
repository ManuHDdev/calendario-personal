import fs from 'fs';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { ALLOWED_MIME_TYPES, saveUploadedImage, getImagePath } from '../services/imageService';

export async function imagesRoutes(app: FastifyInstance): Promise<void> {
  // POST /images — subida de imagen (admin, Keycloak)
  app.post('/images', { preHandler: authMiddleware(['admin', 'paraisos_admin']) }, async (request, reply: FastifyReply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No se ha enviado ningún archivo', statusCode: 400 });
      }

      if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
        data.file.resume();
        return reply.code(415).send({ error: `Tipo de archivo no permitido: ${data.mimetype}`, statusCode: 415 });
      }

      const filename = await saveUploadedImage(data.file);
      return reply.code(201).send({ url: `/paraisos/api/images/${filename}` });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Error interno', statusCode: 500 });
    }
  });

  // GET /images/:filename — servir imagen (público)
  app.get<{ Params: { filename: string } }>('/images/:filename', async (request, reply: FastifyReply) => {
    const filePath = getImagePath(request.params.filename);
    if (!filePath) {
      return reply.code(404).send({ error: 'Imagen no encontrada', statusCode: 404 });
    }
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(fs.createReadStream(filePath));
  });
}
