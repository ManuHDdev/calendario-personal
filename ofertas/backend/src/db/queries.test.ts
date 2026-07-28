import { describe, it, expect } from 'vitest';
import { buildListBusquedasQuery, buildActiveBusquedasQuery } from './queries';

// El repo no tiene infraestructura de tests de integración contra Postgres
// real en ningún subapp (ver deuda técnica en CLAUDE.md). Estos tests
// verifican, a nivel de SQL generado, que la regla de negocio dura (soft
// delete) está SIEMPRE presente en ambas queries.
describe('buildListBusquedasQuery', () => {
  it('always filters by activo = true (soft delete exclusion)', () => {
    const { text } = buildListBusquedasQuery();
    expect(text).toContain('activo = true');
    expect(text).toContain('FROM busqueda');
  });
});

describe('buildActiveBusquedasQuery', () => {
  it('always filters by activo = true (soft delete exclusion)', () => {
    const { text } = buildActiveBusquedasQuery();
    expect(text).toContain('activo = true');
    expect(text).toContain('FROM busqueda');
  });

  it('takes no parameters — it is not filterable by the caller', () => {
    const { values } = buildActiveBusquedasQuery();
    expect(values).toEqual([]);
  });

  it('also filters by habilitada = true — a paused search must not reach the scraper', () => {
    const { text } = buildActiveBusquedasQuery();
    expect(text).toContain('habilitada = true');
  });
});
