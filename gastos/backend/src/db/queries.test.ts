import { describe, it, expect } from 'vitest';
import {
  buildListQuery,
  buildTotalesQuery,
  buildTotalesPorMesQuery,
  buildSugerenciasQuery,
  anioRange,
  mesRange,
} from './queries';

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

  it('filters a whole year with an index-friendly half-open range, not date_trunc', () => {
    const { text, values } = buildListQuery({ anio: '2026' });
    expect(text).toContain('fecha >= $1::date AND fecha < $2::date');
    expect(text).not.toContain('date_trunc');
    expect(values).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('adds a tipo filter when requested', () => {
    const { text, values } = buildListQuery({ tipo: 'ganancia' });
    expect(text).toContain('tipo = $1');
    expect(values).toEqual(['ganancia']);
  });

  it('numbers placeholders correctly when anio, categoria, estado and tipo combine', () => {
    const { text, values } = buildListQuery({
      anio: '2026', categoria: 'Ocio', estado: 'confirmado', tipo: 'gasto',
    });
    expect(text).toContain('activo = true');
    expect(text).toContain('fecha >= $1::date AND fecha < $2::date');
    expect(text).toContain('categoria = $3');
    expect(text).toContain('estado = $4');
    expect(text).toContain('tipo = $5');
    expect(values).toEqual(['2026-01-01', '2027-01-01', 'Ocio', 'confirmado', 'gasto']);
  });

  it('keeps the year listing newest-first and forecasts soonest-first', () => {
    expect(buildListQuery({ anio: '2026', estado: 'confirmado' }).text)
      .toContain('ORDER BY fecha DESC, created_at DESC');
    expect(buildListQuery({ anio: '2026', estado: 'previsto' }).text)
      .toContain('ORDER BY fecha ASC NULLS LAST, created_at DESC');
  });

  it('orders previsto by soonest-known-date-first, undated last', () => {
    const { text } = buildListQuery({ estado: 'previsto' });
    expect(text).toContain('ORDER BY fecha ASC NULLS LAST, created_at DESC');
  });

  it('keeps the default descending order for every other filter combination', () => {
    expect(buildListQuery({}).text).toContain('ORDER BY fecha DESC, created_at DESC');
    expect(buildListQuery({ estado: 'confirmado' }).text).toContain('ORDER BY fecha DESC, created_at DESC');
    expect(buildListQuery({ estado: 'pendiente_revision' }).text).toContain('ORDER BY fecha DESC, created_at DESC');
    expect(buildListQuery({ mes: '2026-07', categoria: 'Ocio' }).text).toContain('ORDER BY fecha DESC, created_at DESC');
  });
});

describe('anioRange / mesRange', () => {
  it('builds half-open year boundaries', () => {
    expect(anioRange('2026')).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('builds half-open month boundaries, rolling December into the next year', () => {
    expect(mesRange('2026-07')).toEqual(['2026-07-01', '2026-08-01']);
    expect(mesRange('2026-12')).toEqual(['2026-12-01', '2027-01-01']);
  });
});

describe('buildTotalesQuery', () => {
  it('always filters by estado = confirmado (drafts and forecasts excluded from totals)', () => {
    for (const periodo of [{ mes: '2026-07' }, { anio: '2026' }]) {
      expect(buildTotalesQuery(periodo).text).toContain("estado = 'confirmado'");
    }
  });

  it('always filters by activo = true', () => {
    for (const periodo of [{ mes: '2026-07' }, { anio: '2026' }]) {
      expect(buildTotalesQuery(periodo).text).toContain('activo = true');
    }
  });

  it('scopes to the requested month with a half-open range', () => {
    const { text, values } = buildTotalesQuery({ mes: '2026-07' });
    expect(text).toContain('fecha >= $1::date AND fecha < $2::date');
    expect(values).toEqual(['2026-07-01', '2026-08-01']);
  });

  it('scopes to the requested year with a half-open range', () => {
    const { values } = buildTotalesQuery({ anio: '2026' });
    expect(values).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('groups by tipo and category', () => {
    const { text } = buildTotalesQuery({ anio: '2026' });
    expect(text).toContain('GROUP BY tipo, COALESCE(categoria');
  });

  it('adds a parameterized categoria filter when requested', () => {
    const { text, values } = buildTotalesQuery({ anio: '2026', categoria: 'Ocio' });
    expect(text).toContain('categoria = $3');
    expect(values).toEqual(['2026-01-01', '2027-01-01', 'Ocio']);
  });

  it('throws when no period is given', () => {
    expect(() => buildTotalesQuery({})).toThrow();
  });
});

describe('buildTotalesPorMesQuery', () => {
  it('applies the confirmado + activo rules and groups by month and tipo', () => {
    const { text, values } = buildTotalesPorMesQuery('2026');
    expect(text).toContain("estado = 'confirmado'");
    expect(text).toContain('activo = true');
    expect(text).toContain("GROUP BY to_char(fecha, 'YYYY-MM'), tipo");
    expect(values).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('adds a parameterized categoria filter when requested', () => {
    const { text, values } = buildTotalesPorMesQuery('2026', 'Ocio');
    expect(text).toContain('categoria = $3');
    expect(values).toEqual(['2026-01-01', '2027-01-01', 'Ocio']);
  });
});

describe('buildSugerenciasQuery', () => {
  it('ranks by usage count descending, then alphabetically', () => {
    const { text } = buildSugerenciasQuery('categoria');
    expect(text).toContain('ORDER BY usos DESC, categoria ASC');
  });

  it('only counts active, non-null, non-blank values', () => {
    const { text } = buildSugerenciasQuery('comercio');
    expect(text).toContain('activo = true');
    expect(text).toContain('comercio IS NOT NULL');
    expect(text).toContain("btrim(comercio) <> ''");
    expect(text).toContain('ORDER BY usos DESC, comercio ASC');
  });

  it('has no parameters without a tipo', () => {
    expect(buildSugerenciasQuery('categoria').values).toEqual([]);
  });

  it('restricts by tipo through a bound parameter', () => {
    const { text, values } = buildSugerenciasQuery('categoria', 'ganancia');
    expect(text).toContain('tipo = $1');
    expect(values).toEqual(['ganancia']);
  });

  it('refuses a column that is not in the allowlist', () => {
    expect(() => buildSugerenciasQuery('importe; DROP TABLE gasto' as never)).toThrow();
    expect(() => buildSugerenciasQuery('constructor' as never)).toThrow();
  });
});
