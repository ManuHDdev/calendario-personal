import { describe, it, expect } from 'vitest';
import { decidirNovedad, type DatosNovedad } from './novedades';

function anuncio(overrides: Partial<DatosNovedad> = {}): DatosNovedad {
  return { precio: 120000, precio_notificado: 120000, ...overrides };
}

describe('decidirNovedad', () => {
  it('avisa de un anuncio recién insertado', () => {
    expect(decidirNovedad(anuncio(), true)).toBe('nuevo');
  });

  it('no avisa de un anuncio que sigue igual', () => {
    expect(decidirNovedad(anuncio(), false)).toBeNull();
  });

  it('avisa cuando el precio baja respecto al último aviso', () => {
    expect(decidirNovedad(anuncio({ precio: 110000, precio_notificado: 130000 }), false)).toBe('bajada');
  });

  it('NO repite el aviso una vez entregado: es la regresión del bucle de notificaciones', () => {
    // El bug: se comparaba contra `precio_previo`, que es pegajoso — solo
    // cambia cuando cambia el precio. Tras bajar de 130k a 120k se quedaba
    // clavado en 130k, la condición "120k < 130k" seguía siendo cierta en
    // cada vuelta, y el mismo anuncio se reenviaba cada 15 minutos para
    // siempre, tapando los avisos que sí importaban.
    //
    // Al comparar contra `precio_notificado` — que avanza al entregar el
    // aviso — la segunda vuelta ya no tiene nada que contar.
    const trasAvisar = anuncio({ precio: 120000, precio_notificado: 120000 });
    expect(decidirNovedad(trasAvisar, false)).toBeNull();
    expect(decidirNovedad(trasAvisar, false)).toBeNull();
    expect(decidirNovedad(trasAvisar, false)).toBeNull();
  });

  it('vuelve a avisar solo si baja OTRA vez por debajo de lo ya avisado', () => {
    expect(decidirNovedad(anuncio({ precio: 115000, precio_notificado: 120000 }), false)).toBe('bajada');
  });

  it('no avisa si el precio sube', () => {
    expect(decidirNovedad(anuncio({ precio: 140000, precio_notificado: 120000 }), false)).toBeNull();
  });

  it('tras una subida, no avisa al volver a un precio que no mejora el ya avisado', () => {
    // Avisado a 120k, sube a 140k y baja a 130k: 130k no es mejor que lo
    // último que se dijo, asi que no hay nada nuevo que contar. Subir la
    // referencia con las subidas haria que el camino de vuelta disparase un
    // aviso por un precio que el propietario ya conocia.
    expect(decidirNovedad(anuncio({ precio: 130000, precio_notificado: 120000 }), false)).toBeNull();
  });

  it('calla cuando falta el precio o la referencia', () => {
    expect(decidirNovedad(anuncio({ precio: null }), false)).toBeNull();
    expect(decidirNovedad(anuncio({ precio_notificado: null }), false)).toBeNull();
  });

  it('un anuncio nunca avisado no se desentierra como bajada', () => {
    // Caso real: el primer rastreo manual de una búsqueda nueva guarda
    // decenas de anuncios antiguos sin avisar. No deben aparecer despues
    // como "bajada" solo porque nunca tuvieron un aviso previo.
    expect(decidirNovedad({ precio: 90000, precio_notificado: null }, false)).toBeNull();
  });
});
