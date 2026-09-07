## 1. Base de datos (`locales` Postgres DB)

- [ ] 1.1 `locales/infra/init.sql` idempotente (sin framework de migraciones, igual que el resto)
- [x] 1.2 Tabla `normativa`: `comunidad` único, `distancia_farmacias_m` (default 250), `distancia_centros_sanitarios_m` nullable, `zona_excepcion` nullable, `notas`, `fuente_url`, soft delete, timestamps
- [x] 1.3 Semilla de `normativa`: Madrid (250 / 150), Andalucía, Comunidad Valenciana, Canarias (+ fila de excepción 1.000 m para zonas turísticas de tipo común), Baleares — cada una con `fuente_url`
- [x] 1.4 Tabla `farmacia`: `fuente`, `fuente_id`, `nombre`, `direccion`, `municipio`, `provincia`, `comunidad`, `latitud`, `longitud`, `precision_coordenadas`, `visto_en`, soft delete, timestamps, único `(fuente, fuente_id)`
- [x] 1.5 Tabla `centro_sanitario`: misma forma + `tipo` (`primaria|especializada|hospital`)
- [x] 1.6 Tabla `cobertura_municipio`: `municipio`, `provincia`, `farmacias_conocidas`, `poblacion`, `farmacias_esperadas`, `suficiente` (boolean), `calculado_en`
- [x] 1.7 Tabla `busqueda`: `tipo` (`local|farmacia`), geografía (`comunidad`, `provincia`, `municipio`, `zona_texto`, `latitud`, `longitud`, `radio_km`), criterios de local (`precio_min/max`, `superficie_min/max`, `pie_calle`), criterios de farmacia (`facturacion_min/max`), viabilidad (`comprobar_farmacias`, `comprobar_centros_sanitarios`, `distancia_farmacias_m` nullable, `distancia_centros_sanitarios_m` nullable), `portales` text[], `ultimo_rastreo`, `ultimo_rastreo_error`, soft delete, timestamps
- [x] 1.8 Tabla `anuncio`: identidad (`portal`, `portal_id` único compuesto, `url`), datos (`titulo`, `descripcion`, `precio`, `precio_anterior`, `superficie_m2`, `facturacion`, `direccion`, `municipio`, `provincia`, `comunidad`, `latitud`, `longitud`, `precision_coordenadas`, `imagen_url`), viabilidad (`veredicto`, `veredicto_motivo`, `distancia_farmacia_m`, `farmacia_mas_cercana_id`, `distancia_centro_m`, `centro_mas_cercano_id`, `viabilidad_calculada_en`, `viabilidad_motor`), estado (`visto`, `descartado`, `notificado`), soft delete, timestamps
- [x] 1.9 Tablas de apoyo: `geocode_cache` (patrón de `ruta`), `ruta_cache` (`origen_geo`, `destino_geo`, `motor`, `metros`), `scraper_state` (singleton), `presupuesto_rutas` (contador diario)
- [x] 1.10 Índices: geográficos sobre `farmacia(latitud, longitud)` y `centro_sanitario(latitud, longitud)`, `anuncio(busqueda_id)`, `anuncio(veredicto)`, únicos de deduplicación
- [x] 1.11 Trigger `update_updated_at_column()` reutilizado (patrón de `gastos`/`pisos`)

## 2. Backend scaffold (`locales/backend/`)

- [x] 2.1 Scaffold Fastify + TypeScript copiando `pisos/backend` como punto de partida (`package.json`, `tsconfig.json`, `vitest.config.ts`)
- [x] 2.2 `middleware/auth.ts` verbatim de `pisos/backend` (`verifyJwt`, `hasAnyRole`, `authMiddleware(['admin'])`)
- [x] 2.3 `db/pool.ts` + parser de `NUMERIC` → number, igual que `pisos`
- [x] 2.4 `GET /locales/api/health`
- [x] 2.5 Env vars: `LOCALES_DB_*`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (3013), `ORS_API_KEY`, `LOCALES_MOTOR_DISTANCIA`, `VALHALLA_URL`, `LOCALES_INTERVALO_MINUTOS`, `LOCALES_PAGINAS_POR_PORTAL`, `LOCALES_PRESUPUESTO_RUTAS_DIARIO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `NOMINATIM_USER_AGENT`

## 3. Padrón de farmacias y centros sanitarios

- [x] 3.1 `padron/osm.ts` — importador Overpass (`amenity=pharmacy`; `amenity=clinic|doctors|hospital` + `healthcare=centre`), por comunidad, con reintentos y respeto de la cuota pública
- [x] 3.2 `padron/oficial/madrid.ts` — importador del dataset `oficinas_farmacia` de `datos.comunidad.madrid` (CSV), geocodificando con Nominatim lo que venga sin coordenadas
- [x] 3.3 `padron/fusion.ts` — deduplicación por proximidad (<40 m), la fuente oficial gana; ausencia en la fuente ⇒ soft delete, nunca borrado físico
- [x] 3.4 `padron/cobertura.ts` — cota de cordura poblacional (~1 farmacia / 2.800 hab.) por municipio → `cobertura_municipio`
- [ ] 3.5 Refresco semanal desde el planificador + arranque en frío si el padrón está vacío
- [x] 3.6 Tests: fusión de duplicados a distintas distancias, precedencia de la fuente oficial, soft delete al desaparecer, cálculo de cobertura

## 4. Módulo de viabilidad

- [x] 4.1 `viabilidad/haversine.ts` — prefiltro de candidatas con `D * FACTOR_RODEO`, con el razonamiento (recta ≤ camino) en comentario y en test
- [x] 4.2 `viabilidad/motor.ts` — interfaz `MotorDistancia` + selección por `LOCALES_MOTOR_DISTANCIA`
- [x] 4.3 `viabilidad/motorOrs.ts` — `POST /v2/matrix/foot-walking`, troceado por el límite de destinos, 503 claro si falta `ORS_API_KEY`
- [x] 4.4 `viabilidad/motorValhalla.ts` — `sources_to_targets` con `costing=pedestrian`
- [x] 4.5 `viabilidad/presupuesto.ts` — contador diario; agotado ⇒ `sin_datos` con motivo, nunca descarte
- [x] 4.6 `viabilidad/veredicto.ts` — semáforo con margen `E` por `precision_coordenadas`, degradación a ámbar por cobertura insuficiente, `NULL` de centros = comprobación no aplicable
- [x] 4.7 Caché permanente en `ruta_cache` (coordenadas redondeadas a ~10 m)
- [x] 4.8 Tests: los cuatro veredictos en sus fronteras exactas, degradación por cobertura, umbral nulo, presupuesto agotado, acierto y fallo de caché

## 5. Portales

- [ ] 5.1 `portales/types.ts` + `portales/normalizar.ts` + `portales/http.ts` (patrón de `pisos`)
- [ ] 5.2 Locales: `fotocasa.ts`, `pisoscom.ts` (adaptados de `pisos` a la sección de locales en venta)
- [ ] 5.3 Locales: `habitaclia.ts`, `yaencontre.ts`
- [ ] 5.4 Locales: `milanuncios.ts` + geocodado por anuncio contra `geocode_cache`
- [ ] 5.5 Farmacias: `farmaconsulting.ts`, `asefarma.ts`
- [ ] 5.6 Farmacias: `negociosenventa.ts`, `tablondeanuncios.ts`, `milanunciosFarmacias.ts`
- [ ] 5.7 Tests por portal contra fixtures guardadas en el repo
- [ ] 5.8 `npm run smoke -- <portal|todos> "<zona>"` con **cobertura por campo**, incluidos los campos de farmacia
- [ ] 5.9 Documentar en el README que los parsers nacen sin verificar contra el portal real y necesitan una ronda de ajuste tras el primer smoke con red

## 6. Rastreo y planificador

- [ ] 6.1 `services/criterios.ts` — filtro fino tras normalizar; **un dato desconocido no descarta** (principio de `pisos`)
- [ ] 6.2 `services/rastreo.ts` — por búsqueda: portales → normalizar → filtrar → viabilidad → UPSERT; fallo de un portal degrada y escribe `ultimo_rastreo_error`
- [ ] 6.3 `services/planificador.ts` — `setTimeout` encadenado (no `setInterval`), jitter ±20%, respeta `scraper_state.running`
- [ ] 6.4 Detección de novedad y de bajada de precio para notificar
- [ ] 6.5 Recálculo de viabilidad de filas cuyo `viabilidad_motor` ya no es el configurado o cuyo padrón cambió
- [ ] 6.6 Tests: no solapamiento del planificador, degradación parcial, UPSERT idempotente, novedad vs bajada de precio

## 7. API (`/locales/api/*`)

- [ ] 7.1 `GET/POST/PATCH/DELETE /searches` (Zod discriminado por `tipo`, soft delete)
- [ ] 7.2 `POST /searches/:id/rastrear` — manual, **no notifica**
- [ ] 7.3 `GET /listings` — filtros `busqueda`, `tipo`, `veredicto`, `nuevos`, `descartados`
- [ ] 7.4 `PATCH /listings/:id`, `POST /listings/marcar-vistos`, `DELETE /listings/:id`
- [ ] 7.5 `GET/PATCH /scraper/state`
- [x] 7.6 `GET/PATCH /normativa` — consulta y edición de las distancias por comunidad
- [x] 7.7 `POST /viabilidad/comprobar` — punto o dirección suelta → veredicto (lo que usa el bot y el botón de la UI)
- [x] 7.8 `GET /padron/cobertura` — estado del padrón por municipio, para poder ver dónde no fiarse
- [ ] 7.9 Tests de rutas: guard de rol, Zod, soft delete, filtros

## 8. Bot de Telegram (doble sentido)

- [x] 8.1 Telegraf con long polling en el proceso Fastify (patrón de `gastos`), ignorando en silencio otros chats
- [ ] 8.2 Emisión: anuncio nuevo / bajada de precio, con veredicto, metros y aviso de no-certificación; fallo de envío ⇒ no marcar `notificado`
- [x] 8.3 Recepción: ubicación compartida
- [x] 8.4 Recepción: `/comprobar <dirección>` (precisión `exacta` si lleva número)
- [x] 8.5 Recepción: URL de anuncio reenviada
- [ ] 8.6 Tests: filtro por chat id, formateo de los cuatro veredictos, reintento en fallo de envío

## 9. Frontend (`locales/frontend/`)

- [ ] 9.1 Scaffold React + Vite + TS copiando `pisos/frontend`; Keycloak, `ThemeToggle`, `AppLauncher`
- [ ] 9.2 Formulario de búsqueda con los dos `tipo` y los toggles de qué normativa aplicar
- [ ] 9.3 Feed de anuncios con el semáforo bien visible, motivo del veredicto y metros a la farmacia más cercana
- [ ] 9.4 Mapa Leaflet (npm, no CDN): anuncio, farmacias cercanas y el círculo del umbral legal
- [ ] 9.5 Panel de comprobación puntual (misma función que el bot, desde el navegador)
- [ ] 9.6 Vista de normativa editable y vista de cobertura del padrón
- [ ] 9.7 Aviso de no-certificación en cada veredicto; `ultimo_rastreo_error` en rojo sobre la búsqueda

## 10. Infra y wiring

- [x] 10.1 `locales/backend/Dockerfile`, `locales/frontend/Dockerfile` + `nginx.conf`
- [x] 10.2 `locales/infra/docker-compose.local.yml` y `.prod.yml` (red externa `calendario-net`), Postgres `locales` en `:5442`
- [x] 10.3 Servicio opcional `locales-valhalla` + volumen de teselas, apagado por defecto
- [ ] 10.4 `nginx/calendario.conf`: location `/locales/` — **aplicar in situ en el servidor**, no copiar el fichero (ha divergido)
- [ ] 10.5 Workflows de CI: build + push de `ghcr.io/manuhddev/locales-backend|frontend`, con `npm test`
- [ ] 10.6 Las **14 copias de `AppLauncher`**: entrada `locales`, `roles: ['admin']`, icono, URL local y de producción
- [ ] 10.7 `CLAUDE.md`: sección `## Locales`, tabla de puertos, tabla de roles, y nota en la deuda técnica (15ª copia del AppLauncher, JWT duplicado)
- [x] 10.8 `locales/README.md`: cómo funciona, alta del bot, smoke, elección de motor, y el aviso legal
- [ ] 10.9 `DEPLOY_NOTES.md`: sembrar el padrón antes del primer rastreo, y ejecutar el smoke tras desplegar
