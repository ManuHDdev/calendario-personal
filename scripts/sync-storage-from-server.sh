#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-storage-from-server.sh
#
# Descarga los archivos del Storage del VPS al directorio local.
# Usa ssh + tar (rsync no disponible en Windows).
# Requiere entrada en ~/.ssh/config para "atg-server" con la clave SSH configurada.
#
# Uso:
#   bash scripts/sync-storage-from-server.sh          # descarga incremental
#   bash scripts/sync-storage-from-server.sh --delete  # borra local y descarga todo
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="$SCRIPT_DIR/../storage/storage-data"
SSH_HOST="atg-server"
REMOTE_PATH="/mnt/storage-ssd"
DELETE_FLAG="${1:-}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

mkdir -p "$LOCAL_DIR"

echo -e "${YELLOW}Sincronizando archivos del servidor...${NC}"
echo "  Origen:  $SSH_HOST:$REMOTE_PATH"
echo "  Destino: $LOCAL_DIR"
echo ""

if [ "$DELETE_FLAG" = "--delete" ]; then
  echo -e "${YELLOW}⚠  Modo --delete: eliminando archivos locales antes de sincronizar${NC}"
  rm -rf "${LOCAL_DIR:?}"/*
fi

# Usar ssh+tar: excluye lost+found (requiere root para leerlo) y archivos temporales
ssh "$SSH_HOST" "cd '$REMOTE_PATH' && tar czf - \
  --exclude=lost+found \
  --exclude='*.tmp' \
  --exclude='.DS_Store' \
  ." | tar xzf - -C "$LOCAL_DIR"

echo ""
echo -e "${GREEN}✓ Sincronización completada.${NC}"
echo "  Archivos disponibles en: $LOCAL_DIR"
echo "  Total: $(find "$LOCAL_DIR" -type f | wc -l | tr -d ' ') archivos"
echo ""