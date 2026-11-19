import { describe, expect, it } from 'vitest';
import { FakeRepo } from '../testing/fakes';
import { upsertProducts } from './productService';

describe('upsertProducts', () => {
  it('creates unknown ASINs as pendiente and reports them', async () => {
    const repo = new FakeRepo();
    const res = await upsertProducts(repo, [{ asin: 'AAAAAAAAAA', titulo: 'T', descripcion: 'D' }]);
    expect(res).toEqual({ created: ['AAAAAAAAAA'], updated: [], skipped: [] });
    expect(repo.products.get('AAAAAAAAAA')).toMatchObject({
      titulo: 'T',
      descripcion: 'D',
      estado: 'pendiente',
      feedback: '',
      estrellas: null,
    });
  });

  it('never overwrites non-empty fields nor touches estado, feedback or stars', async () => {
    const repo = new FakeRepo();
    repo.seed({
      asin: 'AAAAAAAAAA',
      titulo: 'Mine',
      descripcion: 'Mine d',
      feedback: 'fb',
      estrellas: 2,
      estado: 'resena_generada',
    });
    const res = await upsertProducts(repo, [{ asin: 'AAAAAAAAAA', titulo: 'New', descripcion: 'New d' }]);
    expect(res).toEqual({ created: [], updated: [], skipped: ['AAAAAAAAAA'] });
    expect(repo.products.get('AAAAAAAAAA')).toMatchObject({
      titulo: 'Mine',
      descripcion: 'Mine d',
      feedback: 'fb',
      estrellas: 2,
      estado: 'resena_generada',
    });
  });

  it('fills only the empty fields', async () => {
    const repo = new FakeRepo();
    repo.seed({ asin: 'AAAAAAAAAA', titulo: 'Keep', descripcion: '', estado: 'en_espera' });
    const res = await upsertProducts(repo, [{ asin: 'AAAAAAAAAA', titulo: 'Other', descripcion: 'Filled' }]);
    expect(res.updated).toEqual(['AAAAAAAAAA']);
    expect(repo.products.get('AAAAAAAAAA')).toMatchObject({ titulo: 'Keep', descripcion: 'Filled', estado: 'en_espera' });
  });

  it('handles a repeated ASIN inside one request', async () => {
    const repo = new FakeRepo();
    const res = await upsertProducts(repo, [
      { asin: 'AAAAAAAAAA', titulo: 'First' },
      { asin: 'AAAAAAAAAA', titulo: 'Second' },
    ]);
    expect(res).toEqual({ created: ['AAAAAAAAAA'], updated: [], skipped: ['AAAAAAAAAA'] });
    expect(repo.products.get('AAAAAAAAAA')?.titulo).toBe('First');
  });
});
