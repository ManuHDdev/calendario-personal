import { createHash } from 'crypto';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeRepo, FakeStore } from '../testing/fakes';
import { runImport } from './runImport';

let tmp: string;
beforeEach(async () => {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'vine-import-'));
});
afterEach(async () => {
  await fsp.rm(tmp, { recursive: true, force: true });
});

async function write(rel: string, content: string | Buffer) {
  const full = path.join(tmp, rel);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, content);
  return full;
}

const TXT = [
  'Título: Brochetas',
  'ASIN: B0FQBYHJ17',
  'Descripción: d1',
  'Feedback: Muy buenas',
  'Estrellas: 5',
  '[RESEÑA GENERADA]',
  '',
  'Título: Sin asin',
  'ASIN:',
  'Descripción: x',
  'Feedback:',
  '',
  'Título: Taza',
  'ASIN: B0H4P6M1DF',
  'Descripción: d2',
  'Feedback:',
  'Estrellas:',
].join('\n');

describe('runImport', () => {
  it('imports products, skips ASIN-less blocks with a warning and is idempotent', async () => {
    const txt = await write('p.txt', TXT);
    const repo = new FakeRepo();
    const deps = { repo, store: new FakeStore() };

    const first = await runImport({ txt }, deps);
    expect(first).toMatchObject({ productsCreated: 2, productsSkipped: 1 });
    expect(first.warnings[0]).toMatch(/without a valid ASIN/);
    expect(repo.products.get('B0FQBYHJ17')).toMatchObject({ estado: 'resena_generada', estrellas: 5 });
    expect(repo.products.get('B0H4P6M1DF')).toMatchObject({ estado: 'pendiente', feedback: '' });

    const second = await runImport({ txt }, deps);
    expect(second).toMatchObject({ productsCreated: 0, productsUpdated: 0 });
  });

  it('never overwrites non-empty DB content but fills empty fields', async () => {
    const txt = await write('p.txt', TXT);
    const repo = new FakeRepo();
    repo.seed({ asin: 'B0FQBYHJ17', titulo: '', feedback: 'my edited feedback', estrellas: null, estado: 'listo' });

    await runImport({ txt }, { repo, store: new FakeStore() });

    expect(repo.products.get('B0FQBYHJ17')).toMatchObject({
      titulo: 'Brochetas',
      feedback: 'my edited feedback',
      estrellas: 5,
      estado: 'resena_generada',
    });
  });

  it('does not downgrade a published product', async () => {
    const txt = await write('p.txt', TXT);
    const repo = new FakeRepo();
    repo.seed({ asin: 'B0FQBYHJ17', estado: 'publicado' });
    await runImport({ txt }, { repo, store: new FakeStore() });
    expect(repo.products.get('B0FQBYHJ17')!.estado).toBe('publicado');
  });

  it('applies generated reviews only to products without one', async () => {
    const txt = await write('p.txt', TXT);
    const rev = await write(
      'r.txt',
      'Producto: x\nASIN: B0H4P6M1DF\nReseña resumida: corta\nReseña extendida: larga\n---\nProducto: y\nASIN: ZZZZZZZZZZ\nReseña resumida: a\nReseña extendida: b',
    );
    const repo = new FakeRepo();
    const deps = { repo, store: new FakeStore() };
    await runImport({ txt }, deps);
    const res = await runImport({ reviews: rev }, deps);
    expect(res.reviewsApplied).toBe(1);
    expect(res.warnings.join()).toMatch(/unknown product ZZZZZZZZZZ/);
    expect(repo.products.get('B0H4P6M1DF')).toMatchObject({ resena_resumida: 'corta', estado: 'resena_generada' });
    expect((await runImport({ reviews: rev }, deps)).reviewsApplied).toBe(0);
  });

  it('imports media from image folders without duplicating on re-runs and skips junk', async () => {
    await write('img/B0FQBYHJ17 - Brochetas/foto1.jpg', 'AAA');
    await write('img/B0FQBYHJ17 - Brochetas/foto1-copy.jpeg', 'AAA'); // same content
    await write('img/B0FQBYHJ17 - Brochetas/foto2.png', 'BBB');
    await write('img/B0FQBYHJ17 - Brochetas/clip.mp4', 'VID');
    await write('img/B0FQBYHJ17 - Brochetas/clip2.mov', 'VID2'); // second video: skipped
    await write('img/B0FQBYHJ17 - Brochetas/Thumbs.db', 'x');
    await write('img/B0FQBYHJ17 - Brochetas/notes.txt', 'x');
    const repo = new FakeRepo();
    const store = new FakeStore();
    const images = path.join(tmp, 'img');

    const first = await runImport({ images }, { repo, store });
    expect(first.mediaImported).toBe(3); // 2 distinct photos + 1 video
    expect(repo.products.get('B0FQBYHJ17')!.titulo).toBe('Brochetas');
    expect(repo.media.filter((m) => m.type === 'photo')).toHaveLength(2);
    expect(repo.media.filter((m) => m.type === 'video')).toHaveLength(1);
    expect(first.mediaSkipped).toBeGreaterThanOrEqual(2); // notes.txt, Thumbs.db, second video

    const second = await runImport({ images }, { repo, store });
    expect(second.mediaImported).toBe(0);
    expect(repo.media).toHaveLength(3);
    expect(store.files.size).toBe(3);
  });

  it('adopts an orphan imp-<sha> file already on disk (same size) by inserting only the row', async () => {
    await write('img/B0FQBYHJ17 - Brochetas/foto1.jpg', 'AAA');
    const repo = new FakeRepo();
    const store = new FakeStore();
    const name = `imp-${createHash('sha256').update('AAA').digest('hex').slice(0, 16)}.jpg`;
    store.files.set(`B0FQBYHJ17/${name}`, Buffer.from('AAA'));

    const res = await runImport({ images: path.join(tmp, 'img') }, { repo, store });

    expect(res.mediaImported).toBe(1);
    expect(repo.media.map((m) => m.filename)).toEqual([name]);
    expect(store.files.get(`B0FQBYHJ17/${name}`)!.toString()).toBe('AAA');
  });

  it('fails with a clear message when the orphan file size differs from the source', async () => {
    await write('img/B0FQBYHJ17 - Brochetas/foto1.jpg', 'AAA');
    const repo = new FakeRepo();
    const store = new FakeStore();
    const name = `imp-${createHash('sha256').update('AAA').digest('hex').slice(0, 16)}.jpg`;
    store.files.set(`B0FQBYHJ17/${name}`, Buffer.from('truncated-garbage'));

    await expect(runImport({ images: path.join(tmp, 'img') }, { repo, store })).rejects.toThrow(
      /already exists on disk with 17 bytes but the source has 3/,
    );
    expect(repo.media).toHaveLength(0);
    expect(store.files.get(`B0FQBYHJ17/${name}`)!.toString()).toBe('truncated-garbage');
  });

  it('creates PUBLICADO folders as published products and skips their photos', async () => {
    await write('img/B09HV4KF53 - Crema Cacahuete - PUBLICADO/a.jpg', 'AAA');
    const repo = new FakeRepo();
    await runImport({ images: path.join(tmp, 'img') }, { repo, store: new FakeStore() });
    expect(repo.products.get('B09HV4KF53')).toMatchObject({ estado: 'publicado', titulo: 'Crema Cacahuete' });
    expect(repo.media).toHaveLength(0);
  });

  it('imports vine-bot uploads only for known products', async () => {
    await write('bot/B0FQBYHJ17/a.jpg', 'AAA');
    await write('bot/B0H4P6M1DF/b.jpg', 'BBB');
    await write('bot/not-an-asin/c.jpg', 'CCC');
    const repo = new FakeRepo();
    repo.seed({ asin: 'B0FQBYHJ17' });
    const res = await runImport({ botUploads: path.join(tmp, 'bot') }, { repo, store: new FakeStore() });
    expect(res.mediaImported).toBe(1);
    expect(res.warnings).toHaveLength(2);
  });

  it('dry run writes nothing', async () => {
    const txt = await write('p.txt', TXT);
    await write('img/B0H4P6M1DF - Taza/a.jpg', 'AAA');
    const repo = new FakeRepo();
    const store = new FakeStore();
    const res = await runImport({ txt, images: path.join(tmp, 'img'), dryRun: true }, { repo, store });
    expect(res.productsCreated).toBeGreaterThan(0);
    expect(repo.products.size).toBe(0);
    expect(store.files.size).toBe(0);
  });
});
