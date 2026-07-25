import { describe, it, expect } from 'vitest';
import { buildListQuery, buildTotalesQuery } from './queries';

// El repo no tiene infraestructura de tests de integración contra Postgres
// real en ningún subapp (ver deuda técnica en CLAUDE.md) — mapacyd/panel/
// storage no tienen tests en absoluto. Estos tests verifican, a nivel de SQL
// generado, que las reglas de negocio duras (soft delete y exclusión de
// pendientes en totales) están SIEMPRE presentes en la query, sin necesidad
// de una base de datos real.
describe('buildListQuery', () => {
  it('always filters by activo = true (soft delete exclusion)', () => {
    const { text } = buildListQuery({});
    expect(text).toContain('activo = true');
  });

  it('adds an estado filter when requested', () => {
    const { text, values } = buildListQuery({ estado: 'pendiente_revision' });
    expect(text).toContain('estado = $1');
    expect(values).toEqual(['pendiente_revision']);
  });

  it('adds a categoria filter when requested', () => {
    const { text, values } = buildListQuery({ categoria: 'Alimentación' });
    expect(text).toContain('categoria = $1');
    expect(values).toEqual(['Alimentación']);
  });

  it('adds a mes filter when requested', () => {
    const { text, values } = buildListQuery({ mes: '2026-07' });
    expect(text).toContain("date_trunc('month', fecha)");
    expect(values).toEqual(['2026-07-01']);
  });

  it('combines all filters together with activo always included', () => {
    const { text, values } = buildListQuery({ mes: '2026-07', categoria: 'Ocio', estado: 'confirmado' });
    expect(text).toContain('activo = true');
    expect(text).toContain('categoria = $2');
    expect(text).toContain('estado = $3');
    expect(values).toEqual(['2026-07-01', 'Ocio', 'confirmado']);
  });
});

describe('buildTotalesQuery', () => {
  it('always filters by estado = confirmado (pending drafts excluded from totals)', () => {
    const { text } = buildTotalesQuery('2026-07');
    expect(text).toContain("estado = 'confirmado'");
  });

  it('always filters by activo = true', () => {
    const { text } = buildTotalesQuery('2026-07');
    expect(text).toContain('activo = true');
  });

  it('scopes to the requested month', () => {
    const { values } = buildTotalesQuery('2026-07');
    expect(values).toEqual(['2026-07-01']);
  });
});
