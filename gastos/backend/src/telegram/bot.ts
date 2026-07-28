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

/** Texto de ayuda mostrado en /start y /help — extraído como constante para poder testearlo. */
export const HELP_MESSAGE =
  '👋 Bot de Gastos\n\n' +
  'Envíame una foto de un ticket de compra o una captura de tu app del banco. ' +
  'Te preguntaré de qué tipo es (🧾 Ticket / 🏦 Banco) y con eso creo un borrador ' +
  'de gasto con importe, fecha y comercio, pendiente de revisión en la app.\n\n' +
  'Comandos:\n' +
  '/start, /help — muestra este mensaje\n\n' +
  'No hace falta nada más: solo mándame la imagen.';

let bot: Telegraf | null = null;

interface TelegramPhotoSize { file_id: string }

/** Telegram envía el mismo encuadre en varias resoluciones; la última es la de mayor calidad. */
export function pickBestPhotoFileId(photos: TelegramPhotoSize[]): string | undefined {
  return photos.length > 0 ? photos[photos.length - 1].file_id : undefined;
}

// La foto llega en un mensaje del propio owner; el teclado Ticket/Banco se
// envía como un mensaje NUEVO del bot (ctx.reply no adjunta al original), así
// que ctx.callbackQuery.message en el handler del botón es ese mensaje del
// bot — nunca contiene la foto. Por eso el file_id se guarda aquí, por
// chat.id, en cuanto llega la foto, y se recupera al pulsar el botón.
const pendingPhotos = new Map<number, string>();

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

  instance.start(async (ctx) => {
    await ctx.reply(HELP_MESSAGE);
  });

  instance.help(async (ctx) => {
    await ctx.reply(HELP_MESSAGE);
  });

  instance.on('photo', async (ctx) => {
    const fileId = pickBestPhotoFileId(ctx.message.photo);
    if (!fileId) return;
    pendingPhotos.set(ctx.chat.id, fileId);

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

    const chatId = ctx.chat?.id;
    const fileId = chatId !== undefined ? pendingPhotos.get(chatId) : undefined;
    if (!fileId) {
      await ctx.reply('No se encontró la imagen. Vuelve a enviarla.');
      return;
    }
    if (chatId !== undefined) pendingPhotos.delete(chatId);

    try {
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
