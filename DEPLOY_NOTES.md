# DEPLOY_NOTES — Instrucciones para el despliegue actual

> **IMPORTANTE para Claude Code:** Lee estas instrucciones, ejecútalas durante el despliegue
> y **borra el contenido de este archivo** cuando termines (deja solo este bloque de cabecera vacío).
> Así evitamos que instrucciones antiguas se mezclen con futuros despliegues.

## Subidas reanudables + carpeta "Sin carpeta" + errores descartables

Despliegue normal: `storage-ci.yml` reconstruye las dos imágenes y las recrea en
el VPS. **No hace falta tocar nginx esta vez** — los topes no cambian.

La tabla `upload_session` se crea sola al arrancar el backend (`CREATE TABLE IF
NOT EXISTS` en `db/index.ts`), no hay migración manual.

**Comprobaciones tras desplegar:**

1. Subir un vídeo grande desde el móvil y **bloquear la pantalla a mitad**. Al
   desbloquear, la barra debe continuar donde iba, no volver a cero.
2. En "Sin carpeta" (barra lateral) deben salir los archivos sueltos que ya
   había, sin haberlos movido.
3. Forzar un error de subida y comprobar que la notificación **no desaparece
   sola** y se cierra con la cruz.

**Espacio en disco**: los trozos a medias viven en `/mnt/storage-ssd/.meta/uploads`
y se barren solos a las 24 h sin actividad. Para ver si se está acumulando algo:

```bash
du -sh /mnt/storage-ssd/.meta/uploads
```
