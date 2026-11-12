import { describe, it, expect, vi } from 'vitest';
import { FakeRepo } from '../testing/fakes';
import { syncProducts } from './syncService';

const config = { botUrl: 'http://vine-bot:8092/', botToken: 'bot-token' };

describe('syncProducts', () => {
  it('inserts only ASINs that are not present and never overwrites', async () => {
    const repo = new FakeRepo();
    repo.seed({ asin: 'AAAAAAAAAA', titulo: 'Mine', feedback: 'my feedback', estado: 'listo' });
    const fetcher = vi.fn(async () => [
      { asin: 'AAAAAAAAAA', titulo: 'From bot', descripcion: 'd' },
      { asin: 'bbbbbbbbbb', titulo: 'New', descripcion: 'desc' },
    ]);

    const res = await syncProducts(repo, fetcher, config);

    expect(res).toEqual({ created: ['BBBBBBBBBB'], skipped: 1 });
    expect(repo.products.get('AAAAAAAAAA')).toMatchObject({ titulo: 'Mine', feedback: 'my feedback', estado: 'listo' });
    expect(repo.products.get('BBBBBBBBBB')).toMatchObject({ titulo: 'New', estado: 'pendiente' });
  });

  it('never resets or duplicates an en_espera product', async () => {
    const repo = new FakeRepo();
    repo.seed({ asin: 'AAAAAAAAAA', titulo: 'Parked', feedback: 'fb', estrellas: 4, estado: 'en_espera' });
    const fetcher = async () => [{ asin: 'AAAAAAAAAA', titulo: 'From bot', descripcion: 'd' }];
    expect(await syncProducts(repo, fetcher, config)).toEqual({ created: [], skipped: 1 });
    expect(repo.products.size).toBe(1);
    expect(repo.products.get('AAAAAAAAAA')).toMatchObject({ titulo: 'Parked', feedback: 'fb', estrellas: 4, estado: 'en_espera' });
  });

  it('fails with 503 "VINE_BOT_TOKEN not configured" before calling the bot when there is no token', async () => {
    const fetcher = vi.fn(async () => []);
    await expect(syncProducts(new FakeRepo(), fetcher, { botUrl: 'http://vine-bot:8092' })).rejects.toMatchObject({
      statusCode: 503,
      message: 'VINE_BOT_TOKEN not configured',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls /productos-pendientes with the bot token', async () => {
    const fetcher = vi.fn(async () => []);
    await syncProducts(new FakeRepo(), fetcher, config);
    expect(fetcher).toHaveBeenCalledWith('http://vine-bot:8092/productos-pendientes', 'bot-token');
  });

  it('is idempotent: a second run creates nothing', async () => {
    const repo = new FakeRepo();
    const fetcher = async () => [{ asin: 'CCCCCCCCCC', titulo: 't', descripcion: 'd' }];
    expect((await syncProducts(repo, fetcher, config)).created).toEqual(['CCCCCCCCCC']);
    expect(await syncProducts(repo, fetcher, config)).toEqual({ created: [], skipped: 1 });
  });

  it('skips malformed items and duplicates inside the payload', async () => {
    const repo = new FakeRepo();
    const fetcher = async () => [
      { asin: 'short', titulo: 'x' },
      { titulo: 'no asin' },
      'garbage',
      { asin: 'DDDDDDDDDD', titulo: 'ok' },
      { asin: 'DDDDDDDDDD', titulo: 'dup' },
    ];
    expect(await syncProducts(repo, fetcher, config)).toEqual({ created: ['DDDDDDDDDD'], skipped: 4 });
  });

  it('turns fetcher failures and non-array payloads into 502', async () => {
    await expect(
      syncProducts(new FakeRepo(), async () => { throw new Error('ECONNREFUSED'); }, config),
    ).rejects.toMatchObject({ statusCode: 502 });
    await expect(syncProducts(new FakeRepo(), async () => ({ items: [] }), config)).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
