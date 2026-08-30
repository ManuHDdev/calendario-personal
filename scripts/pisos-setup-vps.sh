#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deja la subapp `pisos` funcionando en el VPS.
#
# Se ejecuta DESDE TU MÁQUINA (la que tiene la clave SSH del VPS):
#
#     bash scripts/pisos-setup-vps.sh
#
# Hace lo único que el pipeline de GitHub Actions no puede hacer solo: crear
# /home/manu/pisos/.env, que contiene secretos y por eso no vive en el
# repositorio. Después levanta los contenedores y comprueba que responden.
#
# Es idempotente: si el .env ya existe, conserva la contraseña de la base de
# datos que tuviera (regenerarla dejaría la base inaccesible) y solo actualiza
# lo que haga falta.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

VPS_HOST="${VPS_HOST:-87.216.88.165}"
VPS_PORT="${VPS_PORT:-2269}"
VPS_USER="${VPS_USER:-manu}"
REMOTE_DIR="/home/manu/pisos"
SSH="ssh -p ${VPS_PORT} ${VPS_USER}@${VPS_HOST}"

rojo()  { printf '\033[0;31m%s\033[0m\n' "$*"; }
verde() { printf '\033[0;32m%s\033[0m\n' "$*"; }
info()  { printf '\033[0;36m%s\033[0m\n' "$*"; }
aviso() { printf '\033[0;33m%s\033[0m\n' "$*"; }

morir() { rojo "✗ $*"; exit 1; }

# ── 1. Datos del bot ─────────────────────────────────────────────────────────
# Se piden por entrada estándar y no se guardan en el historial del shell.
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_OWNER_CHAT_ID="${TELEGRAM_OWNER_CHAT_ID:-}"

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  read -rsp "Token del bot de Telegram (de @BotFather): " TELEGRAM_BOT_TOKEN
  echo ""
fi
if [ -z "$TELEGRAM_OWNER_CHAT_ID" ]; then
  read -rp "Tu chat id de Telegram: " TELEGRAM_OWNER_CHAT_ID
fi

[ -n "$TELEGRAM_BOT_TOKEN" ] || morir "Sin token no puede haber avisos."
[ -n "$TELEGRAM_OWNER_CHAT_ID" ] || morir "Sin chat id no puede haber avisos."

# ── 2. Probar Telegram ANTES de tocar el VPS ─────────────────────────────────
# Merece la pena fallar aquí: si el token es incorrecto o el bot nunca ha
# recibido un /start, el rastreador funcionaría igual pero en silencio, y eso
# es exactamente el fallo que no quieres descubrir dentro de una semana.
info "Comprobando el bot de Telegram..."
RESPUESTA=$(curl -sS --max-time 20 \
  -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_OWNER_CHAT_ID}" \
  -d "text=✅ Pisos conectado. A partir de ahora te avisaré por aquí de los pisos nuevos." \
  || echo '{"ok":false,"description":"no se pudo contactar con api.telegram.org"}')

if ! grep -q '"ok":true' <<<"$RESPUESTA"; then
  rojo "✗ Telegram rechazó el envío:"
  echo "  $RESPUESTA"
  echo ""
  aviso "Causas habituales:"
  aviso "  · No has pulsado «Empezar» en el bot. Un bot NO puede escribir el"
  aviso "    primero a quien nunca le ha hablado (error 403)."
  aviso "  · El token o el chat id no son correctos."
  exit 1
fi
verde "✓ Mensaje de prueba enviado — míralo en Telegram."

# ── 3. Comprobar acceso al VPS ───────────────────────────────────────────────
info "Conectando al VPS..."
$SSH -o ConnectTimeout=15 -o BatchMode=yes true 2>/dev/null \
  || morir "No se pudo conectar por SSH a ${VPS_USER}@${VPS_HOST}:${VPS_PORT}"
verde "✓ SSH correcto."

# ── 4. Escribir el .env ──────────────────────────────────────────────────────
# La contraseña se genera EN EL VPS y solo si no había una previa: si la base
# ya está inicializada, cambiarla la dejaría inaccesible.
# El token viaja por entrada estándar, NO como argumento de ssh: un argumento
# quedaría visible en el `ps` del servidor mientras dura la conexión.
info "Escribiendo ${REMOTE_DIR}/.env..."
{
  printf 'TELEGRAM_BOT_TOKEN=%q\n' "$TELEGRAM_BOT_TOKEN"
  printf 'TELEGRAM_OWNER_CHAT_ID=%q\n' "$TELEGRAM_OWNER_CHAT_ID"
  cat <<'REMOTO'
set -euo pipefail
DIR=/home/manu/pisos
mkdir -p "$DIR"

PASS=""
if [ -f "$DIR/.env" ]; then
  PASS=$(grep -E '^PISOS_DB_PASSWORD=' "$DIR/.env" | cut -d= -f2- || true)
fi
if [ -z "$PASS" ]; then
  PASS=$(openssl rand -hex 24)
  echo "  contraseña de base de datos generada"
else
  echo "  se conserva la contraseña de base de datos existente"
fi

umask 077
cat > "$DIR/.env" <<ENV
PISOS_DB_NAME=pisos
PISOS_DB_USER=pisos
PISOS_DB_PASSWORD=${PASS}
PISOS_INTERVALO_MINUTOS=15
PISOS_PAGINAS_POR_PORTAL=2
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_OWNER_CHAT_ID=${TELEGRAM_OWNER_CHAT_ID}
ENV
chmod 600 "$DIR/.env"
REMOTO
} | $SSH "bash -s"
verde "✓ .env escrito (permisos 600)."

# ── 5. Levantar la aplicación ────────────────────────────────────────────────
info "Levantando los contenedores..."
$SSH "bash -s" <<'REMOTO'
set -euo pipefail
cd /home/manu/pisos

[ -f docker-compose.prod.yml ] || {
  echo "Falta docker-compose.prod.yml. Lo copia el pipeline: relanza el workflow 'CI/CD Pisos'." >&2
  exit 1
}

# Un intento previo sin .env pudo dejar un pisos-db a medio crear, con la
# configuración vieja y un volumen sin inicializar. Se retira para que
# init.sql corra limpio; el volumen no tiene datos que perder todavía.
if docker inspect pisos-db >/dev/null 2>&1; then
  if ! docker exec pisos-db pg_isready -U pisos -d pisos >/dev/null 2>&1; then
    echo "  retirando un pisos-db previo que nunca llegó a inicializarse"
    docker compose -f docker-compose.prod.yml down -v || true
  fi
fi

docker compose -f docker-compose.prod.yml pull pisos-backend pisos-frontend
docker compose -f docker-compose.prod.yml up -d
REMOTO
verde "✓ Contenedores arrancados."

# ── 6. Verificar ─────────────────────────────────────────────────────────────
info "Esperando a que el backend responda..."
for intento in $(seq 1 30); do
  if $SSH "curl -sf http://localhost:3012/pisos/api/health >/dev/null 2>&1 || docker exec pisos-backend node -e \"require('http').get('http://localhost:3012/pisos/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))\"" 2>/dev/null; then
    verde "✓ El backend responde."
    break
  fi
  [ "$intento" -eq 30 ] && {
    rojo "✗ El backend no respondió en 60 s. Últimas líneas del log:"
    $SSH "docker logs pisos-backend --tail 30" || true
    exit 1
  }
  printf '.'
  sleep 2
done
echo ""

info "Estado y arranque del rastreador:"
$SSH "cd /home/manu/pisos && docker compose -f docker-compose.prod.yml ps && echo '' && docker logs pisos-backend --tail 15"

echo ""
verde "════════════════════════════════════════════════════════════"
verde " Pisos está en marcha."
verde "════════════════════════════════════════════════════════════"
echo ""
echo "  Interfaz  →  https://elbunkerdelingeniero.duckdns.org/pisos/"
echo ""
echo "  Crea una búsqueda y pulsa «Buscar ahora» para la primera pasada."
echo "  Ese botón NO notifica a propósito: la primera vez trae decenas de"
echo "  anuncios antiguos que no son novedades. Los avisos de Telegram"
echo "  empiezan con las vueltas automáticas, cada ~15 minutos."
echo ""
aviso "  Antes de fiarte de que encuentra todo, comprueba los portales reales:"
aviso "    cd pisos/backend && npm install"
aviso "    npm run smoke -- todos \"Badajoz\" --lat 38.8794 --lng -6.9707 --radio 30"
