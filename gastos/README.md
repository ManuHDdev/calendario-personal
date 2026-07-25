# Gastos

Tracker de gastos personales. Ver `openspec/changes/2026-07-25-add-gastos-app/` para la propuesta, el diseño y los requisitos completos.

## Configurar el bot de Telegram (paso manual)

El bot no se puede crear automáticamente — requiere una cuenta de Telegram del propietario.

1. Abre una conversación con [@BotFather](https://t.me/BotFather) en Telegram.
2. Envía `/newbot` y sigue las instrucciones (nombre, username terminado en `bot`).
3. BotFather te devuelve un token con forma `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Cópialo en la variable de entorno `TELEGRAM_BOT_TOKEN` de `gastos/backend` (ver `.env.example`).
4. Averigua tu `chat.id` numérico: habla con [@userinfobot](https://t.me/userinfobot) (o similar) desde la cuenta que va a usar el bot, o mira los logs del backend tras enviarle un mensaje al bot recién creado (se puede añadir un log temporal). Copia ese número en `TELEGRAM_OWNER_CHAT_ID`.
5. Reinicia el backend de `gastos`. El bot arranca en long polling junto al servidor Fastify — no requiere ninguna ruta pública ni webhook.
6. Cualquier mensaje que no venga de `TELEGRAM_OWNER_CHAT_ID` se ignora sin respuesta (ver `spec.md`, requisito "Telegram bot restricted to the owner").

Sin `TELEGRAM_BOT_TOKEN` configurado, el backend arranca igualmente (API HTTP y frontend funcionan) pero el bot queda deshabilitado — útil para desarrollo local antes de crear el bot.
