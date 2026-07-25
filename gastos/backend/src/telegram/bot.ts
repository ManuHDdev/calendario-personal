import { Telegraf, Markup } from 'telegraf';
import { runOcrPipeline, type Perfil } from '../ocr/pipeline';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

/**
 * Comprueba que un mensaje viene del chat del propietario. Función pura (sin
 * dependencias de Telegraf) para poder testearla sin levantar el bot real —
 * ver spec.md "Telegram bot restricted to the owner".
 */
export function isFromOwner(chatId: number | string | undefined, ownerChatId: string | undefined): boolean {
  if (!ownerChatId || chatId === undefined || chatId === null) return false;
  return String(chatId) === String(ownerChatId);
}

let bot: Telegraf | null = null;

/** Arranca el bot en long polling. Idempotente: una segunda llamada devuelve la instancia ya creada. */
export function startBot(): Telegraf {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN no configurado');
  if (bot) return bot;

  const instance = new Telegraf(BOT_TOKEN);

  // Guard de propietario: cualquier mensaje que no venga del chat.id
  // configurado se ignora POR COMPLETO — ni siquiera se responde, para no
  // confirmarle a un desconocido que el bot existe (ver design.md).
  instance.use(async (ctx, next) => {
    if (!isFromOwner(ctx.chat?.id, OWNER_CHAT_ID)) return;
    await next();
  });

  instance.on('photo', async (ctx) => {
    await ctx.reply(
      '¿Qué tipo de imagen es?',
      Markup.inlineKeyboard([
        Markup.button.callback('🧾 Ticket', 'perfil:ticket'),
        Markup.button.callback('🏦 Banco', 'perfil:banco'),
      ]),
    );
  });

  instance.action(/^perfil:(ticket|banco)$/, async (ctx) => {
    const perfil = ctx.match[1] as Perfil;
    await ctx.answerCbQuery();

    const message = ctx.callbackQuery.message;
    const photos = message && 'photo' in message ? message.photo : undefined;
    if (!photos || photos.length === 0) {
      await ctx.reply('No se encontró la imagen. Vuelve a enviarla.');
      return;
    }

    try {
      // Telegram envía el mismo tamaño en varias resoluciones; la última es la de mayor calidad.
      const fileId = photos[photos.length - 1].file_id;
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const response = await fetch(fileLink.toString());
      const buffer = Buffer.from(await response.arrayBuffer());

      const { draft } = await runOcrPipeline(buffer, perfil);
      await ctx.reply(
        'Borrador creado — pendiente de revisión en la app:\n' +
          `Importe: ${draft.importe !== null ? draft.importe.toFixed(2) + ' €' : '—'}\n` +
          `Fecha: ${draft.fecha}\n` +
          `Comercio: ${draft.comercio || '—'}`,
      );
    } catch (err) {
      await ctx.reply(
        `No se pudo procesar la imagen: ${err instanceof Error ? err.message : 'error desconocido'}`,
      );
    }
  });

  instance.launch();
  bot = instance;
  return bot;
}

export function stopBot(): void {
  bot?.stop('SIGTERM');
  bot = null;
}
