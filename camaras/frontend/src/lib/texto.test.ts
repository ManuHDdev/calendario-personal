import { describe, it, expect } from 'vitest';
import { normalizar, coincide } from './texto';
import { haceCuanto } from './tiempo';
import { resumirEstado } from './estado';

describe('normalizar / coincide', () => {
  it('ignora tildes y mayúsculas', () => {
    expect(normalizar('  MÉRIDA ')).toBe('merida');
    expect(coincide({ nombre: 'A-5 Mérida acceso este', carretera: 'A-5' }, 'merida')).toBe(true);
  });

  it('todas las palabras deben aparecer, en cualquier orden', () => {
    const c = { nombre: 'Acceso este Mérida', carretera: 'A-5' };
    expect(coincide(c, 'merida este')).toBe(true);
    expect(coincide(c, 'este badajoz')).toBe(false);
  });

  it('busca también en la carretera y una consulta vacía lo acepta todo', () => {
    expect(coincide({ nombre: 'Salida 4', carretera: 'EX-A1' }, 'ex-a1')).toBe(true);
    expect(coincide({ nombre: 'x', carretera: null }, '   ')).toBe(true);
  });
});

describe('haceCuanto', () => {
  const ahora = new Date('2026-10-20T12:00:00Z');
  it.each([
    ['2026-10-20T11:59:50Z', 'hace un momento'],
    ['2026-10-20T11:30:00Z', 'hace 30 min'],
    ['2026-10-20T07:00:00Z', 'hace 5 h'],
    ['2026-10-17T12:00:00Z', 'hace 3 d'],
  ])('%s → %s', (iso, esperado) => expect(haceCuanto(iso, ahora)).toBe(esperado));

  it('fecha inválida', () => expect(haceCuanto('basura', ahora)).toBe('fecha desconocida'));
});

describe('resumirEstado', () => {
  const ahora = new Date('2026-10-20T12:00:00Z');
  const base = { ultimaEjecucion: '2026-10-20T10:00:00Z', ok: true, totalFeed: 900, totalCercanas: 12, porCiudad: null, error: null };

  it('nunca importado', () => {
    expect(resumirEstado(null, ahora).nivel).toBe('neutro');
    expect(resumirEstado({ ...base, ultimaEjecucion: null }, ahora).nivel).toBe('neutro');
  });

  it('importación buena', () => {
    const r = resumirEstado(base, ahora);
    expect(r.nivel).toBe('ok');
    expect(r.texto).toContain('12 cámaras de 900');
  });

  it('una importación fallida se nota como error y dice por qué', () => {
    const r = resumirEstado({ ...base, ok: false, error: 'HTTP 503' }, ahora);
    expect(r.nivel).toBe('error');
    expect(r.texto).toContain('HTTP 503');
  });
});
