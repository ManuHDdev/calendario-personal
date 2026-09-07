/**
 * Averigua el TELEGRAM_OWNER_CHAT_ID a partir del token del bot.
 *
 *   TELEGRAM_BOT_TOKEN=... npm run telegram:chat-id
 *
 * Existe para no tener que pegar la URL `https://api.telegram.org/bot<TOKEN>/
 * getUpdates` en el navegador: esa URL LLEVA EL TOKEN DENTRO, y acaba en el
 * historial, en la sincronización de pestañas y en cualquier extensión que lea
 * la barra de direcciones. Aquí el token viaja por variable de entorno y no se
 * imprime nunca.
 *
 * Requisito: háblale al bot por Telegram ANTES de ejecutarlo. Telegram solo
 * expone los mensajes recibidos, así que sin un mensaje previo no hay nada que
 * mirar.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface Update {
  message?: { chat?: { id?: number; type?: string; username?: string; first_name?: string } };
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error('Falta TELEGRAM_BOT_TOKEN.\n  TELEGRAM_BOT_TOKEN=<token> npm run telegram:chat-id');
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
  if (!res.ok) {
    // El cuerpo del error de Telegram no incluye el token; la URL sí, así que
    // no se imprime.
    console.error(`Telegram respondió ${res.status}. ¿El token es correcto?`);
    process.exit(1);
  }

  const cuerpo = (await res.json()) as { ok?: boolean; result?: Update[] };
  const chats = new Map<number, string>();

  for (const update of cuerpo.result ?? []) {
    const chat = update.message?.chat;
    if (typeof chat?.id !== 'number') continue;
    chats.set(chat.id, chat.username ?? chat.first_name ?? chat.type ?? '');
  }

  if (chats.size === 0) {
    console.log(
      'Sin mensajes todavía.\n' +
        'Abre Telegram, escríbele algo a tu bot (un "hola" vale) y vuelve a ejecutar esto.\n' +
        'Ojo: Telegram descarta los updates pasadas ~24 h.',
    );
    return;
  }

  console.log('Chats que le han escrito al bot:\n');
  for (const [id, quien] of chats) {
    console.log(`  TELEGRAM_OWNER_CHAT_ID=${id}${quien ? `   (${quien})` : ''}`);
  }
  console.log('\nEl tuyo es el que reconozcas. Cópialo al .env del VPS.');
}

void main();
