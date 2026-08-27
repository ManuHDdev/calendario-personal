# Ruta — Wallapop por el camino

Dado un trayecto en coche (de A a B), busca en Wallapop lo que le pidas y te
devuelve solo los anuncios que estén a **menos de N km de desvío de la ruta
real**, ordenados por el orden en que los pasarías conduciendo.

No es "busca cerca de las ciudades por las que pasas". El filtro es la
distancia perpendicular al trazado real de la carretera, calculada anuncio a
anuncio.

## Cómo funciona

```
origen/destino (texto)
   │  Nominatim (geocodificación, cacheada en Postgres)
   ▼
coordenadas
   │  OpenRouteService  →  polilínea completa del trayecto
   ▼
ruta simplificada (Douglas-Peucker, tolerancia 50 m)
   │  planCorridor()  →  cadena de círculos que cubre el corredor
   ▼
N búsquedas en Wallapop (concurrencia 4, 2 páginas por punto)
   │  deduplicar por id
   ▼
filtro EXACTO: distancia perpendicular a la polilínea ≤ desvío pedido
   │  + filtro de precio + exclusión de palabras
   ▼
resultados ordenados por progreso a lo largo de la ruta
```

## La parte que importa: el plan de cobertura

Wallapop solo acepta **círculos** (un centro y `distance_in_km`). Lo que hace
falta es un **corredor**. Cubrir un corredor con una cadena de círculos tiene
una condición geométrica exacta.

Con círculos de radio `Q` cada `S` km a lo largo de la ruta, para cualquier
anuncio `P` dentro del corredor de semianchura `R`:

- sea `Q_P` el punto de la ruta más cercano a `P`, con `|P Q_P| ≤ R`;
- hay un centro `C` a como mucho `S/2` de **longitud de arco** de `Q_P`, y la
  distancia en línea recta `|Q_P C|` nunca supera ese arco (una cuerda nunca es
  más larga que su arco);
- por desigualdad triangular: `|P C| ≤ R + S/2`.

Por tanto `Q = R + S/2`, o lo que es lo mismo **`S = 2·(Q − R)`**. Esto exige
`Q > R`: una cadena de círculos de radio `R` nunca puede cubrir del todo un
corredor de radio `R`, por muy juntos que se pongan.

### Por qué no se usa la cota `√(R² + (S/2)²)`

El peor caso "evidente" —un anuncio a distancia `R`, justo a mitad de camino
entre dos centros— sugiere `Q ≥ √(R² + (S/2)²)`, que es más pequeña y por tanto
más barata. **Esa cota es incorrecta para una ruta real**, porque asume que la
ruta es recta entre centros consecutivos. En el exterior de una curva la
carretera se aleja del borde del corredor, y el siguiente centro queda más
lejos del anuncio de lo que predice la fórmula.

Medido contra una polilínea Badajoz–Madrid, esa cota dejaba puntos hasta un
**8% fuera** del círculo más cercano: anuncios que el usuario pidió, perdidos
en silencio, sin ninguna señal de que faltaba algo. La cota triangular no
asume nada sobre la forma de la ruta, así que vale igual en autovía que en
puerto de montaña.

`corridor.test.ts` recorre el borde del corredor de una ruta con curvas y
comprueba la propiedad directamente, para varios desvíos.

### Por qué se elige el radio más pequeño posible

Un radio grande cubre el corredor con menos peticiones, pero cada respuesta de
Wallapop está limitada a 40 anuncios por página. En un círculo grande esos
huecos se los llevan anuncios lejos de la ruta (en Madrid, casi todos), que
luego descarta el filtro exacto. Círculos pequeños recuperan mucho más del
corredor por petición. El planificador elige, por tanto, el **radio más pequeño
que cabe en el presupuesto de peticiones**, no el más grande que minimiza
peticiones.

## Rutas (`/ruta/api/*`)

| Ruta | Descripción |
|---|---|
| `GET /geocode?q=` | Texto libre → coordenadas (Nominatim, cacheado) |
| `POST /search` | La búsqueda de corredor. Devuelve ruta, plan, anuncios y estadísticas |
| `GET /searches` | Búsquedas guardadas (`activo = true`) |
| `POST /searches` | Alta de búsqueda guardada |
| `GET /searches/:id` | Detalle |
| `PATCH /searches/:id` | Edición parcial |
| `DELETE /searches/:id` | Borrado lógico |
| `GET /health` | Healthcheck |

Todas exigen JWT de Keycloak con rol `admin`.

### `POST /search`

```jsonc
{
  "origen":  { "lat": 38.9167, "lng": -5.6667 },
  "destino": { "lat": 40.4168, "lng": -3.7038 },
  "keyword": "bicicleta de montaña",
  "desvio_max_km": 5,
  "min_price": null,
  "max_price": 300,
  "excluir_palabras": "infantil, niño"
}
```

La respuesta incluye `stats.failedRequests` y `plan.fullCoverage`. **Ambos se
muestran en la UI cuando no son perfectos**: una búsqueda parcial no debe
parecerse a una completa.

## Variables de entorno

| Variable | Notas |
|---|---|
| `RUTA_DB_HOST` / `_NAME` / `_USER` / `_PASSWORD` / `_PORT` | PostgreSQL propio |
| `KEYCLOAK_CERTS_URL` | Igual que el resto de subapps |
| `CORS_ORIGIN` | Lista separada por comas |
| `PORT` | Por defecto `3011` |
| `ORS_API_KEY` | **Obligatoria.** Gratuita en openrouteservice.org. Sin ella, `POST /search` devuelve 503 en vez de romper el arranque |

## Límites conocidos

- **Wallapop es no oficial y reverseado.** `api.wallapop.com/api/v3/search` no
  es la API de partner de pago. El endpoint, sus parámetros, las coordenadas
  por anuncio y el token `meta.next_page` se confirmaron contra respuestas
  reales el 2026-08-27, pero pueden cambiar sin aviso.
- **Solo Wallapop.** Milanuncios no ofrece búsqueda por coordenadas + radio,
  solo por provincia, así que un desvío de N km no se puede cumplir sin
  geocodificar cada anuncio. Queda fuera a propósito, no por olvido.
- **Anuncios sin coordenadas se descartan.** La promesa de la app es "a menos
  de N km de tu ruta"; de un anuncio sin posición no se puede afirmar eso.
- **Presupuesto de peticiones.** Como máximo 40 puntos × 2 páginas por
  búsqueda, con concurrencia 4. Rutas muy largas usan círculos más grandes, con
  la pérdida de recall que eso implica (ver arriba).
- **Sin paginación exhaustiva.** Dos páginas (80 anuncios) por punto. Una
  búsqueda muy genérica en zona densa puede no agotar la oferta local.
- **Nominatim**: 1 petición/segundo, serializada en el backend y cacheada en
  Postgres de forma permanente.
- **ORS**: tope propio de 2000 rutas/día (por debajo del límite real del plan
  gratuito) y caché de 6 h por par de coordenadas redondeadas a ~100 m.

## Tests

```bash
cd ruta/backend
npm test
```

Cubren la geometría (haversine, distancia punto-segmento, distancia a
polilínea, muestreo, simplificación), la **garantía de cobertura del corredor**
y el filtro de exclusión de palabras. Ninguno toca la red.

## Desarrollo local

Puertos: frontend `5183`, backend `3011`, PostgreSQL `5440`.

```bash
export ORS_API_KEY=...   # sin esto, la búsqueda devuelve 503
bash start-local.sh
```
