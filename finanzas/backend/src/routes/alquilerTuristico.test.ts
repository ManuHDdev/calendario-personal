import { describe, it, expect } from 'vitest';
import { fechaSqlAString } from './alquilerTuristico';

describe('fechaSqlAString', () => {
  it('convierte un Date (como devuelve pg para una columna DATE) a "YYYY-MM-DD"', () => {
    // Regresión real (2026-09-24): pg NO devuelve una columna DATE como
    // string, la parsea a un objeto Date (construido en hora LOCAL, no
    // UTC). El código de la ruta hacía `.localeCompare()` sobre ese valor
    // asumiendo que era un string, y crasheaba con
    // "snapshotDate.localeCompare is not a function" en producción.
    const fecha = new Date(2026, 5, 20); // 20 de junio de 2026, hora local
    expect(fechaSqlAString(fecha)).toBe('2026-06-20');
  });

  it('no depende de la zona horaria del proceso (usa getters locales, nunca UTC)', () => {
    // pg construye el Date con `new Date(year, month - 1, day)` en hora
    // LOCAL — así que los getters locales SIEMPRE devuelven el año/mes/día
    // originales, sin importar el huso horario del proceso. Usar
    // getUTCFullYear()/toISOString() en su lugar desplazaría la fecha un
    // día en cualquier huso horario con offset positivo (p. ej. España en
    // verano, UTC+2) — justo el bug que este test evita reintroducir.
    const fecha = new Date(2026, 0, 1); // 1 de enero, medianoche local
    expect(fechaSqlAString(fecha)).toBe('2026-01-01');
  });

  it('un string ya formateado se devuelve tal cual (por si pg cambiara de comportamiento)', () => {
    expect(fechaSqlAString('2026-06-20')).toBe('2026-06-20');
  });
});
