#!/bin/bash
set -e

NGINX_CONF="/home/manu/atg-app/nginx/default.conf"
BACKUP="$NGINX_CONF.bak.$(date +%Y%m%d_%H%M%S)"

echo "=== Actualizando Nginx para añadir /storage ==="

# Backup de seguridad
ssh -p 2269 87.216.88.165 "cp $NGINX_CONF $BACKUP"
echo "Backup creado en $BACKUP"

# Añadir los location blocks de storage ANTES del location / del bloque elbunkerdelingeniero
# Usamos un marcador único para no duplicar si se ejecuta dos veces
ssh -p 2269 87.216.88.165 "grep -q 'storage-backend' $NGINX_CONF && echo 'Ya configurado, saliendo.' && exit 0 || true"

ssh -p 2269 87.216.88.165 "sed -i '/location \/uploads\/ {/i\\
    # Storage NAS\\
    location /storage/api/ {\\
        set \$svc_storage http://storage-backend:3001;\\
        proxy_pass \$svc_storage;\\
        proxy_set_header Host \$host;\\
        proxy_set_header X-Real-IP \$remote_addr;\\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
        proxy_set_header X-Forwarded-Proto \$scheme;\\
        client_max_body_size 500M;\\
        proxy_read_timeout 300s;\\
        proxy_send_timeout 300s;\\
    }\\
\\
    location /storage/ {\\
        set \$svc_storage_fe http://storage-frontend:80;\\
        proxy_pass \$svc_storage_fe;\\
        proxy_set_header Host \$host;\\
        proxy_set_header X-Real-IP \$remote_addr;\\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
        proxy_set_header X-Forwarded-Proto \$scheme;\\
    }\\
' $NGINX_CONF"

# Recargar Nginx
ssh -p 2269 87.216.88.165 "docker exec atg-app-nginx-1 nginx -t && docker exec atg-app-nginx-1 nginx -s reload"
echo "=== Nginx actualizado y recargado ==="
