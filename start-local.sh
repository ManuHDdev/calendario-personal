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
echo -e "  ${YELLOW}ℹ  Spring Boot puede tardar ~60s más en estar listo.${NC}"
echo -e "  ${YELLOW}ℹ  Logs en:  $LOGS_DIR/${NC}"
echo -e "  ${YELLOW}ℹ  Si es la primera vez o el realm de Keycloak cambió: bash scripts/keycloak-update-realm.sh${NC}"
echo ""
echo -e "  Presiona ${RED}Ctrl+C${NC} para detener todos los procesos."
echo ""

wait
