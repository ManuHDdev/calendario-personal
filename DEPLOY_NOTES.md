# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Subida de Storage: de 500 MB a 2 GB (vídeos .mov de iPhone)

Mismo procedimiento que el fix del 413 anterior — el tope vive en dos nginx y
**hay que desplegar los dos**:

1. **nginx del frontend de Storage** (`storage/frontend/nginx.conf`, horneado en
   la imagen): lo hace `storage-ci.yml` al reconstruir y republicar
   `ghcr.io/manuhddev/storage-frontend:latest`.
2. **nginx compartido del VPS** (`location /storage/` en `nginx/calendario.conf`):
   lo hace `ci.yml`. Comprobar en el log del paso «Deploy via SSH» que sale
   `nginx -t ... successful` y `signal process started`, porque ese paso lleva un
   `|| echo "AVISO..."` y el job queda en verde aunque la recarga falle.

**Comprobación**: subir un `.mov` de iPhone de más de 500 MB. Debe terminar en 201.

**Espacio en disco**: con 2 GB por archivo conviene vigilar `/mnt/storage-ssd`:

```bash
df -h /mnt/storage-ssd
```
