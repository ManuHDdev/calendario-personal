#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-local.sh  —  Arranca infraestructura + backend para desarrollo local
# Uso: bash start-local.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
BACKEND_DIR="$SCRIPT_DIR/backend"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 1. Comprobar Docker ──────────────────────────────────────────────────────
info "Verificando Docker..."
docker info > /dev/null 2>&1 || error "Docker no está arrancado. Abre Docker Desktop primero."

# ── 2. Levantar infraestructura ──────────────────────────────────────────────
info "Levantando PostgreSQL y Keycloak..."
cd "$INFRA_DIR"
docker compose up -d postgres keycloak

# ── 3. Esperar a PostgreSQL ──────────────────────────────────────────────────
info "Esperando a que PostgreSQL esté listo..."
RETRIES=30
until docker compose exec -T postgres pg_isready -U calendariodb -d calendario > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  [ $RETRIES -le 0 ] && error "PostgreSQL no arrancó tras 60s. Revisa: docker compose logs postgres"
  echo -n "."
  sleep 2
done
echo ""
info "PostgreSQL listo."

# ── 4. Esperar a Keycloak ────────────────────────────────────────────────────
info "Esperando a que Keycloak esté listo (puede tardar ~30s la primera vez)..."
RETRIES=45
until curl -sf http://localhost:8080/realms/master > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  [ $RETRIES -le 0 ] && error "Keycloak no arrancó tras 90s. Revisa: docker compose logs keycloak"
  echo -n "."
  sleep 2
done
echo ""
info "Keycloak listo."

# ── 5. Arrancar backend ──────────────────────────────────────────────────────
info "Arrancando backend Spring Boot (perfil dev)..."
info "  → API:     http://localhost:8081"
info "  → Swagger: http://localhost:8081/swagger-ui.html"
info "  Ctrl+C para parar"
echo ""

cd "$BACKEND_DIR"
exec mvn spring-boot:run -Dspring-boot.run.profiles=dev
