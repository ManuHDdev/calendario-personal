// In-memory test doubles for the repository and the file store.
import type { ReadStream, Stats } from 'fs';
import { Readable } from 'stream';
import type { ProductRepository } from '../db/repository';
import type {
  Estado,
  GuestLink,
  MediaRow,
  MediaType,
  NewProduct,
  Product,
  ProductPatch,
  ProductWithMedia,
} from '../domain/types';
import type { ServableStore } from '../routes/deps';

/** Yields to the event loop so concurrent calls can interleave, like with a real DB. */
const tick = () => new Promise<void>((r) => setImmediate(r));

export class FakeRepo implements ProductRepository {
  products = new Map<string, Product>();
  media: MediaRow[] = [];
  links: (GuestLink & { token_hash: string })[] = [];
  private nextId = 1;
  private nextLinkId = 1;

  seed(p: Partial<Product> & { asin: string }): Product {
    const full: Product = {
      titulo: '',
      descripcion: '',
      feedback: '',
      guest_feedback: '',
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
    await tick();
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
  async addMedia(m: { asin: string; filename: string; type: MediaType; size: number; guestLinkId?: number | null }) {
    await tick();
    if (m.type === 'video' && this.media.some((x) => x.asin === m.asin && x.type === 'video')) {
      throw Object.assign(new Error('duplicate key value violates unique constraint "vine_media_one_video"'), {
        code: '23505',
      });
    }
    if (this.media.some((x) => x.asin === m.asin && x.filename === m.filename)) throw new Error('duplicate media');
    const { guestLinkId, ...rest } = m;
    const row: MediaRow = {
      id: this.nextId++,
      created_at: '2026-01-01T00:00:00Z',
      uploaded_via_guest_link_id: guestLinkId ?? null,
      ...rest,
    };
    this.media.push(row);
    return row;
  }
  async getMedia(asin: string, filename: string) {
    return this.media.find((m) => m.asin === asin && m.filename === filename) ?? null;
  }
  async deleteMedia(asin: string, filename: string) {
    await tick();
    const before = this.media.length;
    this.media = this.media.filter((m) => !(m.asin === asin && m.filename === filename));
    return this.media.length < before;
  }
  async createGuestLink(l: { asin: string; tokenHash: string; expiresAt: Date; createdBy: string | null }) {
    const row = {
      id: this.nextLinkId++,
      asin: l.asin,
      token_hash: l.tokenHash,
      created_at: new Date().toISOString(),
      expires_at: l.expiresAt.toISOString(),
      revoked_at: null,
      created_by: l.createdBy,
      last_used_at: null,
    };
    this.links.push(row);
    return this.publicLink(row);
  }
  private publicLink(l: GuestLink & { token_hash: string }): GuestLink {
    const { token_hash: _omit, ...rest } = l;
    return { ...rest };
  }
  async listGuestLinks(asin: string) {
    return this.links.filter((l) => l.asin === asin).map((l) => this.publicLink(l)).reverse();
  }
  async findGuestLinkByHash(tokenHash: string) {
    const l = this.links.find((x) => x.token_hash === tokenHash);
    return l ? this.publicLink(l) : null;
  }
  async revokeGuestLink(id: number) {
    const l = this.links.find((x) => x.id === id);
    if (!l) return null;
    l.revoked_at ??= new Date().toISOString();
    return this.publicLink(l);
  }
  async touchGuestLink(id: number) {
    const l = this.links.find((x) => x.id === id);
    if (l) l.last_used_at = new Date().toISOString();
  }
  async countGuestMedia(linkId: number) {
    return this.media.filter((m) => m.uploaded_via_guest_link_id === linkId).length;
  }
  async setGuestFeedback(asin: string, text: string) {
    const p = this.products.get(asin);
    if (p) p.guest_feedback = text;
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
  async sizeOf(asin: string, filename: string) {
    return this.files.get(this.key(asin, filename))?.length ?? null;
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
