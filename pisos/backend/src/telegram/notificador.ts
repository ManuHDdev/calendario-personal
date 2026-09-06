/**
 * Avisos por Telegram de pisos nuevos.
 *
 * Mismo patrón que `gastos/backend/src/telegram/bot.ts`: Telegraf en el
 * mismo proceso que Fastify y sin webhook público. La diferencia es que aquí
 * el bot es de una sola dirección — solo emite. No escucha comandos, así que
 * no hace long polling: se limita a llamar a la API de Telegram para enviar.
 *
 * Si no hay token configurado, todo esto se queda en un no-op registrado en
 * el log: el rastreo debe seguir funcionando y guardando anuncios aunque el
 * propietario todavía no haya creado el bot en @BotFather.
 */

import { Telegraf } from 'telegraf';
import type { NovedadAnuncio } from '../services/rastreo';
import { precioPorMetro } from '../services/criterios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

let bot: Telegraf | null = null;

export function notificacionesActivas(): boolean {
  return Boolean(BOT_TOKEN && OWNER_CHAT_ID);
}

function getBot(): Telegraf | null {
  if (!BOT_TOKEN) return null;
  if (!bot) bot = new Telegraf(BOT_TOKEN);
  return bot;
}

const NOMBRE_PORTAL: Record<string, string> = {
  fotocasa: 'Fotocasa',
  pisos: 'pisos.com',
  wallapop: 'Wallapop',
};

function euros(valor: number | null): string {
  if (valor === null) return '—';
  return `${valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`;
}

/**
 * Escapa el texto para `parse_mode: 'HTML'`.
 *
 * Va con HTML y no con Markdown a propósito: un título de anuncio real está
 * lleno de guiones bajos, asteriscos y corchetes, y en MarkdownV2 cada uno
 * de ellos rompe el mensaje entero. En HTML solo hay tres caracteres que
 * escapar.
 */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Construido aparte de Telegraf para poder testearlo sin red. */
export function formatearNovedad(novedad: NovedadAnuncio, nombreBusqueda: string): string {
  const { anuncio, tipo } = novedad;

  const cabecera =
    tipo === 'bajada'
      ? `📉 <b>Bajada de precio</b> · ${escaparHtml(nombreBusqueda)}`
      : `🏠 <b>Piso nuevo</b> · ${escaparHtml(nombreBusqueda)}`;

  // Se tacha `precio_notificado`, no `precio_previo`: lo util es contra que
  // precio ha bajado RESPECTO A LO QUE SE TE DIJO LA ULTIMA VEZ. Si un aviso
  // se perdio por el camino, `precio_previo` enseñaria un precio intermedio
  // que el propietario nunca llego a ver.
  const precio =
    tipo === 'bajada' && anuncio.precio_notificado !== null
      ? `${euros(anuncio.precio)}  <s>${euros(anuncio.precio_notificado)}</s>`
      : euros(anuncio.precio);

  const caracteristicas = [
    anuncio.metros !== null ? `${anuncio.metros} m²` : null,
    anuncio.habitaciones !== null ? `${anuncio.habitaciones} hab` : null,
    anuncio.banos !== null ? `${anuncio.banos} baños` : null,
    anuncio.planta,
  ].filter(Boolean);

  const porMetro = precioPorMetro(anuncio.precio, anuncio.metros);

  const lineas = [
    cabecera,
    '',
    `<b>${escaparHtml(anuncio.titulo)}</b>`,
    `💶 ${precio}${porMetro !== null ? `  ·  ${euros(porMetro)}/m²` : ''}`,
  ];

  if (caracteristicas.length > 0) lineas.push(`📐 ${escaparHtml(caracteristicas.join(' · '))}`);
  if (anuncio.ubicacion) lineas.push(`📍 ${escaparHtml(anuncio.ubicacion)}`);
  lineas.push(`🔗 ${NOMBRE_PORTAL[anuncio.portal] ?? anuncio.portal}: ${anuncio.url}`);

  return lineas.join('\n');
}

/**
 * Envía los avisos de un rastreo.
 *
 * Devuelve los ids de los anuncios efectivamente notificados, para que quien
 * llame los marque en la base de datos: si Telegram falla, el anuncio NO
 * queda marcado y se reintenta en el siguiente rastreo, en vez de perderse.
 */
export async function notificarNovedades(
  novedades: NovedadAnuncio[],
  nombreBusqueda: string,
  log?: { warn: (msg: string) => void },
): Promise<string[]> {
  if (novedades.length === 0) return [];

  const cliente = getBot();
  if (!cliente || !OWNER_CHAT_ID) {
    log?.warn(
      `TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID sin configurar: ${novedades.length} novedad(es) sin avisar`,
    );
    return [];
  }

  const notificados: string[] = [];
  for (const novedad of novedades) {
    try {
      await cliente.telegram.sendMessage(OWNER_CHAT_ID, formatearNovedad(novedad, nombreBusqueda), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: false },
      });
      notificados.push(novedad.anuncio.id);
    } catch (err) {
      log?.warn(
        `No se pudo avisar del anuncio ${novedad.anuncio.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return notificados;
}
