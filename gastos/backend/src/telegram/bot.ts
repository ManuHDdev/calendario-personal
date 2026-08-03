import { Telegraf, Markup } from 'telegraf';
import { parseImage, persistGasto, type Perfil } from '../ocr/pipeline';
import { fechaSchema } from '../schemas/gasto.schema';
import type { DraftGasto } from '../types/gasto';

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
  'Te preguntaré de qué tipo es (🧾 Ticket / 🏦 Banco) y con eso genero un borrador ' +
  'con importe, fecha y comercio — SIN guardarlo todavía.\n\n' +
  'Revísalo y, si algo está mal, corrígelo antes de enviarlo.\n\n' +
  'Comandos:\n' +
  '/start, /help — muestra este mensaje\n' +
  '/editar <campo> <valor> — corrige el borrador pendiente (campo: importe, fecha o comercio)\n' +
  '/enviar — guarda el borrador pendiente, queda pendiente de revisión en la app\n' +
  '/descartar — descarta el borrador pendiente sin guardarlo\n\n' +
  'Ejemplo: /editar importe 12,50';

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

/**
 * Borrador OCR ya generado (parseImage) pero aún NO persistido — a la espera
 * de que el propietario lo revise/corrija con /editar y confirme con
 * /enviar (o lo descarte con /descartar). Un único borrador pendiente por
 * chat: si llega una foto nueva mientras hay uno pendiente, la nueva
 * simplemente sustituye a la anterior (mismo comportamiento que ya tenía
 * pendingPhotos.set — no se avisa de la sustitución, ver design.md).
 */
interface PendingDraft {
  draft: DraftGasto;
  perfil: Perfil;
  imageBuffer: Buffer;
}
const pendingDrafts = new Map<number, PendingDraft>();

/** Formatea el borrador para mostrarlo en el chat, dejando claro si ya se guardó o no. */
export function formatDraftMessage(draft: DraftGasto, opts: { saved: boolean }): string {
  const header = opts.saved
    ? 'Guardado — pendiente de revisión en la app:'
    : 'Borrador (aún NO guardado) — revisa y corrige con /editar, o /enviar para guardarlo:';
  return (
    `${header}\n` +
    `Importe: ${draft.importe !== null ? draft.importe.toFixed(2) + ' €' : '—'}\n` +
    `Fecha: ${draft.fecha}\n` +
    `Comercio: ${draft.comercio || '—'}`
  );
}

const EDITABLE_FIELDS = ['importe', 'fecha', 'comercio'] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Parsea "/editar <campo> <valor...>" del texto crudo del mensaje. Null si no cumple el formato mínimo. */
export function parseEditCommand(text: string): { campo: string; valor: string } | null {
  const match = text.match(/^\/editar(?:@\S+)?\s+(\S+)\s+([\s\S]+)$/);
  if (!match) return null;
  return { campo: match[1], valor: match[2].trim() };
}

export type EditResult = { ok: true; draft: DraftGasto } | { ok: false; error: string };

/**
 * Valida <valor> según <campo> y devuelve el draft actualizado, o un error en
 * español sin mutar nada: importe tolera coma/punto decimal (mismo criterio
 * que frontend/PendingReview.tsx), fecha exige YYYY-MM-DD (fechaSchema,
 * compartido con el resto de la app), comercio cualquier string no vacío.
 */
export function applyEditToDraft(draft: DraftGasto, campo: string, valor: string): EditResult {
  if (campo === 'importe') {
    const parsed = parseFloat(valor.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, error: 'El importe debe ser un número mayor que 0 (usa coma o punto como separador decimal).' };
    }
    return { ok: true, draft: { ...draft, importe: parsed } };
  }

  if (campo === 'fecha') {
    if (!fechaSchema.safeParse(valor).success) {
      return { ok: false, error: 'La fecha debe tener el formato YYYY-MM-DD (por ejemplo, 2026-08-03).' };
    }
    return { ok: true, draft: { ...draft, fecha: valor } };
  }

  if (campo === 'comercio') {
    const trimmed = valor.trim();
    if (!trimmed) {
      return { ok: false, error: 'El comercio no puede estar vacío.' };
    }
    return { ok: true, draft: { ...draft, comercio: trimmed } };
  }

  return {
    ok: false,
    error: `Campo desconocido: "${campo}". Usa uno de: ${EDITABLE_FIELDS.join(', ')}.`,
  };
}

// Tipos mínimos duck-typed del ctx de Telegraf — solo lo que cada handler
// usa, para poder testear cada handler con un ctx de mentira sin arrancar
// Telegraf real (mismo espíritu que TelegramPhotoSize más arriba).
interface ChatLike { id: number }
interface ReplyCtx {
  chat?: ChatLike;
  reply(text: string, extra?: any): Promise<unknown>;
}
interface PhotoMessageCtx extends ReplyCtx {
  message: { photo: TelegramPhotoSize[] };
}
interface ProfileActionCtx extends ReplyCtx {
  match: RegExpExecArray | RegExpMatchArray;
  answerCbQuery(): Promise<unknown>;
  telegram: { getFileLink(fileId: string): Promise<{ toString(): string }> };
}
interface CommandCtx extends ReplyCtx {
  message: { text: string };
}

export async function handlePhotoMessage(ctx: PhotoMessageCtx): Promise<void> {
  const fileId = pickBestPhotoFileId(ctx.message.photo);
  if (!fileId || ctx.chat === undefined) return;
  pendingPhotos.set(ctx.chat.id, fileId);

  await ctx.reply(
    '¿Qué tipo de imagen es?',
    Markup.inlineKeyboard([
      Markup.button.callback('🧾 Ticket', 'perfil:ticket'),
      Markup.button.callback('🏦 Banco', 'perfil:banco'),
    ]),
  );
}

export async function handleProfileSelection(ctx: ProfileActionCtx): Promise<void> {
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
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    const draft = await parseImage(imageBuffer, perfil);
    if (chatId !== undefined) pendingDrafts.set(chatId, { draft, perfil, imageBuffer });

    await ctx.reply(formatDraftMessage(draft, { saved: false }));
  } catch (err) {
    await ctx.reply(
      `No se pudo procesar la imagen: ${err instanceof Error ? err.message : 'error desconocido'}`,
    );
  }
}

export async function handleEditarCommand(ctx: CommandCtx): Promise<void> {
  const chatId = ctx.chat?.id;
  const pending = chatId !== undefined ? pendingDrafts.get(chatId) : undefined;
  if (!pending) {
    await ctx.reply('No hay ningún borrador pendiente. Envía primero una foto.');
    return;
  }

  const parsed = parseEditCommand(ctx.message.text);
  if (!parsed) {
    await ctx.reply('Uso: /editar <campo> <valor>  (campo: importe, fecha o comercio). Ejemplo: /editar importe 12,50');
    return;
  }

  const result = applyEditToDraft(pending.draft, parsed.campo, parsed.valor);
  if (!result.ok) {
    await ctx.reply(`⚠️ ${result.error}`);
    return;
  }

  pending.draft = result.draft;
  await ctx.reply(`✅ Campo actualizado.\n\n${formatDraftMessage(pending.draft, { saved: false })}`);
}

export async function handleEnviarCommand(ctx: CommandCtx): Promise<void> {
  const chatId = ctx.chat?.id;
  const pending = chatId !== undefined ? pendingDrafts.get(chatId) : undefined;
  if (!pending) {
    await ctx.reply('No hay ningún borrador pendiente que enviar. Envía primero una foto.');
    return;
  }

  try {
    await persistGasto(pending.draft, pending.perfil, pending.imageBuffer);
    if (chatId !== undefined) pendingDrafts.delete(chatId);
    await ctx.reply(formatDraftMessage(pending.draft, { saved: true }));
  } catch (err) {
    await ctx.reply(
      `No se pudo guardar el gasto: ${err instanceof Error ? err.message : 'error desconocido'}`,
    );
  }
}

export async function handleDescartarCommand(ctx: CommandCtx): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined || !pendingDrafts.has(chatId)) {
    await ctx.reply('No hay ningún borrador pendiente que descartar.');
    return;
  }
  pendingDrafts.delete(chatId);
  await ctx.reply('Borrador descartado. No se ha guardado nada.');
}

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

  instance.on('photo', handlePhotoMessage);
  instance.action(/^perfil:(ticket|banco)$/, handleProfileSelection);
  instance.command('editar', handleEditarCommand);
  instance.command('enviar', handleEnviarCommand);
  instance.command('descartar', handleDescartarCommand);

  instance.launch();
  bot = instance;
  return bot;
}

export function stopBot(): void {
  bot?.stop('SIGTERM');
  bot = null;
}
