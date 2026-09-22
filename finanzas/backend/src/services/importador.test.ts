import { describe, it, expect } from 'vitest';
import { construirUpsertFilaQuery, calcularProximaAccion } from './importador';
import type { FilaPrecio } from './xlsParser';

describe('construirUpsertFilaQuery', () => {
  const fila: FilaPrecio = {
    ambito: 'provincia',
    nombre: 'Almería',
    comunidad_autonoma: 'Andalucía',
    anio: 2024,
    trimestre: 1,
    precio_m2: 1218.1,
  };

  it('usa ON CONFLICT sobre (ambito, nombre, anio, trimestre) para no duplicar', () => {
    const { text } = construirUpsertFilaQuery(fila);
    expect(text).toMatch(/ON CONFLICT \(ambito, nombre, anio, trimestre\)/);
    expect(text).toMatch(/DO UPDATE SET/);
  });

  it('importar dos veces la misma fila produce la misma query parametrizada (idempotente)', () => {
    const primera = construirUpsertFilaQuery(fila);
    const segunda = construirUpsertFilaQuery({ ...fila });
    expect(primera.text).toBe(segunda.text);
    expect(primera.values).toEqual(segunda.values);
  });

  it('actualiza el valor si el Ministerio revisa un dato pasado', () => {
    const { text } = construirUpsertFilaQuery(fila);
    expect(text).toMatch(/precio_m2 = EXCLUDED\.precio_m2/);
  });
});

describe('calcularProximaAccion', () => {
  const INTERVALO_MS = 24 * 60 * 60_000;

  it('sin ejecución previa registrada, ejecuta ya (aunque la tabla no esté vacía)', () => {
    const resultado = calcularProximaAccion(null, new Date('2026-09-22T12:00:00Z'), INTERVALO_MS);
    expect(resultado).toEqual({ ejecutarAhora: true, esperaMs: 0 });
  });

  it('si ya pasó el intervalo completo desde la última ejecución, ejecuta ya', () => {
    const ultima = new Date('2026-09-20T00:00:00Z');
    const ahora = new Date('2026-09-22T00:00:01Z'); // 2 días después
    const resultado = calcularProximaAccion(ultima, ahora, INTERVALO_MS);
    expect(resultado.ejecutarAhora).toBe(true);
    expect(resultado.esperaMs).toBe(0);
  });

  it('si NO ha pasado el intervalo, espera lo que falta (no un intervalo entero desde ahora)', () => {
    const ultima = new Date('2026-09-22T00:00:00Z');
    const ahora = new Date('2026-09-22T10:00:00Z'); // 10h después
    const resultado = calcularProximaAccion(ultima, ahora, INTERVALO_MS);
    expect(resultado.ejecutarAhora).toBe(false);
    expect(resultado.esperaMs).toBe(14 * 60 * 60_000); // quedan 14h, no 24h
  });

  it('regresión: un redespliegue justo tras un fallo NO reinicia el reloj a un intervalo completo', () => {
    // Caso real reportado: la última ejecución falló y, si el proceso se
    // reinicia poco después (redespliegue), antes se esperaban otras 24h
    // completas desde el reinicio en vez de terminar de esperar lo que
    // quedaba desde el fallo original.
    const ultimaEjecucionFallida = new Date('2026-09-20T04:27:26Z');
    const redespliegueInmediato = new Date('2026-09-20T04:30:00Z'); // 2min34s después
    const resultado = calcularProximaAccion(ultimaEjecucionFallida, redespliegueInmediato, INTERVALO_MS);
    expect(resultado.ejecutarAhora).toBe(false);
    // Debe faltar prácticamente el intervalo completo (24h), no haberse
    // reiniciado a otro intervalo completo distinto medido desde ahora.
    const transcurridoMs = redespliegueInmediato.getTime() - ultimaEjecucionFallida.getTime();
    expect(resultado.esperaMs).toBe(INTERVALO_MS - transcurridoMs);
  });

  it('exactamente en el borde del intervalo, ejecuta ya', () => {
    const ultima = new Date('2026-09-20T00:00:00Z');
    const ahora = new Date('2026-09-21T00:00:00Z');
    const resultado = calcularProximaAccion(ultima, ahora, INTERVALO_MS);
    expect(resultado.ejecutarAhora).toBe(true);
  });
});
