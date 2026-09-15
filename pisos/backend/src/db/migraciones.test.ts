import { describe, it, expect } from 'vitest';
import { MIGRACIONES } from './migraciones';

/**
 * Las migraciones corren en CADA arranque: tienen que ser idempotentes y no
 * destructivas. Aquí se comprueba sobre el texto SQL, no ejecutándolas.
 */
describe('migraciones — columna tipo', () => {
  const porNombre = (n: string) => MIGRACIONES.find((m) => m.nombre === n)?.sql ?? '';

  it('añade busqueda.tipo y anuncio.tipo con IF NOT EXISTS y default vivienda', () => {
    for (const nombre of ['busqueda.tipo', 'anuncio.tipo']) {
      const sql = porNombre(nombre);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'vivienda'/);
    }
  });

  it('crea el CHECK tras una guarda sobre pg_constraint (PG15 no admite ADD CONSTRAINT IF NOT EXISTS)', () => {
    for (const [nombre, conname] of [
      ['busqueda.tipo — CHECK', 'busqueda_tipo_valido'],
      ['anuncio.tipo — CHECK', 'anuncio_tipo_valido'],
    ]) {
      const sql = porNombre(nombre);
      expect(sql).toContain(`FROM pg_constraint WHERE conname = '${conname}'`);
      expect(sql).toContain("CHECK (tipo IN ('vivienda', 'local'))");
    }
  });

  it('no rellena datos con un UPDATE: el DEFAULT ya deja toda fila previa en vivienda', () => {
    for (const nombre of ['busqueda.tipo', 'anuncio.tipo']) {
      expect(porNombre(nombre)).not.toMatch(/UPDATE/i);
    }
  });
});
