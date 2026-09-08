/**
 * Bot de Telegram de doble sentido.
 *
 * A diferencia del de `pisos` (que solo emite), este también escucha, como el
 * de `gastos`: long polling en el mismo proceso Fastify, sin webhook público.
 *
 * Es la pieza que convierte un ámbar en algo accionable. El rastreador solo
 * tiene la coordenada ofuscada que publica el portal; tú tienes la dirección
 * exacta en cuanto llamas al anuncio. Mandársela al bot baja el margen de
 * incertidumbre a cero y da una respuesta que sí sirve para decidir.
 *
 * Cualquier mensaje que no venga de TELEGRAM_OWNER_CHAT_ID se ignora en
 * silencio — mismo criterio que `gastos`.
 */

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { resolverConsulta } from '../services/comprobacion';
import { formatearVeredicto, AYUDA } from './formato';
import { GeocodingError } from '../services/geocoding';
import { todosLosProviders } from '../portales';

let bot: Telegraf | null = null;

function ownerChatId(): string | null {
  return process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || null;
}

/** ¿Habla el propietario? Cualquier otro chat no recibe respuesta. */
function esPropietario(chatId: number | string | undefined): boolean {
  const owner = ownerChatId();
  return owner !== null && String(chatId) === owner;
}

async function responderConsulta(
  ctx: { reply: (t: string, e?: object) => Promise<unknown> },
  consulta: Parameters<typeof resolverConsulta>[0],
  descripcionFallback?: string,
): Promise<void> {
  try {
    const { punto, resultado } = await resolverConsulta(consulta);
    await ctx.reply(
      formatearVeredicto(resultado, {
        descripcionPunto: punto.descripcion ?? descripcionFallback ?? null,
      }),
      { parse_mode: 'Markdown' },
    );
  } catch (err) {
    if (err instanceof GeocodingError) {
      await ctx.reply(`No he podido situar esa dirección: ${err.message}`);
      return;
    }
    // Un fallo aquí no debe tumbar el long polling ni dejar al usuario
    // esperando una respuesta que no llega.
    await ctx.reply(
      `Ha fallado la comprobación: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Arranca el bot si está configurado.
 *
 * Sin token o sin chat de propietario NO es un error: el resto de la app
 * funciona igual, solo se queda sin avisos y sin consultas. Se dice una vez en
 * el log al arrancar, igual que en `pisos`.
 */
export function iniciarBot(log: { info: (m: string) => void; warn: (m: string) => void }): Telegraf | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !ownerChatId()) {
    log.warn(
      'Telegram desactivado: faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_OWNER_CHAT_ID. ' +
        'La app funciona igual, pero sin avisos ni consultas desde el móvil.',
    );
    return null;
  }

  bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    if (!esPropietario(ctx.chat?.id)) return;
    await next();
  });

  bot.start(async (ctx) => ctx.reply(AYUDA, { parse_mode: 'Markdown' }));
  bot.help(async (ctx) => ctx.reply(AYUDA, { parse_mode: 'Markdown' }));
  bot.command('ayuda', async (ctx) => ctx.reply(AYUDA, { parse_mode: 'Markdown' }));

  // Ubicación compartida: el caso más cómodo desde el móvil, estando delante
  // del local.
  bot.on(message('location'), async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    await ctx.reply('Calculando distancias caminando…');
    await responderConsulta(
      ctx,
      { latitud: latitude, longitud: longitude },
      `Ubicación compartida (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`,
    );
  });

  bot.command('comprobar', async (ctx) => {
    const direccion = ctx.message.text.replace(/^\/comprobar(@\S+)?\s*/i, '').trim();
    if (!direccion) {
      await ctx.reply('Dime la dirección: `/comprobar Calle Mayor 12, Madrid`', {
        parse_mode: 'Markdown',
      });
      return;
    }
    await ctx.reply('Buscando esa dirección y calculando…');
    await responderConsulta(ctx, { direccion });
  });

  bot.on(message('text'), async (ctx) => {
    const texto = ctx.message.text.trim();
    if (texto.startsWith('/')) return;

    // Una URL de anuncio: se busca un portal que sepa leerla y se saca la
    // ubicación. Si el anuncio no publica coordenadas, se pide la dirección.
    if (/^https?:\/\//i.test(texto)) {
      const provider = todosLosProviders().find((p) => p.puedeParsearUrl(texto));
      if (!provider) {
        await ctx.reply(
          'No reconozco ese portal. Mándame la dirección del local con `/comprobar` y te lo calculo igual.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      await ctx.reply('Leyendo el anuncio…');
      try {
        const crudo = await provider.parsearUrl(texto);
        if (!crudo || crudo.latitud === null || crudo.longitud === null) {
          await ctx.reply(
            'He podido abrir el anuncio, pero no he podido sacar su ubicación. ' +
              'Mándame la dirección con `/comprobar` y te lo calculo.',
            { parse_mode: 'Markdown' },
          );
          return;
        }
        await responderConsulta(
          ctx,
          {
            latitud: crudo.latitud,
            longitud: crudo.longitud,
            precision: crudo.precision,
            comunidad: crudo.comunidad ?? undefined,
            provincia: crudo.provincia ?? undefined,
            municipio: crudo.municipio ?? undefined,
          },
          crudo.titulo,
        );
      } catch (err) {
        await ctx.reply(
          `No he podido leer ese anuncio: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    // Texto suelto con pinta de dirección: se trata como tal, que es lo que
    // uno espera al pegar una dirección en el chat.
    if (texto.length >= 6) {
      await responderConsulta(ctx, { direccion: texto });
      return;
    }

    await ctx.reply(AYUDA, { parse_mode: 'Markdown' });
  });

  bot.catch((err) => {
    log.warn(`Error no capturado en el bot de Telegram: ${err instanceof Error ? err.message : String(err)}`);
  });

  // `launch()` no resuelve mientras el bot vive, así que no se espera: se
  // lanza y se sigue levantando el servidor HTTP.
  void bot.launch();
  log.info('Bot de Telegram escuchando (long polling).');

  return bot;
}

export function pararBot(): void {
  bot?.stop('SIGTERM');
  bot = null;
}

/**
 * Envía un aviso al propietario.
 *
 * Devuelve `false` si no se pudo enviar, para que quien avisa NO marque el
 * anuncio como notificado y lo reintente en la siguiente vuelta (mismo
 * criterio que `pisos`).
 */
export async function avisar(texto: string): Promise<boolean> {
  const owner = ownerChatId();
  if (!bot || !owner) return false;
  try {
    await bot.telegram.sendMessage(owner, texto, { parse_mode: 'Markdown' });
    return true;
  } catch {
    return false;
  }
}
