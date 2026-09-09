import { describe, it, expect } from 'vitest';
import { formatearNovedad, escaparHtml } from './notificador';
import type { NovedadAnuncio } from '../services/rastreo';
import type { Anuncio } from '../types/pisos';

function anuncio(overrides: Partial<Anuncio> = {}): Anuncio {
  return {
    id: 'a-1',
    busqueda_id: 'b-1',
    tipo: 'vivienda',
    portal: 'fotocasa',
    portal_id: '123',
    url: 'https://www.fotocasa.es/piso/123',
    titulo: 'Piso reformado en el centro',
    precio: 120000,
    precio_inicial: 120000,
    precio_previo: null,
    precio_notificado: 120000,
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
    imagen_url: null,
    visto: false,
    descartado: false,
    notificado_at: null,
    visto_ultima_vez_at: '2026-08-30T10:00:00Z',
    created_at: '2026-08-30T10:00:00Z',
    updated_at: '2026-08-30T10:00:00Z',
    ...overrides,
  };
}

describe('escaparHtml', () => {
  it('escapa solo los tres caracteres que rompen parse_mode HTML', () => {
    // Va con HTML y no con MarkdownV2 justamente porque los títulos reales
    // están llenos de guiones bajos, asteriscos y paréntesis que allí habría
    // que escapar uno a uno.
    expect(escaparHtml('Piso <bonito> & barato')).toBe('Piso &lt;bonito&gt; &amp; barato');
    expect(escaparHtml('Piso_reformado *ideal* (2ª)')).toBe('Piso_reformado *ideal* (2ª)');
  });
});

describe('formatearNovedad', () => {
  it('incluye lo necesario para decidir sin abrir el enlace', () => {
    const novedad: NovedadAnuncio = { anuncio: anuncio(), tipo: 'nuevo' };
    const mensaje = formatearNovedad(novedad, 'Badajoz hasta 150k');

    expect(mensaje).toContain('Piso nuevo');
    expect(mensaje).toContain('Badajoz hasta 150k');
    expect(mensaje).toContain('120.000 €');
    expect(mensaje).toContain('90 m²');
    expect(mensaje).toContain('3 hab');
    expect(mensaje).toContain('https://www.fotocasa.es/piso/123');
  });

  it('calcula el €/m², que es lo que distingue un chollo de un piso normal', () => {
    const mensaje = formatearNovedad({ anuncio: anuncio(), tipo: 'nuevo' }, 'B');
    // Sin separador de millares: en español un número de cuatro cifras se
    // escribe 1333, no 1.333 (es lo que hace toLocaleString con es-ES).
    expect(mensaje).toContain('1333 €/m²');
  });

  it('una bajada tacha el precio del ULTIMO AVISO, no el anterior al ultimo cambio', () => {
    // Los dos campos difieren cuando un aviso se perdio por el camino: aqui
    // el propietario vio 130.000 € en su ultimo mensaje, aunque entremedias
    // el anuncio pasara por 125.000 €. Tacharle un precio que nunca vio seria
    // desconcertante.
    const novedad: NovedadAnuncio = {
      anuncio: anuncio({ precio: 110000, precio_previo: 125000, precio_notificado: 130000 }),
      tipo: 'bajada',
    };
    const mensaje = formatearNovedad(novedad, 'Badajoz');
    expect(mensaje).toContain('Bajada de precio');
    expect(mensaje).toContain('110.000 €');
    expect(mensaje).toContain('<s>130.000 €</s>');
    expect(mensaje).not.toContain('125.000');
  });

  it('usa 🏪 «Local nuevo» para un local y 🏠 «Piso nuevo» para una vivienda', () => {
    const local = formatearNovedad(
      { anuncio: anuncio({ tipo: 'local', titulo: 'Local en esquina' }), tipo: 'nuevo' },
      'Locales Badajoz',
    );
    expect(local).toContain('🏪');
    expect(local).toContain('Local nuevo');
    expect(local).not.toContain('Piso nuevo');

    const vivienda = formatearNovedad({ anuncio: anuncio({ tipo: 'vivienda' }), tipo: 'nuevo' }, 'B');
    expect(vivienda).toContain('🏠');
    expect(vivienda).toContain('Piso nuevo');
  });

  it('no imprime "null" cuando falta un dato', () => {
    const sinDatos = anuncio({ precio: null, metros: null, habitaciones: null, banos: null, planta: null, ubicacion: null });
    const mensaje = formatearNovedad({ anuncio: sinDatos, tipo: 'nuevo' }, 'B');
    expect(mensaje).not.toContain('null');
    expect(mensaje).toContain('—');
  });

  it('escapa el título del anuncio, que lo escribe un tercero', () => {
    const mensaje = formatearNovedad(
      { anuncio: anuncio({ titulo: 'Piso <b>GANGA</b> & reformado' }), tipo: 'nuevo' },
      'B',
    );
    expect(mensaje).toContain('Piso &lt;b&gt;GANGA&lt;/b&gt; &amp; reformado');
  });

  it('escapa también el nombre de la búsqueda', () => {
    const mensaje = formatearNovedad({ anuncio: anuncio(), tipo: 'nuevo' }, 'Pisos <100k>');
    expect(mensaje).toContain('Pisos &lt;100k&gt;');
  });
});
