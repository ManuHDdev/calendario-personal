#!/usr/bin/env bash
#
# Aplica las migraciones de ofertas/infra/migrations/ sobre la base de datos
# del contenedor `ofertas-db`, y enseña el esquema resultante para poder
# verificarlo de un vistazo.
#
# Todas las migraciones son idempotentes: ejecutar esto sobre una base de
# datos ya correcta no cambia nada. Pensado para correrse en el VPS, desde el
# directorio donde vive el docker-compose de ofertas:
#
#   bash migrate.sh
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENEDOR="${OFERTAS_DB_CONTAINER:-ofertas-db}"

# Las credenciales viven en el mismo .env que lee docker compose.
if [[ -f "$DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi

DB_USER="${OFERTAS_DB_USER:-ofertas}"
DB_NAME="${OFERTAS_DB_NAME:-ofertas}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR"; then
  echo "ERROR: el contenedor '$CONTENEDOR' no está en marcha." >&2
  echo "       Levántalo con 'docker compose up -d ofertas-db' antes de migrar." >&2
  exit 1
fi

for sql in "$DIR"/migrations/*.sql; do
  echo "── Aplicando $(basename "$sql") ────────────────────────────────"
  # ON_ERROR_STOP: sin esto psql sigue tras un error y termina con código 0,
  # que es la peor forma posible de fallar una migración.
  docker exec -i "$CONTENEDOR" \
    psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$sql"
done

echo
echo "── Esquema resultante ──────────────────────────────────────────"
docker exec -i "$CONTENEDOR" psql -U "$DB_USER" -d "$DB_NAME" \
  -c '\d busqueda' \
  -c '\d scraper_state' \
  -c 'SELECT id, running, updated_at FROM scraper_state;' \
  -c 'SELECT count(*) AS busquedas_activas FROM busqueda WHERE activo = true;'
