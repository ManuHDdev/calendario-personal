# Simuladores — matemáticas y física en movimiento

Simuladores animados e interactivos para entender ideas de matemáticas y
física viéndolas ocurrir: cada uno anima el fenómeno, deja tocar sus
parámetros y muestra gráficas en vivo donde la teoría aparece a medida que se
acumulan los experimentos.

- Frontend: `http://localhost:5194/simuladores/` · producción `/simuladores/`
- Sin backend, sin base de datos: todo corre en el navegador
- Acceso: solo rol `admin` (no crea rol nuevo en Keycloak)

## Simuladores

| Ruta | Qué enseña |
|------|------------|
| `/prisioneros` | Dilema de los 100 prisioneros: estrategia del bucle, ciclos de una permutación, Montecarlo (≈ 31,18 % frente a (1/2)^n) e histograma del ciclo más largo |
| `/cardioide` | Tablas de multiplicar en un círculo (cardioide, nefroide…) y el círculo rodante que traza la misma curva |
| `/parada-optima` | Problema de la secretaria: observar el 37 % y elegir; curva P(r) simulada frente a la teórica |
| `/monty-hall` | Monty Hall con puertas animadas, juego manual y miles de partidas automáticas; n puertas |
| `/galton` | Tablero de Galton: binomial y aproximación normal |
| `/pi` | Estimación de π con puntos aleatorios y con la aguja de Buffon |
| `/fourier` | Series de Fourier con epiciclos y fenómeno de Gibbs |
| `/pendulo-doble` | Péndulo doble integrado con RK4: caos y sensibilidad a las condiciones iniciales |

## Estructura

```
frontend/src/
├── lib/            lógica pura + tests (vitest): sin DOM, deterministas con semilla
├── hooks/          useAnimationFrame, useCanvas, useThemeColors, useBatchRunner…
├── components/     controles, gráficas SVG, layout, AppLauncher, ThemeToggle
├── simulators/     un directorio por simulador (solo dibujo y orquestación)
└── pages/          AppShell (cabecera) y HubPage (tarjetas con miniaturas)
```

La regla es que todo lo que se puede comprobar con un test vive en `lib/`
(probabilidades teóricas, simulaciones de Montecarlo, integración numérica);
los componentes solo leen esos resultados y los pintan.

Para añadir un simulador: lógica en `lib/` con su test, componente en
`simulators/<nombre>/` y una entrada en `simulators/registry.ts` (crea la
tarjeta del índice y la ruta). Si quieres miniatura, añádela en
`pages/Thumbnails.tsx`.

## Levantar en local

```bash
cd simuladores/frontend
npm install
npm run dev          # http://localhost:5194/simuladores/ (necesita Keycloak local)
npm run dev:noauth   # igual, pero sin Keycloak (solo en desarrollo)
npm test             # vitest
npm run build        # tsc + vite build
```

`dev:noauth` arranca Vite en modo `noauth` (`.env.noauth` →
`VITE_SKIP_AUTH=true`). `main.tsx` solo se salta Keycloak si además
`import.meta.env.DEV` es cierto, y `vite build` lo fija a `false`, así que el
atajo nunca llega a una imagen de producción.

## Despliegue

`simuladores/infra/docker-compose.prod.yml` define un único servicio
(`simuladores-frontend`, imagen `ghcr.io/manuhddev/simuladores-frontend:latest`)
en `calendario-net`. `.github/workflows/simuladores-ci.yml` testea, construye,
publica la imagen y la despliega en `/home/manu/simuladores` al hacer push a
`main`. El bloque `location /simuladores/` vive en `nginx/calendario.conf` y lo
despliega el pipeline de Calendario.
