# Finanzas — calculadoras financieras

Siete calculadoras financieras de bolsillo (interés compuesto, reglas de
capacidad de endeudamiento e hipoteca, colchón de seguridad y comparador de
deuda buena/mala), pensadas para responder en segundos preguntas que si no se
tiran de calculadora se responden "a ojo".

- Frontend: `http://localhost:5187/finanzas/` · producción `/finanzas/`
- Sin backend, sin base de datos: todo el cálculo corre en el navegador
- Acceso: roles globales `admin` e `invitado` (no crea rol nuevo en Keycloak)

## Por qué no tiene backend

Cada calculadora es una función matemática pura sobre los números que
introduce quien la usa — no hay nada que persistir ni ningún dato de terceros
que consultar. Añadir un backend (y su contenedor, su CI, su entrada en
`calendario-net`) para reenviar la misma fórmula sería infraestructura sin
propósito.

## Calculadoras incluidas

1. **Interés compuesto** — capital final con capitalización anual/mensual y
   aportaciones periódicas opcionales.
2. **Regla del ×4** — préstamo máximo saludable = salario neto anual × 4.
3. **Ahorro necesario para comprar** — 20% de entrada + 10% de gastos e
   impuestos sobre el precio de la vivienda.
4. **Cuota máxima de hipoteca** ("llave de la cuota") — sueldo neto mensual
   × 35%.
5. **Precio máximo de vivienda** ("llave del ahorro") — ahorros actuales / 30%.
6. **Colchón de seguridad post-compra** ("llave del colchón") — gastos fijos
   mensuales × 3, con validación opcional contra el ahorro restante tras la
   compra.
7. **Deuda buena vs. deuda mala** — cuota mensual por amortización francesa
   estándar, coste total, y veredicto si se indica el beneficio/ingreso extra
   esperado de esa deuda; incluye el fondo de reserva recomendado
   (cuota × 12) antes de firmar.

Las fórmulas y su lógica viven en `frontend/src/lib/calculators.ts` como
funciones puras, con sus tests en `calculators.test.ts` (`npm test`).

## Levantar en local

```bash
cd finanzas/frontend
npm install
npm run dev       # http://localhost:5187/finanzas/
npm test          # vitest — las 7 calculadoras
npm run build     # tsc + vite build
```

No hace falta levantar ninguna infraestructura Docker (sin base de datos, sin
backend propio) — a diferencia del resto de subapps del monorepo.

## Despliegue

`finanzas/infra/docker-compose.prod.yml` define un único servicio
(`finanzas-frontend`) en `calendario-net`. El bloque de nginx que expone
`/finanzas/` vive en `nginx/calendario.conf`.
