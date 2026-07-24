import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  isAllowedYoutubeUrl,
  isValidFormat,
  contentTypeFor,
  buildFilename,
  contentDispositionFor,
  DownloadFormat,
} from '../services/validation';
import { fetchTitle, spawnDownload, DOWNLOAD_TIMEOUT_MS } from '../services/ytdlp';

// Herramienta pública: a diferencia del resto de subapps, no requiere
// Keycloak ni ningún rol — accesible para cualquiera, con o sin sesión.
export async function downloadRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/ytdl/api/download',
    async (
      request: FastifyRequest<{ Querystring: { url?: string; format?: string } }>,
      reply: FastifyReply,
    ) => {
      const { url, format } = request.query;

      if (!url || !isAllowedYoutubeUrl(url)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'Invalid or unsupported URL' });
      }
      if (!isValidFormat(format)) {
        return reply.code(400).send({ error: 'Bad Request', message: 'format must be mp4 or mp3' });
      }

      const validFormat: DownloadFormat = format;

      let title = 'video';
      try {
        title = await fetchTitle(url);
      } catch (err) {
        request.log.warn({ err }, 'yt-dlp: failed to fetch title, falling back to generic filename');
      }

      const filename = buildFilename(title, validFormat);
      const handle = spawnDownload(url, validFormat);

      let headersSent = false;
      let finished = false;
      let stderrTail = '';

      const timeoutHandle = setTimeout(() => {
        handle.killGroup();
      }, DOWNLOAD_TIMEOUT_MS);

      const cleanup = () => clearTimeout(timeoutHandle);

      // Cliente cierra la conexión (tab cerrada, descarga cancelada, etc.)
      request.raw.on('close', () => {
        if (!finished) handle.killGroup();
      });

      handle.onStderr((chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-2000);
      });

      // Tomamos control manual de la respuesta: no sabemos si yt-dlp/ffmpeg
      // van a producir bytes hasta que llega el primer chunk o el proceso termina.
      reply.hijack();

      handle.stdout.once('data', (firstChunk: Buffer) => {
        if (finished) return;
        headersSent = true;
        reply.raw.writeHead(200, {
          'Content-Type': contentTypeFor(validFormat),
          'Content-Disposition': contentDispositionFor(filename),
          'Transfer-Encoding': 'chunked',
        });
        reply.raw.write(firstChunk);
        // end:false — el cierre de la respuesta se gestiona explícitamente
        // en el handler 'close' del child process para evitar un doble end().
        handle.stdout.pipe(reply.raw, { end: false });
      });

      handle.onError((err) => {
        cleanup();
        if (finished) return;
        finished = true;
        if (!headersSent) {
          reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
        } else {
          // Mismo motivo que en el handler 'close': ya se enviaron cabeceras,
          // no se puede cambiar el status code, así que se destruye la
          // conexión para que el cliente no guarde un fichero truncado como
          // si la descarga hubiese tenido éxito.
          reply.raw.destroy();
        }
      });

      handle.onClose((code, signal) => {
        cleanup();
        if (finished) return;
        finished = true;
        if (!headersSent) {
          reply.raw.writeHead(502, { 'Content-Type': 'application/json' });
          reply.raw.end(
            JSON.stringify({
              error: 'Bad Gateway',
              message: `yt-dlp exited with code ${code} before producing output`,
              details: stderrTail,
            }),
          );
        } else if (code === 0 && signal === null) {
          reply.raw.end();
        } else {
          // Ya se habían enviado cabeceras (streaming empezado) y el proceso
          // terminó con error o fue matado (timeout / cliente desconectado /
          // señal). No se puede cambiar el status code a estas alturas, así
          // que se destruye la conexión en vez de cerrarla limpiamente: así
          // el cliente detecta una transferencia incompleta en lugar de
          // guardar un fichero truncado como si la descarga hubiese tenido
          // éxito.
          reply.raw.destroy();
        }
      });
    },
  );
}
