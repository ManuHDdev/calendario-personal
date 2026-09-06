import { describe, it, expect } from 'vitest';
import {
  listAnuncios,
  updateBusqueda,
  updateAnuncio,
  deleteBusqueda,
  deleteAnuncio,
  upsertAnuncio,
  marcarTodosVistos,
  marcarNotificado,
} from './queries';
import type { AnuncioCrudo } from '../types/pisos';

describe('updateBusqueda', () => {
  it('solo genera SQL para los campos enviados', () => {
    const { text, values } = updateBusqueda('id-1', { nombre: 'Nuevo', precio_max: 150000 });
    expect(text).toContain('nombre = $1');
    expect(text).toContain('precio_max = $2');
    expect(text).not.toContain('ubicacion =');
    expect(values).toEqual(['Nuevo', 150000, 'id-1']);
  });

  it('serializa `portales` a JSON para la columna JSONB', () => {
    const portales = { fotocasa: { enabled: true }, pisos: { enabled: false }, wallapop: { enabled: true } };
    const { values } = updateBusqueda('id-1', { portales });
    expect(values[0]).toBe(JSON.stringify(portales));
  });

  it('ignora una clave que no esté en la allowlist de columnas', () => {
    // La allowlist es la defensa real contra inyección por nombre de
    // columna: ni siquiera una clave que se colase por la validación puede
    // acabar en el texto SQL.
    const malicioso = { nombre: 'ok', 'activo = true; DROP TABLE anuncio; --': 1 } as never;
    const { text } = updateBusqueda('id-1', malicioso);
    expect(text).not.toContain('DROP');
    expect(text).toContain('nombre = $1');
  });

  it('falla en vez de generar SQL inválido si no hay nada que actualizar', () => {
    expect(() => updateBusqueda('id-1', {})).toThrow(/al menos un campo/);
  });
});

describe('updateAnuncio', () => {
  it('solo permite tocar visto y descartado', () => {
    const conPrecio = { visto: true, precio: 1 } as never;
    const { text, values } = updateAnuncio('id-1', conPrecio);
    expect(text).toContain('visto = $1');
    expect(text).not.toContain('precio =');
    expect(values).toEqual([true, 'id-1']);
  });
});

describe('borrados', () => {
  it('son lógicos, nunca un DELETE físico (regla global del monorepo)', () => {
    for (const { text } of [deleteBusqueda('id-1'), deleteAnuncio('id-1')]) {
      expect(text).toContain('activo = false');
      expect(text).toContain('deleted_at = NOW()');
      expect(text).not.toMatch(/DELETE\s+FROM/i);
    }
  });
});

describe('listAnuncios', () => {
  it('filtra siempre por activo y excluye descartados por defecto', () => {
    const { text } = listAnuncios({});
    expect(text).toContain('a.activo = true');
    expect(text).toContain('a.descartado = false');
  });

  it('oculta los anuncios de una búsqueda borrada', () => {
    // El borrado lógico de una búsqueda no toca sus filas de anuncio, así que
    // sin este filtro seguirían apareciendo en el feed después de borrarla.
    expect(listAnuncios({}).text).toContain('b.activo = true');
  });

  it('incluye descartados solo si se pide expresamente', () => {
    expect(listAnuncios({ incluirDescartados: true }).text).not.toContain('a.descartado = false');
  });

  it('acota el límite para que un cliente no pueda pedir la tabla entera', () => {
    expect(listAnuncios({ limite: 99999 }).values.at(-1)).toBe(500);
    expect(listAnuncios({ limite: 0 }).values.at(-1)).toBe(1);
  });

  it('parametriza el id de búsqueda en lugar de interpolarlo', () => {
    const { text, values } = listAnuncios({ busquedaId: 'abc' });
    expect(text).toContain('a.busqueda_id = $1');
    expect(values).toContain('abc');
  });
});

describe('marcarTodosVistos', () => {
  it('acota a una búsqueda si se pasa, y si no marca todas', () => {
    expect(marcarTodosVistos('id-1').text).toContain('busqueda_id = $1');
    expect(marcarTodosVistos(null).text).not.toContain('busqueda_id =');
  });
});

describe('upsertAnuncio', () => {
  const crudo: AnuncioCrudo = {
    portal: 'fotocasa',
    portalId: '123',
    url: 'https://example.test/123',
    titulo: 'Piso',
    precio: 120000,
    metros: 90,
    habitaciones: 3,
    banos: 2,
    planta: '2ª',
    ascensor: true,
    garaje: null,
    terraza: null,
    ubicacion: 'Badajoz',
    latitud: null,
    longitud: null,
    imagenUrl: null,
  };

  it('no resucita el estado de visto/descartado al refrescar', () => {
    // Volver a ver un anuncio ya descartado no debe devolverlo al feed.
    const { text } = upsertAnuncio('b-1', crudo);
    expect(text).toContain('ON CONFLICT (busqueda_id, portal, portal_id) DO UPDATE');
    expect(text).not.toMatch(/SET[\s\S]*\bvisto = /);
    expect(text).not.toMatch(/SET[\s\S]*\bdescartado = /);
  });

  it('conserva el dato que ya tenía si el portal deja de informarlo', () => {
    // COALESCE evita que un listado más pobre borre los metros que ya
    // conocíamos de una pasada anterior.
    expect(upsertAnuncio('b-1', crudo).text).toContain('COALESCE(EXCLUDED.metros, anuncio.metros)');
  });

  it('guarda el precio anterior solo cuando el precio cambia', () => {
    const { text } = upsertAnuncio('b-1', crudo);
    expect(text).toContain('EXCLUDED.precio IS DISTINCT FROM anuncio.precio');
    expect(text).toContain('THEN anuncio.precio');
  });

  it('devuelve si la fila era nueva, que es lo que dispara el aviso', () => {
    expect(upsertAnuncio('b-1', crudo).text).toContain('(xmax = 0) AS es_nuevo');
  });

  it('fija precio_notificado al insertar, para tener referencia de bajadas', () => {
    // Sin referencia inicial, una bajada posterior no se detectaria nunca.
    const { text, values } = upsertAnuncio('b-1', crudo);
    const sql = text.replace(/\s+/g, ' ');
    expect(sql).toContain('precio, precio_inicial, precio_notificado');
    // El mismo parametro alimenta los tres: al insertar, precio, precio
    // inicial y referencia de aviso valen lo mismo.
    expect(sql).toContain('$5,$6,$6,$6,');
    expect(values[5]).toBe(120000);
  });

  it('parametriza la busqueda en el alta', () => {
    expect(upsertAnuncio('b-1', crudo).values[0]).toBe('b-1');
  });

  it('NO toca precio_notificado al refrescar: solo avanza al avisar', () => {
    // Si el refresco lo moviera, la referencia seguiria al precio actual y
    // ninguna bajada llegaria a contarse jamas.
    expect(upsertAnuncio('b-1', crudo).text).not.toMatch(/SET[\s\S]*precio_notificado = /);
  });
});

describe('marcarNotificado', () => {
  it('avanza la referencia de precio en el mismo UPDATE que la marca', () => {
    // Es lo que corta el bucle: sin mover precio_notificado, la misma bajada
    // se reenviaba en cada vuelta del rastreador.
    const { text, values } = marcarNotificado('a-1');
    expect(text).toContain('notificado_at = NOW()');
    expect(text).toContain('precio_notificado = precio');
    expect(values).toEqual(['a-1']);
  });
});
