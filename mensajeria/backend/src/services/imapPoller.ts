import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { captureEmail } from './mailStore';

let timer: ReturnType<typeof setTimeout> | null = null;

export function startImapPoller(logger: {
  info: (m: string) => void;
  error: (m: string) => void;
}): void {
  const user = process.env.MENSAJERIA_IMAP_USER;
  const pass = process.env.MENSAJERIA_IMAP_PASSWORD;

  if (!user || !pass) {
    logger.info('imapPoller: MENSAJERIA_IMAP_USER/PASSWORD no configurados — polling desactivado');
    return;
  }

  const host = process.env.MENSAJERIA_IMAP_HOST ?? 'imap.gmail.com';
  const port = Number(process.env.MENSAJERIA_IMAP_PORT) || 993;
  const pollSeconds = Number(process.env.MENSAJERIA_IMAP_POLL_SECONDS) || 30;

  const credentials = { user, pass };

  logger.info(`imapPoller: iniciando polling IMAP ${host}:${port} cada ${pollSeconds}s`);

  async function poll(): Promise<void> {
    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: credentials,
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true })) {
          if (!msg.source) continue;
          const parsed: ParsedMail = await (simpleParser(msg.source) as Promise<ParsedMail>);
          await captureEmail({
            from: parsed.from?.text ?? 'desconocido',
            to: Array.isArray(parsed.to)
              ? parsed.to.map((t) => t.text).join(', ')
              : (parsed.to?.text ?? credentials.user),
            subject: parsed.subject ?? '(sin asunto)',
            text: parsed.text ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : null,
            source: 'imap',
          });
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err) {
      logger.error(
        `imapPoller: error en poll → ${err instanceof Error ? err.message : String(err)}`,
      );
      try {
        await client.logout();
      } catch {
        // ignorar error de logout tras fallo
      }
    } finally {
      timer = setTimeout(poll, pollSeconds * 1000);
    }
  }

  timer = setTimeout(poll, 0);
}

export function stopImapPoller(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
