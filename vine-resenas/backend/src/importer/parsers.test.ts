import { describe, it, expect } from 'vitest';
import { parseFolderName, parseProductsTxt, parseReviewsTxt } from './parsers';

const TXT = [
  'Título: Brochetas | Pinchos',
  'ASIN: B0FQBYHJ17',
  'Descripción: Juego de 30 brochetas.',
  'Feedback:',
  '',
  'Título: Reloj Cámara',
  'ASIN: B0HJ8NTC4H',
  'Descripción: Despertador con cámara.',
  'Feedback:',
  'Estrellas:',
  '',
  'Título: Calentador de Manos',
  'ASIN: B0H4P6M1DF',
  'Descripción: Calentador 6000mAh.',
  'Feedback: Funciona muy bien, calienta rápido.',
  'Estrellas: 5',
  '',
  'Título: Pinza',
  'ASIN: B0H5QBR7BH',
  'Descripción: Pinza amperimétrica.',
  'Feedback: Primera línea.',
  'Segunda línea del feedback.',
  '',
  'Tercera tras línea en blanco.',
  'Estrellas: 4 ',
  '[RESEÑA GENERADA]',
  '',
  'Título: Sin ASIN',
  'ASIN:',
  'Descripción: x',
  'Feedback: y',
  'Estrellas:',
].join('\n');

describe('parseProductsTxt', () => {
  const blocks = parseProductsTxt(TXT);

  it('finds every block', () => {
    expect(blocks.map((b) => b.asin)).toEqual(['B0FQBYHJ17', 'B0HJ8NTC4H', 'B0H4P6M1DF', 'B0H5QBR7BH', '']);
  });
  it('handles a block lacking the Estrellas line and empty feedback', () => {
    expect(blocks[0]).toMatchObject({ feedback: '', estrellas: null, resenaGenerada: false });
    expect(blocks[1]).toMatchObject({ feedback: '', estrellas: null });
  });
  it('reads single-line feedback and stars', () => {
    expect(blocks[2]).toMatchObject({ feedback: 'Funciona muy bien, calienta rápido.', estrellas: 5 });
  });
  it('keeps multi-line feedback (with an inner blank line), trims the stars and flags the marker', () => {
    expect(blocks[3].feedback).toBe('Primera línea.\nSegunda línea del feedback.\n\nTercera tras línea en blanco.');
    expect(blocks[3]).toMatchObject({ estrellas: 4, resenaGenerada: true });
  });
  it('keeps blocks without ASIN so the importer can warn', () => {
    expect(blocks[4]).toMatchObject({ asin: '', titulo: 'Sin ASIN' });
  });
  it('tolerates CRLF, BOM, lowercase ASIN and out-of-range stars', () => {
    const r = parseProductsTxt('﻿Título: T\r\nASIN: b0fqbyhj17\r\nFeedback: ok\r\nEstrellas: 9\r\n');
    expect(r).toEqual([
      { titulo: 'T', asin: 'B0FQBYHJ17', descripcion: '', feedback: 'ok', estrellas: null, resenaGenerada: false },
    ]);
  });
  it('returns nothing for an empty file', () => {
    expect(parseProductsTxt('')).toEqual([]);
  });
});

describe('parseReviewsTxt', () => {
  const REV = [
    'Producto: Rotuladores 36',
    'ASIN: B0GSGCQTM8',
    'Reseña resumida: Colores vivos',
    'Reseña extendida: Los cogí para pintar.',
    '',
    'Segundo párrafo.',
    '---',
    'Producto: Sin ASIN',
    'Reseña resumida: nada',
    '---',
    'Producto: Regleta',
    'ASIN: B0HJCK3W9S',
    'Reseña resumida: Compacta',
    'Reseña extendida: Pequeña.',
  ].join('\r\n');

  it('splits on --- and keeps multi-line extended reviews', () => {
    const r = parseReviewsTxt(REV);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      asin: 'B0GSGCQTM8',
      resena_resumida: 'Colores vivos',
      resena_extendida: 'Los cogí para pintar.\n\nSegundo párrafo.',
    });
    expect(r[1].asin).toBe('B0HJCK3W9S');
  });
  it('returns nothing for an empty file', () => {
    expect(parseReviewsTxt('')).toEqual([]);
  });
});

describe('parseFolderName', () => {
  it('parses a plain folder', () => {
    expect(parseFolderName('B0FQBYHJ17 - Brochetas Barbacoa Acero')).toEqual({
      asin: 'B0FQBYHJ17',
      name: 'Brochetas Barbacoa Acero',
      publicado: false,
    });
  });
  it('detects the PUBLICADO suffix and strips it', () => {
    expect(parseFolderName('B09HV4KF53 - The Buttery Crema Cacahuete - PUBLICADO')).toEqual({
      asin: 'B09HV4KF53',
      name: 'The Buttery Crema Cacahuete',
      publicado: true,
    });
  });
  it('rejects folders that are not "<ASIN> - <name>"', () => {
    expect(parseFolderName('notes')).toBeNull();
    expect(parseFolderName('B0FQBYHJ1 - short')).toBeNull();
  });
});
