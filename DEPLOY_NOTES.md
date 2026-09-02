# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Fix del 413 al subir fotos a Storage

El límite de subida vive en dos nginx distintos, y **hay que desplegar los dos**:
arreglar solo uno deja el 413 exactamente igual.

1. **nginx del frontend de Storage** (`storage/frontend/nginx.conf`, va dentro de
   la imagen): reconstruir y publicar `ghcr.io/manuhddev/storage-frontend:latest`
   y recrear el contenedor. Un `docker compose pull && up -d` no basta si la
   imagen no se ha reconstruido — la config está horneada en la imagen.

2. **nginx compartido del VPS** (`location /storage/` en `nginx/calendario.conf`):

   > ⚠️ **No copiar el fichero del repo encima del servidor a mano.** Según
   > `CLAUDE.md`, `/home/manu/nginx-shared/conf.d/elbunkerdelingeniero.conf` ha
   > divergido (el bloque `location /trader/` se aplicó in situ). Antes de dejar
   > que el deploy lo sobrescriba, comparar los dos ficheros:
   >
   > ```bash
   > diff /home/manu/calendario/nginx/calendario.conf \
   >      /home/manu/nginx-shared/conf.d/elbunkerdelingeniero.conf
   > ```
   >
   > Si el servidor tiene bloques que no están en el repo, **editar el fichero
   > del servidor in situ** (añadir las líneas del bloque `location /storage/`)
   > en vez de copiar, y portar después esos bloques al repo en un cambio aparte.

   Después, validar y recargar sin reiniciar nginx:

   ```bash
   docker exec atg-app-nginx-1 nginx -t && docker exec atg-app-nginx-1 nginx -s reload
   ```

3. **Comprobación**: subir a Storage un `.jpg` de más de 1 MB y una foto `.HEIC`
   de iPhone. Ambas deben terminar en 201. Si sigue el 413, mirar de qué nginx
   viene:

   ```bash
   docker logs --tail 50 storage-frontend   # 413 aquí → falta el paso 1
   docker logs --tail 50 atg-app-nginx-1    # 413 aquí → falta el paso 2
   ```
