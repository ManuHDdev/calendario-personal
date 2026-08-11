#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# keycloak-update-realm.sh
#
# Actualiza el realm "calendario" en Keycloak con los roles correctos
# (admin / familia / invitado / paraisos_admin / mapacyd_admin / reparto_admin /
# reparto_invitado) y asigna los roles admin, paraisos_admin, mapacyd_admin y
# reparto_admin al usuario "propietario". reparto_invitado se crea pero NO se
# asigna a nadie automáticamente — existe para asignarse desde Panel (misma
# convención documentada para el resto de roles "_invitado").
#
# Uso:
#   bash scripts/keycloak-update-realm.sh [host] [admin_user] [admin_password]
#
# Ejemplos:
#   bash scripts/keycloak-update-realm.sh
#   bash scripts/keycloak-update-realm.sh http://localhost:8080 admin admin123
#   bash scripts/keycloak-update-realm.sh https://elbunkerdelingeniero.duckdns.org/keycloak admin <password>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HOST="${1:-http://localhost:8080}"
ADMIN_USER="${2:-admin}"
ADMIN_PASSWORD="${3:-admin123}"
REALM="calendario"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}!${NC}  $*"; }
err()  { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

echo ""
echo "Actualizando realm '$REALM' en $HOST..."
echo ""

# ── 1. Obtener token de administrador ─────────────────────────────────────────
TOKEN_JSON=$(curl -sf -X POST \
  "$HOST/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}&password=${ADMIN_PASSWORD}&grant_type=password&client_id=admin-cli") \
  || err "No se pudo conectar a Keycloak en $HOST. ¿Está arrancado?"

TOKEN=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).access_token)" "$TOKEN_JSON") \
  || err "Credenciales incorrectas o Keycloak no disponible."

[ -z "$TOKEN" ] && err "Token vacío. Comprueba que Keycloak esté listo y las credenciales sean correctas."

ok "Token de admin obtenido"

# ── 2. Crear roles si no existen ──────────────────────────────────────────────
for ROLE_NAME in admin familia invitado paraisos_admin mapacyd_admin reparto_admin reparto_invitado; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$HOST/admin/realms/$REALM/roles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$ROLE_NAME\"}")

  if [ "$HTTP_STATUS" = "201" ]; then
    ok "Rol '$ROLE_NAME' creado"
  elif [ "$HTTP_STATUS" = "409" ]; then
    warn "Rol '$ROLE_NAME' ya existe (OK)"
  else
    err "Error creando rol '$ROLE_NAME' (HTTP $HTTP_STATUS)"
  fi
done

# ── 3. Obtener ID del usuario propietario ─────────────────────────────────────
USERS_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/users?username=propietario&exact=true" \
  -H "Authorization: Bearer $TOKEN")

USER_ID=$(node -e "const a=JSON.parse(process.argv[1]); process.stdout.write(a.length ? a[0].id : '')" "$USERS_JSON")

[ -z "$USER_ID" ] && err "Usuario 'propietario' no encontrado en el realm '$REALM'"
ok "Usuario 'propietario' encontrado (ID: $USER_ID)"

# ── 4. Asignar rol "admin" al usuario ────────────────────────────────────────
ADMIN_ROLE_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/roles/admin" \
  -H "Authorization: Bearer $TOKEN")

ADMIN_ROLE_ID=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).id)" "$ADMIN_ROLE_JSON")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$HOST/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"id\":\"$ADMIN_ROLE_ID\",\"name\":\"admin\"}]")

if [ "$HTTP_STATUS" = "204" ]; then
  ok "Rol 'admin' asignado a 'propietario'"
elif [ "$HTTP_STATUS" = "409" ]; then
  warn "Rol 'admin' ya estaba asignado (OK)"
else
  warn "Respuesta $HTTP_STATUS al asignar rol (puede que ya lo tenga)"
fi

# ── 4b. Asignar rol "paraisos_admin" al usuario ─────────────────────────────
PARAISOS_ADMIN_ROLE_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/roles/paraisos_admin" \
  -H "Authorization: Bearer $TOKEN")

PARAISOS_ADMIN_ROLE_ID=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).id)" "$PARAISOS_ADMIN_ROLE_JSON")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$HOST/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"id\":\"$PARAISOS_ADMIN_ROLE_ID\",\"name\":\"paraisos_admin\"}]")

if [ "$HTTP_STATUS" = "204" ]; then
  ok "Rol 'paraisos_admin' asignado a 'propietario'"
elif [ "$HTTP_STATUS" = "409" ]; then
  warn "Rol 'paraisos_admin' ya estaba asignado (OK)"
else
  warn "Respuesta $HTTP_STATUS al asignar rol (puede que ya lo tenga)"
fi

# ── 4c. Asignar rol "mapacyd_admin" al usuario ──────────────────────────────
MAPACYD_ADMIN_ROLE_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/roles/mapacyd_admin" \
  -H "Authorization: Bearer $TOKEN")

MAPACYD_ADMIN_ROLE_ID=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).id)" "$MAPACYD_ADMIN_ROLE_JSON")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$HOST/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"id\":\"$MAPACYD_ADMIN_ROLE_ID\",\"name\":\"mapacyd_admin\"}]")

if [ "$HTTP_STATUS" = "204" ]; then
  ok "Rol 'mapacyd_admin' asignado a 'propietario'"
elif [ "$HTTP_STATUS" = "409" ]; then
  warn "Rol 'mapacyd_admin' ya estaba asignado (OK)"
else
  warn "Respuesta $HTTP_STATUS al asignar rol (puede que ya lo tenga)"
fi

# ── 4d. Asignar rol "reparto_admin" al usuario ──────────────────────────────
REPARTO_ADMIN_ROLE_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/roles/reparto_admin" \
  -H "Authorization: Bearer $TOKEN")

REPARTO_ADMIN_ROLE_ID=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).id)" "$REPARTO_ADMIN_ROLE_JSON")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$HOST/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"id\":\"$REPARTO_ADMIN_ROLE_ID\",\"name\":\"reparto_admin\"}]")

if [ "$HTTP_STATUS" = "204" ]; then
  ok "Rol 'reparto_admin' asignado a 'propietario'"
elif [ "$HTTP_STATUS" = "409" ]; then
  warn "Rol 'reparto_admin' ya estaba asignado (OK)"
else
  warn "Respuesta $HTTP_STATUS al asignar rol (puede que ya lo tenga)"
fi

# NOTA: 'reparto_invitado' se crea en el bucle de arriba pero NO se asigna a
# nadie aquí — solo lectura, delegable desde Panel cuando haga falta.

# ── 5. Actualizar redirect URIs del cliente calendario-frontend ───────────────
CLIENTS_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/clients?clientId=calendario-frontend" \
  -H "Authorization: Bearer $TOKEN")

CLIENT_ID=$(node -e "const a=JSON.parse(process.argv[1]); process.stdout.write(a.length ? a[0].id : '')" "$CLIENTS_JSON")

[ -z "$CLIENT_ID" ] && err "Cliente 'calendario-frontend' no encontrado en el realm '$REALM'"

# IMPORTANTE: la lista SIEMPRE incluye tanto los puertos locales como el
# dominio de producción, sin importar contra qué $HOST se esté llamando a la
# Admin API. Antes esto se decidía mirando si "$HOST" contenía "localhost",
# pero en producción el script también se invoca con
# http://localhost:8080 (desde dentro del propio VPS, contra el puerto
# publicado del contenedor de Keycloak) — con la rama anterior, ese uso
# documentado en CLAUDE.md sobrescribía los redirect URIs de producción con
# la lista de solo-desarrollo, rompiendo el login de todas las apps. Al no
# haber distinción de entorno, unificar la lista es la forma segura de
# evitar esa clase de bug sin depender de cómo se invoque el script.
REDIRECT_URIS='["http://localhost:4200/*","http://localhost:5173/*","http://localhost:5174/*","http://localhost:5175/*","http://localhost:5176/*","http://localhost:5177/*","http://localhost:5178/*","http://localhost:5179/*","http://localhost:5180/*","http://localhost:5181/*","http://localhost:5182/*","https://elbunkerdelingeniero.duckdns.org/*"]'
WEB_ORIGINS='["http://localhost:4200","http://localhost:5173","http://localhost:5174","http://localhost:5175","http://localhost:5176","http://localhost:5177","http://localhost:5178","http://localhost:5179","http://localhost:5180","http://localhost:5181","http://localhost:5182","https://elbunkerdelingeniero.duckdns.org"]'

# Obtener la configuración actual del cliente y parchearla
CLIENT_JSON=$(curl -sf \
  "$HOST/admin/realms/$REALM/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN")

UPDATED_CLIENT=$(node -e "
  const c = JSON.parse(process.argv[1]);
  c.redirectUris = $REDIRECT_URIS;
  c.webOrigins = $WEB_ORIGINS;
  process.stdout.write(JSON.stringify(c));
" "$CLIENT_JSON")

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "$HOST/admin/realms/$REALM/clients/$CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATED_CLIENT")

if [ "$HTTP_STATUS" = "204" ]; then
  ok "Redirect URIs actualizadas en 'calendario-frontend'"
else
  warn "Respuesta $HTTP_STATUS al actualizar redirect URIs"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Realm actualizado correctamente ✓${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  Roles:   admin, familia, invitado, paraisos_admin, mapacyd_admin, reparto_admin, reparto_invitado"
echo "  Usuario 'propietario' → roles admin, paraisos_admin, mapacyd_admin, reparto_admin"
echo "  Redirect URIs actualizadas para todos los puertos locales"
echo ""
