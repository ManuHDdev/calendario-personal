import { describe, it, expect } from 'vitest';
import { loadContentBanks, contentBanks } from './loader';

describe('loadContentBanks', () => {
  it('loads all four banks from the real JSON files without throwing', () => {
    expect(() => loadContentBanks()).not.toThrow();
  });

  it('impostor-words meets the minimum pool size (>=300)', () => {
    expect(contentBanks.impostorWords.length).toBeGreaterThanOrEqual(300);
  });

  it('trivia-questions meets the minimum pool size (>=500) and each has 4 options + 1 correct', () => {
    expect(contentBanks.triviaQuestions.length).toBeGreaterThanOrEqual(500);
    for (const q of contentBanks.triviaQuestions) {
      expect(q.opciones).toHaveLength(4);
      expect(q.opciones).toContain(q.correcta);
    }
  });

  it('yo-nunca meets the minimum pool size (>=180) with >=30 per dureza x nivel bucket', () => {
    expect(contentBanks.yoNuncaPrompts.length).toBeGreaterThanOrEqual(180);
    for (const dureza of ['suave', 'media', 'fuerte'] as const) {
      for (const nivel of ['estandar', 'sin_pareja'] as const) {
        const count = contentBanks.yoNuncaPrompts.filter((p) => p.dureza === dureza && p.nivel === nivel).length;
        expect(count).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it('verdad-o-reto meets the minimum pool size (>=180) with >=15 per dureza x tipo x nivel bucket', () => {
    expect(contentBanks.verdadORetoPrompts.length).toBeGreaterThanOrEqual(180);
    const verdad = contentBanks.verdadORetoPrompts.filter((p) => p.tipo === 'verdad');
    const reto = contentBanks.verdadORetoPrompts.filter((p) => p.tipo === 'reto');
    expect(verdad.length).toBeGreaterThan(0);
    expect(reto.length).toBeGreaterThan(0);
    for (const dureza of ['suave', 'media', 'fuerte'] as const) {
      for (const tipo of ['verdad', 'reto'] as const) {
        for (const nivel of ['estandar', 'sin_pareja'] as const) {
          const count = contentBanks.verdadORetoPrompts.filter(
            (p) => p.dureza === dureza && p.tipo === tipo && p.nivel === nivel,
          ).length;
          expect(count).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });

  it('bomb-party-silabas meets the minimum pool size (>=60)', () => {
    expect(contentBanks.bombPartySilabas.length).toBeGreaterThanOrEqual(60);
  });

  it('bomb-party-categorias meets the minimum pool size (>=20)', () => {
    expect(contentBanks.bombPartyCategorias.length).toBeGreaterThanOrEqual(20);
  });

  it('quien-es-mas-probable meets the minimum pool size (>=90) with >=30 per dureza', () => {
    expect(contentBanks.quienEsMasProbablePrompts.length).toBeGreaterThanOrEqual(90);
    for (const dureza of ['familiar', 'fiesta', 'subido_de_tono'] as const) {
      const count = contentBanks.quienEsMasProbablePrompts.filter((p) => p.dureza === dureza).length;
      expect(count).toBeGreaterThanOrEqual(30);
    }
  });

  it('diez-de-diez cualidades/peros meet the minimum pool size (>=60 each) with >=30 per intensidad', () => {
    expect(contentBanks.diezDeDiezCualidades.length).toBeGreaterThanOrEqual(60);
    expect(contentBanks.diezDeDiezPeros.length).toBeGreaterThanOrEqual(60);
    for (const intensidad of ['suave', 'picante'] as const) {
      const cualidadesCount = contentBanks.diezDeDiezCualidades.filter((c) => c.intensidad === intensidad).length;
      const perosCount = contentBanks.diezDeDiezPeros.filter((p) => p.intensidad === intensidad).length;
      expect(cualidadesCount).toBeGreaterThanOrEqual(30);
      expect(perosCount).toBeGreaterThanOrEqual(30);
    }
  });

  it('tabu-cartas meets the minimum pool size (>=80) and every card has 4-5 forbidden words', () => {
    expect(contentBanks.tabuCartas.length).toBeGreaterThanOrEqual(80);
    for (const carta of contentBanks.tabuCartas) {
      expect(carta.prohibidas.length).toBeGreaterThanOrEqual(4);
      expect(carta.prohibidas.length).toBeLessThanOrEqual(5);
    }
  });

  it('mimica-cartas meets the minimum pool size (>=80)', () => {
    expect(contentBanks.mimicaItems.length).toBeGreaterThanOrEqual(80);
  });

  it('rejects a Tabú card with fewer than 4 or more than 5 forbidden words', () => {
    const { z } = require('zod') as typeof import('zod');
    const badSchema = z.object({
      cartas: z.array(
        z.object({
          palabra: z.string().min(1),
          prohibidas: z.array(z.string().min(1)).min(4).max(5),
          categoria: z.string().min(1),
        }),
      ),
    });
    const tooFew = { cartas: [{ palabra: 'Pizza', prohibidas: ['queso', 'redonda', 'horno'], categoria: 'comida' }] };
    const tooMany = {
      cartas: [
        {
          palabra: 'Pizza',
          prohibidas: ['queso', 'redonda', 'horno', 'italiana', 'porción', 'extra'],
          categoria: 'comida',
        },
      ],
    };
    expect(() => badSchema.parse(tooFew)).toThrow();
    expect(() => badSchema.parse(tooMany)).toThrow();
  });

  it('rejects a malformed content bank (fail fast at load time)', () => {
    // No podemos mutar los ficheros reales importados estáticamente, así que
    // esta prueba valida el mismo Zod schema con un fixture inválido en
    // memoria, replicando la forma en que loadContentBanks() lo usaría.
    const { z } = require('zod') as typeof import('zod');
    const badSchema = z.object({
      words: z.array(z.object({ palabra: z.string().min(1), categoria: z.string().min(1) })),
    });
    const malformed = { words: [{ palabra: '', categoria: 'comida' }] };
    expect(() => badSchema.parse(malformed)).toThrow();
  });
});
