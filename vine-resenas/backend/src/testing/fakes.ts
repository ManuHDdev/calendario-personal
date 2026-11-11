// In-memory test doubles for the repository and the file store.
import type { ReadStream, Stats } from 'fs';
import { Readable } from 'stream';
import type { ProductRepository } from '../db/repository';
import type {
  Estado,
  MediaRow,
  MediaType,
  NewProduct,
  Product,
  ProductPatch,
  ProductWithMedia,
} from '../domain/types';
import type { ServableStore } from '../routes/deps';

export class FakeRepo implements ProductRepository {
  products = new Map<string, Product>();
  media: MediaRow[] = [];
  private nextId = 1;

  seed(p: Partial<Product> & { asin: string }): Product {
    const full: Product = {
      titulo: '',
      descripcion: '',
      feedback: '',
      estrellas: null,
      estado: 'pendiente',
      resena_producto: '',
      resena_resumida: '',
      resena_extendida: '',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...p,
    };
    this.products.set(full.asin, full);
    return full;
  }

  private withMedia(p: Product): ProductWithMedia {
    return { ...p, media: this.media.filter((m) => m.asin === p.asin) };
  }

  async listAll() {
    return [...this.products.values()].map((p) => this.withMedia(p));
  }
  async get(asin: string) {
    const p = this.products.get(asin);
    return p ? this.withMedia(p) : null;
  }
  async create(n: NewProduct) {
    if (this.products.has(n.asin)) return false;
    this.seed({ ...n, estrellas: n.estrellas ?? null } as Partial<Product> & { asin: string });
    return true;
  }
  async update(asin: string, patch: ProductPatch) {
    const p = this.products.get(asin);
    if (!p) return null;
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (p as unknown as Record<string, unknown>)[k] = v;
    return { ...p };
  }
  async setEstado(asin: string, estado: Estado) {
    const p = this.products.get(asin);
    if (!p) return null;
    p.estado = estado;
    return { ...p };
  }
  async setResena(asin: string, r: { resena_producto: string; resena_resumida: string; resena_extendida: string }) {
    const p = this.products.get(asin);
    if (!p) return null;
    Object.assign(p, r, { estado: 'resena_generada' as Estado });
    return { ...p };
  }
  async addMedia(m: { asin: string; filename: string; type: MediaType; size: number }) {
    if (this.media.some((x) => x.asin === m.asin && x.filename === m.filename)) throw new Error('duplicate media');
    const row: MediaRow = { id: this.nextId++, created_at: '2026-01-01T00:00:00Z', ...m };
    this.media.push(row);
    return row;
  }
  async getMedia(asin: string, filename: string) {
    return this.media.find((m) => m.asin === asin && m.filename === filename) ?? null;
  }
  async deleteMedia(asin: string, filename: string) {
    const before = this.media.length;
    this.media = this.media.filter((m) => !(m.asin === asin && m.filename === filename));
    return this.media.length < before;
  }
  async counts() {
    const out: Record<Estado, number> = { pendiente: 0, listo: 0, resena_generada: 0, publicado: 0 };
    for (const p of this.products.values()) out[p.estado]++;
    return out;
  }
}

export class FakeStore implements ServableStore {
  files = new Map<string, Buffer>();

  private key(asin: string, filename: string) {
    return `${asin}/${filename}`;
  }
  async save(asin: string, filename: string, source: Readable, maxBytes: number) {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of source) {
      total += (c as Buffer).length;
      if (total > maxBytes) throw new Error('too large');
      chunks.push(c as Buffer);
    }
    this.files.set(this.key(asin, filename), Buffer.concat(chunks));
    return total;
  }
  async remove(asin: string, filename: string) {
    this.files.delete(this.key(asin, filename));
  }
  pathFor(asin: string, filename: string) {
    return `/fake/${asin}/${filename}`;
  }
  async stat(asin: string, filename: string): Promise<Stats> {
    const f = this.files.get(this.key(asin, filename));
    if (!f) throw new Error('ENOENT');
    return { size: f.length } as Stats;
  }
  open(asin: string, filename: string, range?: { start: number; end: number }): ReadStream {
    const f = this.files.get(this.key(asin, filename)) ?? Buffer.alloc(0);
    return Readable.from([range ? f.subarray(range.start, range.end + 1) : f]) as unknown as ReadStream;
  }
}
