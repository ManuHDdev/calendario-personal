#!/usr/bin/env bash
# =============================================================================
# setup-vps.sh — Primera puesta en marcha en el VPS
# Ejecutar UNA SOLA VEZ con: bash scripts/setup-vps.sh
# Requiere estar en /home/manu/calendario (raíz del repo en el VPS)
# =============================================================================
set -euo pipefail

DOMAIN="elbunkerdelingeniero.duckdns.org"
APP_DIR="/home/manu/calendario"
ATG_DIR="/home/manu/atg-app"    # ajustar si la ruta difiere en el VPS

# ─── 1. Verificar directorio ──────────────────────────────────────────────────
if [[ ! -f "$APP_DIR/infra/docker-compose.prod.yml" ]]; then
  echo "ERROR: Ejecuta este script desde el raíz del repo ($APP_DIR)"
  exit 1
fi
cd "$APP_DIR"

# ─── 2. Crear .env de producción si no existe ─────────────────────────────────
if [[ ! -f infra/.env ]]; then
  cp infra/.env.prod.example infra/.env
  echo ""
  echo "⚠️  ACCIÓN REQUERIDA: edita infra/.env y rellena las contraseñas antes de continuar."
  echo "    nano infra/.env"
  echo ""
  read -rp "Pulsa ENTER cuando hayas guardado el fichero .env..."
fi

# ─── 3. Registrar la imagen en GHCR (login) ───────────────────────────────────
echo "Iniciando sesión en GHCR..."
echo "Introduce tu GitHub Personal Access Token (scope: read:packages):"
read -rs GHCR_TOKEN
echo "$GHCR_TOKEN" | docker login ghcr.io -u manuhddev --password-stdin
unset GHCR_TOKEN

# ─── 4. Descargar imágenes ────────────────────────────────────────────────────
echo "Descargando imágenes de producción..."
docker compose -f infra/docker-compose.prod.yml pull

# ─── 5. Arrancar la stack ─────────────────────────────────────────────────────
echo "Arrancando servicios (Postgres + Keycloak + Backend + Frontend)..."
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d

echo "Esperando a que Keycloak esté listo (puede tardar ~60s)..."
sleep 60

# ─── 6. Integrar con nginx de atg-app ─────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PASO MANUAL: conectar la red 'calendario-net' al nginx de atg-app"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Edita $ATG_DIR/docker-compose.yml y añade bajo 'networks:' externas:"
echo ""
echo "   networks:"
echo "     calendario-net:"
echo "       external: true"
echo ""
echo "   Y bajo el servicio 'nginx', añade la red:"
echo ""
echo "   services:"
echo "     nginx:"
echo "       networks:"
echo "         - ... (las que ya tenga)"
echo "         - calendario-net"
echo ""
echo "2. Añade el volumen del conf de nginx al servicio nginx en $ATG_DIR/docker-compose.yml:"
echo ""
echo "       volumes:"
echo "         - $APP_DIR/nginx/calendario.conf:/etc/nginx/conf.d/calendario.conf:ro"
echo ""
echo "3. Aplica los cambios en atg-app:"
echo "   cd $ATG_DIR && docker compose up -d --no-deps nginx"
echo ""
read -rp "Pulsa ENTER cuando hayas completado los pasos manuales de nginx..."

# ─── 7. Certificado SSL ───────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CERTIFICADO SSL para $DOMAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Emitiendo certificado desde el contenedor certbot de atg-app..."
echo "Asegúrate de que el DNS de $DOMAIN apunta a este servidor ANTES de continuar."
echo ""
read -rp "Pulsa ENTER para solicitar el certificado (o Ctrl+C para cancelar)..."

docker exec atg-app-certbot-1 certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@"$DOMAIN" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# Recargar nginx para que use el nuevo certificado
docker exec atg-app-nginx-1 nginx -s reload

echo ""
echo "✅ Certificado emitido y nginx recargado."

# ─── 8. Verificación final ────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "VERIFICACIÓN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Frontend:  https://$DOMAIN"
echo "Keycloak:  https://$DOMAIN/keycloak/admin"
echo "API docs:  https://$DOMAIN/swagger-ui/index.html"
echo ""
echo "Credenciales de la aplicación:"
echo "  Usuario:   propietario"
echo "  Password:  C4l3nd@r!0-VPS-2024"
echo "  (Cambia esta contraseña en Keycloak Admin tras el primer acceso)"
echo ""
echo "Keycloak Admin:"
echo "  URL:       https://$DOMAIN/keycloak/admin"
echo "  Usuario:   (el que pusiste en KEYCLOAK_ADMIN del .env)"
echo "  Password:  (el que pusiste en KEYCLOAK_ADMIN_PASSWORD del .env)"
echo ""
echo "✅ Setup completado."
