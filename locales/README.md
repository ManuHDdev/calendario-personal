# Locales — locales y farmacias en venta, con la distancia legal ya comprobada

Busca **locales comerciales en venta** donde poder instalar una farmacia, y
**farmacias ya en funcionamiento en venta**, y comprueba solo la parte que no
se puede automatizar de otra forma: a qué distancia **caminando** está la
farmacia y el centro sanitario más cercanos, contra la distancia mínima que
exige esa comunidad autónoma.

- Frontend: `http://localhost:5185/locales/` · producción `/locales/` *(pendiente)*
- Backend: `:3013`, rutas bajo `/locales/api`
- Base de datos: PostgreSQL `locales` (local `:5442`)
- Acceso: solo rol `admin`

## Por qué existe

La distancia mínima entre farmacias **no se mide en línea recta, se mide por el
camino vial más corto**. Comprobarlo a mano son diez o quince minutos por
anuncio en un mapa, y un local bueno en zona buena no dura tanto. Todo lo demás
de esta app es la tubería alrededor de ese cálculo.

## Lo primero que hay que entender: el semáforo

**Esta app nunca dice "cumple" o "no cumple".** La coordenada de un anuncio no
es fiable a la escala de 250 metros: los portales desplazan la ubicación a
propósito, a veces cientos de metros. Afirmar cumplimiento sobre ese dato sería
inventarse una precisión que la entrada no tiene.

| | Significado |
|---|---|
| 🟢 **verde** | Cumple **incluso en el peor caso** del error de posición |
| 🔴 **rojo** | Incumple **incluso en el mejor caso** |
| 🟡 **ámbar** | El dato de entrada no permite decidir — hay que mirarlo |
| ⚪ **sin datos** | No se ha podido calcular, y se dice por qué |

El margen que separa esas bandas sale de la precisión de las coordenadas: 0 m
si es una dirección con número, 150 m si es una ubicación aproximada de portal,
300 m si no se sabe.

**Un ámbar no es un fallo.** Es la respuesta correcta cuando el portal no da
mejor dato, y por eso existe el bot: le mandas la dirección exacta en cuanto
llamas al anuncio y el margen baja a cero.

### Los dos errores no valen lo mismo

Un local que parece malo y era bueno cuesta una oportunidad. Un local que
parece bueno y no lo es cuesta un viaje, una señal, o peor. Todo el diseño está
escrito alrededor de esa asimetría, y de ahí salen tres comportamientos que
parecen excesivos hasta que se entiende el motivo:

- **Un padrón incompleto degrada los verdes a ámbar.** Un falso verde solo
  puede venir de una farmacia que existe y no está en la base de datos. No hay
  forma de saber cuál falta, pero sí de saber que el conjunto no cuadra: España
  autoriza ~1 farmacia por cada 2.800 habitantes, así que un municipio de 50.000
  habitantes con 4 farmacias está mal cubierto. Ahí no se emite ningún verde.
- **Sin normativa cargada para una comunidad no se da verde, se da "sin datos".**
  Rellenar el hueco con el mínimo estatal escondería una comunidad sin sembrar.
- **Sin población conocida, la cobertura se declara insuficiente.** No saber
  nunca puede leerse como "cumple".

## Aviso legal (va en cada veredicto, y va en serio)

El método exacto de medición lo fija el **reglamento de cada comunidad**: de
qué punto del local a qué punto de la farmacia, y qué viales cuentan. Lo que
calcula esta app es una aproximación muy buena por acera. **Sirve para descartar
y priorizar; no certifica nada.** La comprobación que vale ante la
administración la hace un técnico.

## El prefiltro, que es lo que hace esto barato

La distancia caminando es **siempre mayor o igual** que la línea recta. Por
tanto, una farmacia a más de `D` metros en recta no puede estar a menos de `D`
caminando: descartarla no puede producir ningún falso negativo. Es una
implicación matemática, no una heurística.

Hay dos radios, y la diferencia importa:

- **Radio decisivo** = `umbral + margen`. Dentro de él, una candidata sin medir
  puede cambiar el veredicto, así que no medirla degrada a ámbar. **El margen no
  es opcional**: la posición real puede estar desplazada, y sin sumarlo una
  farmacia justo fuera del radio podría estar de verdad dentro del umbral.
- **Radio informativo** = `umbral × 3 + margen`. Solo sirve para poder decir a
  cuántos metros está la más cercana aunque cumpla de sobra.

Resultado: un anuncio se resuelve con **una sola petición de matriz** sobre unas
pocas decenas de candidatas.

## Motor de distancias

Intercambiable con `LOCALES_MOTOR_DISTANCIA`, tras una interfaz única:

| | Cuándo | Coste |
|---|---|---|
| `ors` *(por defecto)* | Desde el minuto uno | Misma `ORS_API_KEY` que `paraisos` y `ruta`. **Ojo: el endpoint de matriz tiene cuota más baja que el de direcciones**, por eso el presupuesto diario va aparte y por defecto en 400 |
| `valhalla` | Objetivo a largo plazo | Instancia propia, sin cuota, milisegundos. Perfil `valhalla` del compose |

Se eligió Valhalla y no OSRM para el caso propio porque OSRM carga el grafo
peatonal entero en RAM (varios GB para España) y Valhalla mapea sus teselas bajo
demanda, así que convive con las otras subapps del mismo VPS.

Cada veredicto guarda **con qué motor se calculó**. Al cambiar de motor, eso es
lo que permite saber qué filas recalcular en vez de tener dos criterios
mezclados sin forma de distinguirlos.

Agotar el presupuesto **nunca descarta un anuncio**: se guarda con `sin_datos` y
su motivo, y se recalcula en la siguiente vuelta.

## El padrón

Dos fuentes, fusionadas por proximidad (dos registros a menos de 40 m son la
misma farmacia, y gana el oficial):

1. **OpenStreetMap** vía Overpass — capa nacional uniforme, las 19 comunidades.
2. **Registro oficial de la comunidad**, donde exista abierto. De momento
   Madrid (`datos.comunidad.madrid`).

De OSM se saca además la **población municipal** (relaciones `admin_level=8`),
que es la cota contra la que se valida la cobertura.

```bash
cd locales/backend
npm run padron -- madrid                      # una comunidad
npm run padron -- madrid andalucia valenciana # varias
npm run padron -- todas                       # las 19
npm run padron -- --cobertura                 # solo recalcular cobertura
```

Va por comunidad porque Overpass responde mucho mejor a consultas acotadas, y
porque así un fallo en una no se lleva el resto por delante.

**Hay que ejecutarlo antes del primer uso.** Con el padrón vacío toda
comprobación devuelve "sin datos", que es lo correcto: un padrón vacío no
demuestra que no haya farmacias cerca. El backend lo avisa en el log al arrancar.

Tres reglas del importador: una fuente que desaparece **se da de baja, no se
borra**; una importación fallida **no vacía nada** (un 504 de Overpass no puede
producir verdes falsos en masa); y la cobertura **se recalcula siempre** al
terminar.

## Normativa: es dato, no código

Una fila por comunidad, editable desde la API. El mínimo estatal son 250 m
(Ley 16/1997) y las comunidades pueden endurecerlo.

`verificado` distingue lo comprobado contra la norma autonómica concreta de lo
que solo hereda el mínimo estatal. **Solo 6 de las 20 filas van como
verificadas**: Madrid (250 m + 150 m a centros sanitarios), Andalucía, Comunidad
Valenciana, Baleares, Canarias y la excepción canaria de **1.000 m en zonas
farmacéuticas turísticas de tipo común**. El resto se sirve con
`verificado: false` y el veredicto lo dice en voz alta, en vez de aparentar una
certeza que no hay.

`distancia_centros_sanitarios_m` a `NULL` significa **"esta comunidad no impone
esa distancia"**, nunca "cero metros".

Cada búsqueda hereda los umbrales de su comunidad y puede sobreescribirlos, o
apagar cualquiera de las dos comprobaciones.

## Bot de Telegram

Doble sentido, a diferencia del de `pisos` (que solo emite): long polling en el
mismo proceso, como el de `gastos`. Ignora en silencio cualquier chat que no sea
`TELEGRAM_OWNER_CHAT_ID`.

- 📍 **Ubicación compartida** → farmacias y centros cercanos con sus metros.
- ✍️ `/comprobar Calle Mayor 12, Madrid` → con número de portal, margen cero.

Alta del bot: [@BotFather](https://t.me/BotFather) → `/newbot`, y
`npm run telegram:chat-id` para leer tu `chat.id`.

Sin `TELEGRAM_BOT_TOKEN`/`TELEGRAM_OWNER_CHAT_ID` la app funciona igual, solo se
queda sin avisos, y lo dice en el log al arrancar.

## Endpoints (`/locales/api/*`)

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/viabilidad/comprobar` | Punto o dirección → veredicto. Lo que usa el bot |
| `GET` | `/viabilidad/presupuesto` | Cuánta cuota de motor queda hoy |
| `GET` | `/normativa` | Distancias por comunidad, con su `verificado` |
| `PATCH` | `/normativa/:comunidad` | Editar distancias, fuente y notas |
| `GET` | `/padron/cobertura` | Dónde el padrón está incompleto (`?incompletos=true`) |
| `GET` | `/padron/resumen` | Qué hay cargado, por comunidad y fuente |
| `GET` | `/health` | Sin auth |

## Variables de entorno

`LOCALES_DB_HOST`, `LOCALES_DB_NAME`, `LOCALES_DB_USER`, `LOCALES_DB_PASSWORD`,
`LOCALES_DB_PORT`, `KEYCLOAK_CERTS_URL`, `CORS_ORIGIN`, `PORT` (3013),
`LOCALES_MOTOR_DISTANCIA` (`ors`|`valhalla`), `ORS_API_KEY`, `VALHALLA_URL`,
`LOCALES_PRESUPUESTO_RUTAS_DIARIO` (400), `OVERPASS_URL`,
`LOCALES_DATASET_MADRID`, `NOMINATIM_USER_AGENT`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_OWNER_CHAT_ID`.

## Estado y qué falta

**Listo y verificado** (contra Postgres real y con el servidor levantado):
esquema, padrón, motores, semáforo, API y bot de consulta. 95 tests unitarios,
todos sin base de datos para que CI los pueda correr.

**Pendiente**: los rastreadores de portales (Fotocasa, pisos.com, habitaclia,
yaencontre, Milanuncios para locales; Farmaconsulting, Asefarma,
negociosenventa, tablondeanuncios para farmacias), el planificador y el
frontend.

### Advertencia sobre los parsers, cuando lleguen

Se escriben a partir del patrón de `pisos`, pero **no se pueden verificar contra
los portales reales desde el entorno de desarrollo**, cuya política de red
bloquea todo el egreso. Los tests corren contra fixtures y verifican la lógica
de parseo, no que el portal sirva hoy lo esperado. Por eso
`npm run smoke -- <portal> "<zona>"` es parte de la feature y no un extra: es el
único sitio donde se comprueba la realidad, y hay que contar con **una ronda de
ajuste por portal** tras ejecutarlo por primera vez con red.

Lo mismo aplica ya al importador oficial de Madrid: se escribió sin poder ver el
CSV, así que busca las columnas por una lista de alias y, si no reconoce
ninguna, **falla imprimiendo la cabecera real** en vez de adivinar. Si la
primera importación se queja, el único sitio a tocar es `ALIAS` en
`src/padron/oficial/madrid.ts`.
