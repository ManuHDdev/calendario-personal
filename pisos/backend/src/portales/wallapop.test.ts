import { describe, it, expect } from 'vitest';
import { parsearItem, wallapopProvider } from './wallapop';
import type { CriteriosPortal } from './types';

/**
 * La forma del ítem replica la que documenta y consume
 * `ruta/backend/src/services/wallapop.ts`, verificada contra respuestas
 * reales. Lo que se prueba aquí no es que Wallapop siga sirviendo esto (eso
 * solo lo puede decir `npm run smoke`), sino que dada esa forma se extrae lo
 * correcto — en particular que los metros y las habitaciones salgan del
 * texto libre, que es lo único que hay en un anuncio de particular.
 */
const ITEM_BASE = {
  id: 'abc123',
  title: 'Piso en venta 90 m2, 3 habitaciones y 2 baños, con ascensor',
  description: 'Tercera planta exterior. Sin garaje. Muy luminoso.',
  web_slug: 'piso-en-venta-badajoz-123',
  price: { amount: 125000, currency: 'EUR' },
  location: { latitude: 38.8794, longitude: -6.9707, city: 'Badajoz', region2: 'Badajoz' },
  images: [{ urls: { small: 'https://cdn.test/s.jpg', medium: 'https://cdn.test/m.jpg' } }],
};

describe('parsearItem', () => {
  it('saca del texto libre lo que Wallapop no da estructurado', () => {
    const anuncio = parsearItem(ITEM_BASE);
    expect(anuncio).not.toBeNull();
    expect(anuncio?.metros).toBe(90);
    expect(anuncio?.habitaciones).toBe(3);
    expect(anuncio?.banos).toBe(2);
    expect(anuncio?.planta).toBe('3ª');
    expect(anuncio?.ascensor).toBe(true);
    // "Sin garaje" en la descripción es un `false` explícito, no un null.
    expect(anuncio?.garaje).toBe(false);
  });

  it('toma precio, coordenadas y ubicación de los campos estructurados', () => {
    const anuncio = parsearItem(ITEM_BASE);
    expect(anuncio?.precio).toBe(125000);
    expect(anuncio?.latitud).toBe(38.8794);
    expect(anuncio?.ubicacion).toBe('Badajoz, Badajoz');
  });

  it('construye la URL pública a partir del slug', () => {
    expect(parsearItem(ITEM_BASE)?.url).toBe('https://es.wallapop.com/item/piso-en-venta-badajoz-123');
  });

  it('prefiere la imagen mediana y cae a la pequeña', () => {
    expect(parsearItem(ITEM_BASE)?.imagenUrl).toBe('https://cdn.test/m.jpg');
    const soloPequena = { ...ITEM_BASE, images: [{ urls: { small: 'https://cdn.test/s.jpg' } }] };
    expect(parsearItem(soloPequena)?.imagenUrl).toBe('https://cdn.test/s.jpg');
  });

  it('descarta el ítem sin id o sin slug en vez de inventarse una URL', () => {
    expect(parsearItem({ ...ITEM_BASE, web_slug: undefined })).toBeNull();
    expect(parsearItem({ ...ITEM_BASE, id: undefined })).toBeNull();
  });

  it('deja a null lo que no se puede afirmar, sin romperse', () => {
    const minimo = { id: '1', web_slug: 'x', title: 'Piso', price: null, location: null, images: null };
    const anuncio = parsearItem(minimo);
    expect(anuncio?.precio).toBeNull();
    expect(anuncio?.metros).toBeNull();
    expect(anuncio?.latitud).toBeNull();
    expect(anuncio?.imagenUrl).toBeNull();
  });
});

describe('wallapopProvider.puedeBuscar', () => {
  const base: CriteriosPortal = {
    tipo: 'vivienda',
    ubicacion: 'Badajoz',
    latitud: null,
    longitud: null,
    radioKm: null,
    precioMin: null,
    precioMax: null,
    metrosMin: null,
    metrosMax: null,
    habitacionesMin: null,
    banosMin: null,
  };

  it('se niega a buscar sin coordenadas en lugar de barrer toda España', () => {
    const veredicto = wallapopProvider.puedeBuscar(base);
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.motivo).toMatch(/coordenadas/);
  });

  it('acepta cuando están las tres: centro y radio', () => {
    expect(wallapopProvider.puedeBuscar({ ...base, latitud: 38.8, longitud: -6.9, radioKm: 30 }).ok).toBe(true);
  });

  it('se niega para tipo local antes incluso de mirar coordenadas', () => {
    const veredicto = wallapopProvider.puedeBuscar({
      ...base,
      tipo: 'local',
      latitud: 38.8,
      longitud: -6.9,
      radioKm: 30,
    });
    expect(veredicto.ok).toBe(false);
    if (!veredicto.ok) expect(veredicto.motivo).toMatch(/no distingue local/i);
  });
});
