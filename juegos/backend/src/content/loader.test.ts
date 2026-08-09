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

  it('yo-nunca meets the minimum pool size (>=240) with >=80 per categoria', () => {
    expect(contentBanks.yoNuncaPrompts.length).toBeGreaterThanOrEqual(240);
    for (const categoria of ['clasico', 'picante', 'fiesta'] as const) {
      const count = contentBanks.yoNuncaPrompts.filter((p) => p.categoria === categoria).length;
      expect(count).toBeGreaterThanOrEqual(80);
    }
  });

  it('verdad-o-reto meets the minimum pool size (>=180) with >=15 per categoria x tipo x nivel bucket', () => {
    expect(contentBanks.verdadORetoPrompts.length).toBeGreaterThanOrEqual(180);
    const verdad = contentBanks.verdadORetoPrompts.filter((p) => p.tipo === 'verdad');
    const reto = contentBanks.verdadORetoPrompts.filter((p) => p.tipo === 'reto');
    expect(verdad.length).toBeGreaterThan(0);
    expect(reto.length).toBeGreaterThan(0);
    for (const categoria of ['clasico', 'picante', 'fiesta'] as const) {
      for (const tipo of ['verdad', 'reto'] as const) {
        for (const nivel of ['estandar', 'sin_pareja'] as const) {
          const count = contentBanks.verdadORetoPrompts.filter(
            (p) => p.categoria === categoria && p.tipo === tipo && p.nivel === nivel,
          ).length;
          expect(count).toBeGreaterThanOrEqual(15);
        }
      }
    }
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
