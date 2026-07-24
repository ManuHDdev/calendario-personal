import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, hasAnyRole } from '../middleware/auth';
import {
  isAllowedYoutubeUrl,
  isValidFormat,
  contentTypeFor,
  buildFilename,
  DownloadFormat,
} from '../services/validation';
import { fetchTitle, spawnDownload, DOWNLOAD_TIMEOUT_MS } from '../services/ytdlp';

export async function downloadRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // admin + familia sí, invitado no
  app.addHook('preHandler', async (request, reply) => {
    if (!hasAnyRole(request.user, ['admin', 'familia'])) {
      reply.code(403).send({ error: 'Forbidden', message: 'Insufficient role' });
    }
  });

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
      const child = spawnDownload(url, validFormat);

      let headersSent = false;
      let finished = false;
      let stderrTail = '';

      // yt-dlp corre detached como líder de su propio grupo de procesos; para
      // matar también al ffmpeg que lanza internamente hay que señalizar el
      // grupo entero (pid negativo), no solo el proceso yt-dlp.
      //
      // `child.killed` NO sirve como guarda aquí: esa propiedad solo se pone a
      // true cuando se llama a `.kill()` sobre el propio ChildProcess, y este
      // código siempre llama al `process.kill()` de módulo — así que nunca
      // reflejaría un kill de grupo. Se usa un flag propio en su lugar.
      // Además, si el grupo ya había terminado (timeout y desconexión de
      // cliente pueden solaparse, o el proceso pudo morir por su cuenta justo
      // antes), `process.kill(-pid, ...)` lanza síncronamente ESRCH; sin
      // try/catch eso se propagaría desde un listener de evento y tumbaría
      // todo el proceso backend (todas las descargas en curso), no solo esta
      // petición.
      let killed = false;
      const killProcessGroup = () => {
        if (killed || !child.pid) return;
        killed = true;
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ESRCH') {
            request.log.warn({ err }, 'yt-dlp: fallo inesperado al matar el grupo de procesos');
          }
          // ESRCH => el grupo ya no existía: éxito (nada que matar), no error.
        }
      };

      const timeoutHandle = setTimeout(() => {
        killProcessGroup();
      }, DOWNLOAD_TIMEOUT_MS);

      const cleanup = () => clearTimeout(timeoutHandle);

      // Cliente cierra la conexión (tab cerrada, descarga cancelada, etc.)
      request.raw.on('close', () => {
        if (!finished) killProcessGroup();
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-2000);
      });

      // Tomamos control manual de la respuesta: no sabemos si yt-dlp va a
      // producir bytes hasta que llega el primer chunk o el proceso termina.
      reply.hijack();

      child.stdout?.once('data', (firstChunk: Buffer) => {
        if (finished) return;
        headersSent = true;
        reply.raw.writeHead(200, {
          'Content-Type': contentTypeFor(validFormat),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Transfer-Encoding': 'chunked',
        });
        reply.raw.write(firstChunk);
        // end:false — el cierre de la respuesta se gestiona explícitamente
        // en el handler 'close' del child process para evitar un doble end().
        child.stdout?.pipe(reply.raw, { end: false });
      });

      child.on('error', (err) => {
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

      child.on('close', (code, signal) => {
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
