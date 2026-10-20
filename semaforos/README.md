# Semáforos

Mapa con los semáforos de una ciudad, su color **estimado** ahora y la cuenta atrás
hasta el cambio. Proyecto personal y recreativo; solo rol `admin`.

> Lo que se ve es una **predicción**, no el estado real. No existe ninguna fuente de
> datos de fase en tiempo real en España, así que los tiempos los anotas tú a pie,
> pulsando un botón en cada cambio de color. No lo uses para decidir si cruzar o
> acelerar en ámbar.

La referencia completa (modelo, reglas, rutas, despliegue) está en la sección
"Semáforos" de `CLAUDE.md`. Esto es solo cómo arrancarlo.

## Cómo se usa

1. **Importar una ciudad** (barra superior): escribe el municipio (p. ej. `Cáceres`).
   Se descargan los semáforos de OpenStreetMap y se deducen los accesos de cada cruce.
2. **Pulsa un marcador**: cada acceso es un sentido de llegada y se dibuja un poco
   detrás del cruce, donde lo vería un conductor.
3. **Anota cada cambio** con los botones Verde / Ámbar / Rojo en el instante en que
   ocurre. El que toca a continuación sale resaltado. Si llegaste tarde al botón,
   marca "−1 s / −2 s / −3 s".
4. Con unos **3 ciclos** el semáforo se declara de ciclo fijo y la cuenta atrás es
   exacta; con ~10 y observaciones recientes la fiabilidad es alta. Si las
   duraciones varían demasiado (semáforo actuado por sensores) solo se da un rango.
5. **Corrige a mano** una duración en la tabla "Manual (s)" si pulsaste con retraso:
   manda sobre la mediana. Vacío vuelve al valor automático.

## Desarrollo en local

```bash
# Base de datos (puerto 5445)
cd semaforos/infra && docker compose -f docker-compose.local.yml up -d

# Backend (puerto 3017)
cd semaforos/backend && npm install
SEMAFOROS_DB_HOST=localhost SEMAFOROS_DB_PORT=5445 \
SEMAFOROS_DB_NAME=semaforos SEMAFOROS_DB_USER=semaforos SEMAFOROS_DB_PASSWORD=semaforos123 \
  npm run dev

# Frontend (puerto 5191, proxy a /semaforos/api y /keycloak)
cd semaforos/frontend && npm install && npm run dev
```

Importar una ciudad sin pasar por la interfaz:

```bash
cd semaforos/backend && npm run importar -- "Cáceres"
```

## Tests

```bash
cd semaforos/backend && npm test    # modelo de duraciones, derivación de accesos OSM
cd semaforos/frontend && npm test   # proyección del estado actual, franjas, geometría del marcador
```

Los tests de OSM corren contra un fixture sintético: no pueden comprobar que Overpass
siga devolviendo esa forma. La primera importación real hay que mirarla a ojo.

## Despliegue

`semaforos-ci.yml` construye y despliega al mergear a `main`. La primera vez hay que
lanzar a mano el workflow **Semaforos · Provisionar VPS** y aplicar el bloque nginx
in situ (ver `DEPLOY_NOTES.md`).
