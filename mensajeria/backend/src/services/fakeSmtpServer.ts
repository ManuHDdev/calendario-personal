import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { captureEmail } from './mailStore';

/**
 * SMTP falso en proceso (paquete `smtp-server`), siempre disponible en modo
 * mock. No relay nada: cualquier sesión SMTP que le hablen (incluida otra
 * herramienta apuntada a MENSAJERIA_SMTP_PORT) se parsea y se captura en
 * `mensajeria_captured_emails` en vez de reenviarse de verdad. El envío
 * disparado desde la API (`MockEmailAdapter`) no pasa por este socket — llama
 * directamente a `captureEmail()` para no depender de temporización de red en
 * los tests — pero ambos caminos alimentan la misma tabla/inbox.
 */
let server: SMTPServer | null = null;

export function startFakeSmtpServer(port: number, logger?: { info: (msg: string) => void; error: (msg: string) => void }): SMTPServer {
  if (server) return server;

  server = new SMTPServer({
    disabledCommands: ['AUTH', 'STARTTLS'],
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then(async (parsed) => {
          await captureEmail({
            from: parsed.from?.text ?? 'desconocido',
            to: Array.isArray(parsed.to)
              ? parsed.to.map((t) => t.text).join(', ')
              : parsed.to?.text ?? 'desconocido',
            subject: parsed.subject ?? '(sin asunto)',
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : null,
          });
          callback();
        })
        .catch((err) => {
          logger?.error(`fakeSmtpServer: error al parsear email entrante: ${err}`);
          callback(err instanceof Error ? err : new Error(String(err)));
        });
    },
  });

  server.on('error', (err) => {
    logger?.error(`fakeSmtpServer: ${err.message}`);
  });

  server.listen(port, () => {
    logger?.info(`fakeSmtpServer (mock) escuchando en el puerto ${port}`);
  });

  return server;
}

export function stopFakeSmtpServer(): void {
  server?.close();
  server = null;
}
