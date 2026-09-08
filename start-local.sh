#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-local.sh  —  Arranca TODAS las subaplicaciones en local
# Uso: bash start-local.sh
#
# Puertos:
#   Keycloak            →  :8080   (admin: http://localhost:8080/admin)
#   PostgreSQL          →  :5433   (calendario)
#   PostgreSQL          →  :5434   (mapacyd)
#   calendario backend  →  :8081   | Swagger: :8081/swagger-ui.html
#   calendario frontend →  :4200
#   panel backend       →  :3002
#   panel frontend      →  :5174
#   storage backend     →  :3001
#   storage frontend    →  :5173
#   mapacyd backend     →  :3003
#   mapacyd frontend    →  :5175
#   ytdl backend        →  :3004
#   ytdl frontend       →  :5176
#   gastos backend      →  :3005
#   gastos frontend     →  :5177
#   ofertas backend     →  :3006
#   ofertas frontend    →  :5178
#   paraisos backend    →  :3007
#   paraisos frontend   →  :5179
#   juegos backend      →  :3008
#   juegos frontend     →  :5180
#   watchlist backend   →  :3009
#   watchlist frontend  →  :5181
#   reparto backend     →  :3010
#   reparto frontend    →  :5182
#   ruta backend        →  :3011
#   ruta frontend       →  :5183
#   pisos backend       →  :3012
#   pisos frontend      →  :5184
#   locales backend     →  :3013
# ─────────────────────────────────────────────────────────────────────────────
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
LOGS_DIR="$SCRIPT_DIR/logs/local"
STORAGE_DATA_DIR="$SCRIPT_DIR/storage/storage-data"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()   { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
header() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

# ── Registro de PIDs para cleanup ────────────────────────────────────────────
declare -a PIDS=()

cleanup() {
  echo ""
  local count=${#PIDS[@]}
  echo -e "${YELLOW}[STOP]${NC}  Deteniendo $count proceso(s)..."
  if [ $count -gt 0 ]; then
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
    done
  fi
  echo ""
  warn "La infraestructura Docker sigue corriendo. Para pararla:"
  warn "  cd infra && docker compose down"
  warn "  cd mapacyd/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd gastos/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd ofertas/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd paraisos/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd watchlist/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd reparto/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd ruta/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd pisos/infra && docker compose -f docker-compose.local.yml down"
  warn "  cd locales/infra && docker compose -f docker-compose.local.yml down"
}
trap cleanup EXIT INT TERM

# ── Helpers ───────────────────────────────────────────────────────────────────
ensure_deps() {
  local dir=$1
  local name
  name=$(basename "$dir")
  info "  Sincronizando dependencias en $name..."
  # Usar (cd) en lugar de --prefix para evitar fallo con rutas con espacios en Windows
  ( cd "$dir" && \
    npm install --silent --no-audit 2>/dev/null || \
    npm install --no-audit )
}

start_bg() {
  # start_bg <nombre> <logfile> <workdir> <cmd...>
  # Acepta workdir como tercer argumento para hacer cd antes de ejecutar
  local name=$1 logfile=$2 workdir=$3
  shift 3
  ( cd "$workdir" && "$@" ) >> "$LOGS_DIR/$logfile" 2>&1 &
  local pid=$!
  PIDS+=($pid)
  info "  ✓ $name  (PID $pid → logs/local/$logfile)"
}

wait_for_container() {
  local name=$1 container=$2 check_cmd=$3 max_retries=$4
  info "$name..."
  local retries=$max_retries
  until eval "$check_cmd" > /dev/null 2>&1; do
    retries=$((retries - 1))
    if [ $retries -le 0 ]; then
      error "$name no respondió tras $((max_retries * 2))s. Revisa: docker logs $container"
    fi
    echo -n "."; sleep 2
  done
  echo ""; info "  ✓ $name listo."
}

# ── 1. Comprobar requisitos ───────────────────────────────────────────────────
header "Verificando requisitos"
docker info > /dev/null 2>&1  || error "Docker no está arrancado. Abre Docker Desktop primero."
command -v mvn  > /dev/null 2>&1 || error "'mvn' no encontrado. Instala JDK 17 + Maven."
command -v npm  > /dev/null 2>&1 || error "'npm' no encontrado. Instala Node.js LTS."
command -v java > /dev/null 2>&1 || error "'java' no encontrado. Instala JDK 17."
info "Docker, Java, Maven y npm disponibles."

# ── 2. Preparar directorios ───────────────────────────────────────────────────
mkdir -p "$LOGS_DIR"
mkdir -p "$STORAGE_DATA_DIR"

# ── 3. Levantar infraestructura Docker ───────────────────────────────────────
header "Levantando infraestructura Docker"

info "PostgreSQL (calendario :5433) y Keycloak (:8080)..."
(cd "$INFRA_DIR" && docker compose up -d postgres keycloak)

info "PostgreSQL (mapacyd :5434)..."
(cd "$SCRIPT_DIR/mapacyd/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (gastos :5435)..."
(cd "$SCRIPT_DIR/gastos/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (ofertas :5436)..."
(cd "$SCRIPT_DIR/ofertas/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (paraisos :5437)..."
(cd "$SCRIPT_DIR/paraisos/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (watchlist :5438)..."
(cd "$SCRIPT_DIR/watchlist/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (reparto :5439)..."
(cd "$SCRIPT_DIR/reparto/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (ruta :5440)..."
(cd "$SCRIPT_DIR/ruta/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (pisos :5441)..."
(cd "$SCRIPT_DIR/pisos/infra" && docker compose -f docker-compose.local.yml up -d)

info "PostgreSQL (locales :5442)..."
(cd "$SCRIPT_DIR/locales/infra" && docker compose -f docker-compose.local.yml up -d)

# ── 4. Esperar servicios ──────────────────────────────────────────────────────
header "Esperando servicios"

# Usar 'docker exec <nombre>' — no depende del project context de docker compose
wait_for_container \
  "PostgreSQL calendario" \
  "calendario-postgres" \
  "docker exec calendario-postgres pg_isready -U calendariodb -d calendario" \
  30

wait_for_container \
  "PostgreSQL mapacyd" \
  "mapacyd-db-local" \
  "docker exec mapacyd-db-local pg_isready -U mapacyd -d mapacyd" \
  30

wait_for_container \
  "PostgreSQL gastos" \
  "gastos-db-local" \
  "docker exec gastos-db-local pg_isready -U gastos -d gastos" \
  30

wait_for_container \
  "PostgreSQL ofertas" \
  "ofertas-db-local" \
  "docker exec ofertas-db-local pg_isready -U ofertas -d ofertas" \
  30

wait_for_container \
  "PostgreSQL paraisos" \
  "paraisos-db-local" \
  "docker exec paraisos-db-local pg_isready -U paraisos -d paraisos" \
  30

wait_for_container \
  "PostgreSQL watchlist" \
  "watchlist-db-local" \
  "docker exec watchlist-db-local pg_isready -U watchlist -d watchlist" \
  30

wait_for_container \
  "PostgreSQL reparto" \
  "reparto-db-local" \
  "docker exec reparto-db-local pg_isready -U reparto -d reparto" \
  30

wait_for_container \
  "PostgreSQL ruta" \
  "ruta-db-local" \
  "docker exec ruta-db-local pg_isready -U ruta -d ruta" \
  30

wait_for_container \
  "PostgreSQL pisos" \
  "pisos-db-local" \
  "docker exec pisos-db-local pg_isready -U pisos -d pisos" \
  30

wait_for_container \
  "PostgreSQL locales" \
  "locales-db-local" \
  "docker exec locales-db-local pg_isready -U locales -d locales" \
  30

wait_for_container \
  "Keycloak (puede tardar ~60s la primera vez)" \
  "calendario-keycloak" \
  "curl -sf http://localhost:8080/realms/master" \
  60

# ── 4b. Actualizar realm de Keycloak (roles + redirect URIs) ─────────────────
# El realm solo se importa la PRIMERA vez. Este script lo parchea en caliente.
# Es idempotente: si los roles/URIs ya existen, no hace nada.
header "Configurando realm de Keycloak"
bash "$SCRIPT_DIR/scripts/keycloak-update-realm.sh" \
  "http://localhost:8080" \
  "${KEYCLOAK_ADMIN:-admin}" \
  "${KEYCLOAK_ADMIN_PASSWORD:-admin123}" \
  || warn "  Keycloak realm update falló (puede ignorarse si ya está configurado)"

# ── 5. Arrancar backends ──────────────────────────────────────────────────────
header "Arrancando backends"

ensure_deps "$SCRIPT_DIR/panel/backend"
start_bg "panel-backend     :3002" "panel-backend.log" "$SCRIPT_DIR/panel/backend" \
  env PORT=3002 \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      KEYCLOAK_BASE_URL="http://localhost:8080" \
      KEYCLOAK_ADMIN="admin" \
      KEYCLOAK_ADMIN_PASSWORD="admin123" \
      CORS_ORIGIN="http://localhost:5174" \
  npm run dev

ensure_deps "$SCRIPT_DIR/storage/backend"
start_bg "storage-backend   :3001" "storage-backend.log" "$SCRIPT_DIR/storage/backend" \
  env PORT=3001 \
      STORAGE_PATH="$STORAGE_DATA_DIR" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
  npm run dev

ensure_deps "$SCRIPT_DIR/mapacyd/backend"
start_bg "mapacyd-backend   :3003" "mapacyd-backend.log" "$SCRIPT_DIR/mapacyd/backend" \
  env PORT=3003 \
      MAPACYD_DB_HOST="localhost" \
      MAPACYD_DB_PORT="5434" \
      MAPACYD_DB_NAME="mapacyd" \
      MAPACYD_DB_USER="mapacyd" \
      MAPACYD_DB_PASSWORD="mapacyd123" \
      KEYCLOAK_JWKS_URI="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ALLOWED_ORIGINS="http://localhost:5175" \
  npm run dev

ensure_deps "$SCRIPT_DIR/ytdl/backend"
start_bg "ytdl-backend      :3004" "ytdl-backend.log" "$SCRIPT_DIR/ytdl/backend" \
  env PORT=3004 \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5176" \
  npm run dev

ensure_deps "$SCRIPT_DIR/gastos/backend"
start_bg "gastos-backend    :3005" "gastos-backend.log" "$SCRIPT_DIR/gastos/backend" \
  env PORT=3005 \
      GASTOS_DB_HOST="localhost" \
      GASTOS_DB_PORT="5435" \
      GASTOS_DB_NAME="gastos" \
      GASTOS_DB_USER="gastos" \
      GASTOS_DB_PASSWORD="gastos123" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5177" \
      GASTOS_IMAGES_PATH="$SCRIPT_DIR/gastos/backend/data/images" \
      TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" \
      TELEGRAM_OWNER_CHAT_ID="${TELEGRAM_OWNER_CHAT_ID:-}" \
  npm run dev

ensure_deps "$SCRIPT_DIR/ofertas/backend"
start_bg "ofertas-backend   :3006" "ofertas-backend.log" "$SCRIPT_DIR/ofertas/backend" \
  env PORT=3006 \
      OFERTAS_DB_HOST="localhost" \
      OFERTAS_DB_PORT="5436" \
      OFERTAS_DB_NAME="ofertas" \
      OFERTAS_DB_USER="ofertas" \
      OFERTAS_DB_PASSWORD="ofertas123" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5178" \
      SCRAPER_API_KEY="${SCRAPER_API_KEY:-local-dev-scraper-key}" \
  npm run dev

ensure_deps "$SCRIPT_DIR/paraisos/backend"
start_bg "paraisos-backend  :3007" "paraisos-backend.log" "$SCRIPT_DIR/paraisos/backend" \
  env PORT=3007 \
      PARAISOS_DB_HOST="localhost" \
      PARAISOS_DB_PORT="5437" \
      PARAISOS_DB_NAME="paraisos" \
      PARAISOS_DB_USER="paraisos" \
      PARAISOS_DB_PASSWORD="paraisos123" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5179" \
      PARAISOS_IMAGES_PATH="$SCRIPT_DIR/paraisos/backend/data/images" \
      ORS_API_KEY="${ORS_API_KEY:-}" \
  npm run dev

ensure_deps "$SCRIPT_DIR/juegos/backend"
start_bg "juegos-backend    :3008" "juegos-backend.log" "$SCRIPT_DIR/juegos/backend" \
  env PORT=3008 \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5180" \
  npm run dev

ensure_deps "$SCRIPT_DIR/watchlist/backend"
start_bg "watchlist-backend  :3009" "watchlist-backend.log" "$SCRIPT_DIR/watchlist/backend" \
  env PORT=3009 \
      WATCHLIST_DB_HOST="localhost" \
      WATCHLIST_DB_PORT="5438" \
      WATCHLIST_DB_NAME="watchlist" \
      WATCHLIST_DB_USER="watchlist" \
      WATCHLIST_DB_PASSWORD="watchlist123" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5181" \
      TMDB_API_KEY="${TMDB_API_KEY:-}" \
      GOOGLE_BOOKS_API_KEY="${GOOGLE_BOOKS_API_KEY:-}" \
  npm run dev

ensure_deps "$SCRIPT_DIR/reparto/backend"
start_bg "reparto-backend    :3010" "reparto-backend.log" "$SCRIPT_DIR/reparto/backend" \
  env PORT=3010 \
      REPARTO_DB_HOST="localhost" \
      REPARTO_DB_PORT="5439" \
      REPARTO_DB_NAME="reparto" \
      REPARTO_DB_USER="reparto" \
      REPARTO_DB_PASSWORD="reparto123" \
      REPARTO_GROUP_TOKEN_SECRET="${REPARTO_GROUP_TOKEN_SECRET:-local-dev-reparto-secret}" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5182" \
  npm run dev

ensure_deps "$SCRIPT_DIR/ruta/backend"
start_bg "ruta-backend       :3011" "ruta-backend.log" "$SCRIPT_DIR/ruta/backend" \
  env PORT=3011 \
      RUTA_DB_HOST="localhost" \
      RUTA_DB_PORT="5440" \
      RUTA_DB_NAME="ruta" \
      RUTA_DB_USER="ruta" \
      RUTA_DB_PASSWORD="ruta123" \
      ORS_API_KEY="${ORS_API_KEY:-}" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5183" \
  npm run dev

ensure_deps "$SCRIPT_DIR/pisos/backend"
# PISOS_INTERVALO_MINUTOS alto en local a proposito: en desarrollo se usa el
# boton "Buscar ahora", y no hace falta estar golpeando los portales de fondo.
start_bg "pisos-backend      :3012" "pisos-backend.log" "$SCRIPT_DIR/pisos/backend" \
  env PORT=3012 \
      PISOS_DB_HOST="localhost" \
      PISOS_DB_PORT="5441" \
      PISOS_DB_NAME="pisos" \
      PISOS_DB_USER="pisos" \
      PISOS_DB_PASSWORD="pisos123" \
      PISOS_INTERVALO_MINUTOS="${PISOS_INTERVALO_MINUTOS:-60}" \
      TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" \
      TELEGRAM_OWNER_CHAT_ID="${TELEGRAM_OWNER_CHAT_ID:-}" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5184" \
  npm run dev

ensure_deps "$SCRIPT_DIR/locales/backend"
# Motor de distancias: `ors` por defecto, que solo necesita ORS_API_KEY (la
# misma que usan paraisos y ruta). Sin clave arranca igual, pero cualquier
# comprobacion respondera 503 diciendo que falta — no falla en silencio.
#
# Recuerda que hasta importar el padron (npm run padron -- madrid) toda
# comprobacion devuelve "sin datos". Es lo correcto: un padron vacio no
# demuestra que no haya farmacias cerca.
start_bg "locales-backend    :3013" "locales-backend.log" "$SCRIPT_DIR/locales/backend" \
  env PORT=3013 \
      LOCALES_DB_HOST="localhost" \
      LOCALES_DB_PORT="5442" \
      LOCALES_DB_NAME="locales" \
      LOCALES_DB_USER="locales" \
      LOCALES_DB_PASSWORD="locales123" \
      LOCALES_MOTOR_DISTANCIA="${LOCALES_MOTOR_DISTANCIA:-ors}" \
      ORS_API_KEY="${ORS_API_KEY:-}" \
      VALHALLA_URL="${VALHALLA_URL:-http://localhost:8002}" \
      TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}" \
      TELEGRAM_OWNER_CHAT_ID="${TELEGRAM_OWNER_CHAT_ID:-}" \
      KEYCLOAK_CERTS_URL="http://localhost:8080/realms/calendario/protocol/openid-connect/certs" \
      CORS_ORIGIN="http://localhost:5185" \
  npm run dev

start_bg "calendario-backend :8081" "calendario-backend.log" "$SCRIPT_DIR/backend" \
  mvn spring-boot:run -Dspring-boot.run.profiles=dev

# ── 6. Arrancar frontends ─────────────────────────────────────────────────────
header "Arrancando frontends"

ensure_deps "$SCRIPT_DIR/panel/frontend"
start_bg "panel-frontend     :5174" "panel-frontend.log" "$SCRIPT_DIR/panel/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/storage/frontend"
start_bg "storage-frontend   :5173" "storage-frontend.log" "$SCRIPT_DIR/storage/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/mapacyd/frontend"
start_bg "mapacyd-frontend   :5175" "mapacyd-frontend.log" "$SCRIPT_DIR/mapacyd/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/ytdl/frontend"
start_bg "ytdl-frontend      :5176" "ytdl-frontend.log" "$SCRIPT_DIR/ytdl/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/gastos/frontend"
start_bg "gastos-frontend    :5177" "gastos-frontend.log" "$SCRIPT_DIR/gastos/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/ofertas/frontend"
start_bg "ofertas-frontend   :5178" "ofertas-frontend.log" "$SCRIPT_DIR/ofertas/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/paraisos/frontend"
start_bg "paraisos-frontend  :5179" "paraisos-frontend.log" "$SCRIPT_DIR/paraisos/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/juegos/frontend"
start_bg "juegos-frontend    :5180" "juegos-frontend.log" "$SCRIPT_DIR/juegos/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/watchlist/frontend"
start_bg "watchlist-frontend :5181" "watchlist-frontend.log" "$SCRIPT_DIR/watchlist/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/reparto/frontend"
start_bg "reparto-frontend   :5182" "reparto-frontend.log" "$SCRIPT_DIR/reparto/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/ruta/frontend"
start_bg "ruta-frontend      :5183" "ruta-frontend.log" "$SCRIPT_DIR/ruta/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/pisos/frontend"
start_bg "pisos-frontend     :5184" "pisos-frontend.log" "$SCRIPT_DIR/pisos/frontend" \
  npm run dev

ensure_deps "$SCRIPT_DIR/calendario-frontend"
start_bg "calendario-frontend :4200" "calendario-frontend.log" "$SCRIPT_DIR/calendario-frontend" \
  npm start

# ── 7. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         ✅  EL BUNKER — LOCAL DEV STACK ACTIVO           ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Infraestructura${NC}"
echo -e "    Keycloak Admin   →  ${BOLD}http://localhost:8080/admin${NC}  (admin / admin123)"
echo -e "    PostgreSQL       →  localhost:5433  (calendario)"
echo -e "    PostgreSQL       →  localhost:5434  (mapacyd)"
echo ""
echo -e "  ${CYAN}Calendario${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:4200${NC}"
echo -e "    Backend API      →  http://localhost:8081"
echo -e "    Swagger UI       →  ${BOLD}http://localhost:8081/swagger-ui.html${NC}"
echo ""
echo -e "  ${CYAN}Panel de administración${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5174/panel/${NC}"
echo -e "    Backend health   →  http://localhost:3002/panel/api/health"
echo ""
echo -e "  ${CYAN}Storage NAS${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5173/storage/${NC}"
echo -e "    Backend health   →  http://localhost:3001/storage/api/health"
echo ""
echo -e "  ${CYAN}MapaCYD${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5175/mapacyd/${NC}"
echo -e "    Backend health   →  http://localhost:3003/health"
echo ""
echo -e "  ${CYAN}YouTube Downloader${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5176/ytdl/${NC}"
echo -e "    Backend health   →  http://localhost:3004/ytdl/api/health"
echo ""
echo -e "  ${CYAN}Gastos${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5177/gastos/${NC}"
echo -e "    Backend health   →  http://localhost:3005/gastos/api/health"
echo -e "    ${YELLOW}ℹ  Bot de Telegram deshabilitado hasta configurar TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID (ver gastos/README.md)${NC}"
echo ""
echo -e "  ${CYAN}Ofertas${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5178/ofertas/${NC}"
echo -e "    Backend health   →  http://localhost:3006/ofertas/api/health"
echo -e "    ${YELLOW}ℹ  SCRAPER_API_KEY de desarrollo por defecto: local-dev-scraper-key (sobrescribible con la env var)${NC}"
echo ""
echo -e "  ${CYAN}Paraísos${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5179/paraisos/${NC}"
echo -e "    Backend health   →  http://localhost:3007/paraisos/api/health"
echo ""
echo -e "  ${CYAN}Juegos${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5180/juegos/${NC}"
echo -e "    Backend health   →  http://localhost:3008/juegos/api/health"
echo ""
echo -e "  ${CYAN}Watchlist${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5181/watchlist/${NC}"
echo -e "    Backend health   →  http://localhost:3009/watchlist/api/health"
echo -e "    ${YELLOW}ℹ  Búsqueda TMDB/Google Books deshabilitada hasta configurar TMDB_API_KEY/GOOGLE_BOOKS_API_KEY${NC}"
echo ""
echo -e "  ${CYAN}Reparto${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5182/reparto/${NC}"
echo -e "    Backend health   →  http://localhost:3010/reparto/api/health"
echo -e "    ${YELLOW}ℹ  REPARTO_GROUP_TOKEN_SECRET de desarrollo por defecto: local-dev-reparto-secret (sobrescribible con la env var)${NC}"
echo ""
echo -e "  ${CYAN}Ruta${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5183/ruta/${NC}"
echo -e "    Backend health   →  http://localhost:3011/ruta/api/health"
echo -e "    ${YELLOW}ℹ  Sin ORS_API_KEY la busqueda devuelve 503: exporta la variable antes de arrancar (clave gratuita en openrouteservice.org)${NC}"
echo ""
echo -e "  ${CYAN}Pisos${NC}"
echo -e "    Frontend         →  ${BOLD}http://localhost:5184/pisos/${NC}"
echo -e "    Backend health   →  http://localhost:3012/pisos/api/health"
echo -e "    ${YELLOW}ℹ  Sin TELEGRAM_BOT_TOKEN/TELEGRAM_OWNER_CHAT_ID rastrea y guarda, pero no avisa al movil${NC}"
echo -e "    ${YELLOW}ℹ  Comprobar los portales reales:  cd pisos/backend && npm run smoke -- todos \"Badajoz\"${NC}"

echo -e "\n  ${BOLD}Locales${NC} (sin frontend todavia)"
echo -e "    Backend health   →  http://localhost:3013/locales/api/health"
echo -e "    ${YELLOW}ℹ  Importar el padron antes de usarlo:  cd locales/backend && npm run padron -- madrid${NC}"
echo ""
echo -e "  ${YELLOW}ℹ  Spring Boot puede tardar ~60s más en estar listo.${NC}"
echo -e "  ${YELLOW}ℹ  Logs en:  $LOGS_DIR/${NC}"
echo -e "  ${YELLOW}ℹ  Si es la primera vez o el realm de Keycloak cambió: bash scripts/keycloak-update-realm.sh${NC}"
echo ""
echo -e "  Presiona ${RED}Ctrl+C${NC} para detener todos los procesos."
echo ""

wait
