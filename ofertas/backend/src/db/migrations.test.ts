import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// `init.sql` solo se ejecuta sobre un volumen vacío, así que toda columna o
// tabla que se le añada después del primer despliegue TIENE que llegar además
// por una migración, o producción se queda atrás en silencio. Este test es lo
// que impide que eso vuelva a pasar: lee los dos ficheros y falla si alguno se
// desalinea, igual que `storage/backend/src/services/fileService.test.ts` lee
// los dos nginx.conf para el tope de subida.

const INFRA = join(__dirname, '..', '..', '..', 'infra');
const initSql = readFileSync(join(INFRA, 'init.sql'), 'utf-8');
// Los comentarios se quitan antes de inspeccionar nada: un `-- CREATE TRIGGER
// no admite IF NOT EXISTS` explicando por qué el código es como es no debe
// contar como si fuera ese código.
const migraciones = readdirSync(join(INFRA, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(INFRA, 'migrations', f), 'utf-8'))
  .join('\n')
  .replace(/--[^\n]*/g, '');

/** Columnas declaradas en el CREATE TABLE de `busqueda` de init.sql. */
function columnasDeBusqueda(): Array<{ nombre: string; declaracion: string }> {
  const bloque = /CREATE TABLE IF NOT EXISTS busqueda \(([\s\S]*?)\n\);/.exec(initSql);
  if (!bloque) throw new Error('No se encontró el CREATE TABLE de busqueda en init.sql');

  return bloque[1]
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea && !linea.startsWith('--'))
    .map((linea) => ({ nombre: linea.split(/\s+/)[0], declaracion: linea }));
}

describe('migraciones alineadas con init.sql', () => {
  const columnas = columnasDeBusqueda();

  it('init.sql declara las columnas que se parsean', () => {
    expect(columnas.map((c) => c.nombre)).toContain('habilitada');
    expect(columnas.length).toBeGreaterThan(10);
  });

  // Una columna anulable o con DEFAULT se puede añadir a una tabla con filas;
  // una NOT NULL sin default, no — esas son del esquema original y no pueden
  // faltar en ninguna base de datos existente. `id` queda fuera porque una
  // clave primaria no se añade a posteriori.
  const añadibles = columnas.filter(
    (c) =>
      c.nombre !== 'id' &&
      (!/NOT NULL/i.test(c.declaracion) || /DEFAULT/i.test(c.declaracion)),
  );

  it.each(añadibles.map((c) => c.nombre))(
    'la migración añade la columna "%s" de forma idempotente',
    (nombre) => {
      expect(migraciones).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${nombre}\\b`, 'i'),
      );
    },
  );

  it('la migración crea scraper_state y siembra su fila única', () => {
    expect(initSql).toMatch(/CREATE TABLE IF NOT EXISTS scraper_state/);
    expect(migraciones).toMatch(/CREATE TABLE IF NOT EXISTS scraper_state/);
    // Las rutas leen rows[0] sin comprobarlo: una tabla vacía falla igual que
    // una tabla inexistente.
    expect(migraciones).toMatch(/INSERT INTO scraper_state[\s\S]*ON CONFLICT \(id\) DO NOTHING/);
  });

  it('la migración es repetible: cada CREATE TRIGGER va precedido de su DROP', () => {
    const creados = [...migraciones.matchAll(/CREATE TRIGGER\s+(\w+)/g)].map((m) => m[1]);
    expect(creados.length).toBeGreaterThan(0);
    for (const trigger of creados) {
      expect(migraciones).toMatch(new RegExp(`DROP TRIGGER IF EXISTS\\s+${trigger}\\b`));
    }
  });

  it('la migración va en una transacción', () => {
    expect(migraciones).toMatch(/^BEGIN;/m);
    expect(migraciones).toMatch(/^COMMIT;/m);
  });
});
