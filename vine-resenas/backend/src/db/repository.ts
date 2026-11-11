import type { Pool } from 'pg';
import type {
  Estado,
  MediaRow,
  MediaType,
  NewProduct,
  Product,
  ProductPatch,
  ProductWithMedia,
} from '../domain/types';

/** Persistence port. The Postgres adapter is below; tests use an in-memory fake. */
export interface ProductRepository {
  listAll(): Promise<ProductWithMedia[]>;
  get(asin: string): Promise<ProductWithMedia | null>;
  /** INSERT ... ON CONFLICT DO NOTHING. Returns true when a row was created. */
  create(p: NewProduct): Promise<boolean>;
  update(asin: string, patch: ProductPatch): Promise<Product | null>;
  setEstado(asin: string, estado: Estado): Promise<Product | null>;
  /** Stores the three review texts and sets estado = resena_generada. */
  setResena(
    asin: string,
    r: { resena_producto: string; resena_resumida: string; resena_extendida: string },
  ): Promise<Product | null>;
  addMedia(m: { asin: string; filename: string; type: MediaType; size: number }): Promise<MediaRow>;
  getMedia(asin: string, filename: string): Promise<MediaRow | null>;
  deleteMedia(asin: string, filename: string): Promise<boolean>;
  counts(): Promise<Record<Estado, number>>;
}

const PRODUCT_COLS = `p.asin, p.titulo, p.descripcion, p.feedback, p.estrellas, p.estado,
  p.resena_producto, p.resena_resumida, p.resena_extendida, p.created_at, p.updated_at`;

const WITH_MEDIA = `
  SELECT ${PRODUCT_COLS},
    COALESCE(
      json_agg(json_build_object('id', m.id, 'asin', m.asin, 'filename', m.filename,
                                 'type', m.type, 'size', m.size, 'created_at', m.created_at)
               ORDER BY m.id) FILTER (WHERE m.id IS NOT NULL),
      '[]'::json) AS media
  FROM vine_products p
  LEFT JOIN vine_media m ON m.asin = p.asin`;

const RETURN_PRODUCT = `RETURNING asin, titulo, descripcion, feedback, estrellas, estado,
  resena_producto, resena_resumida, resena_extendida, created_at, updated_at`;

const EDITABLE: (keyof ProductPatch)[] = ['titulo', 'descripcion', 'feedback', 'estrellas'];

export class PgProductRepository implements ProductRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async listAll(): Promise<ProductWithMedia[]> {
    const { rows } = await this.pool.query(`${WITH_MEDIA} GROUP BY p.asin ORDER BY p.created_at, p.asin`);
    return rows as ProductWithMedia[];
  }

  async get(asin: string): Promise<ProductWithMedia | null> {
    const { rows } = await this.pool.query(`${WITH_MEDIA} WHERE p.asin = $1 GROUP BY p.asin`, [asin]);
    return (rows[0] as ProductWithMedia) ?? null;
  }

  async create(p: NewProduct): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO vine_products
         (asin, titulo, descripcion, feedback, estrellas, estado, resena_producto, resena_resumida, resena_extendida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (asin) DO NOTHING`,
      [
        p.asin,
        p.titulo ?? '',
        p.descripcion ?? '',
        p.feedback ?? '',
        p.estrellas ?? null,
        p.estado ?? 'pendiente',
        p.resena_producto ?? '',
        p.resena_resumida ?? '',
        p.resena_extendida ?? '',
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  async update(asin: string, patch: ProductPatch): Promise<Product | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of EDITABLE) {
      if (patch[key] !== undefined) {
        values.push(patch[key]);
        sets.push(`${key} = $${values.length}`);
      }
    }
    if (sets.length === 0) {
      const { rows } = await this.pool.query(`SELECT ${PRODUCT_COLS} FROM vine_products p WHERE p.asin = $1`, [asin]);
      return (rows[0] as Product) ?? null;
    }
    values.push(asin);
    const { rows } = await this.pool.query(
      `UPDATE vine_products SET ${sets.join(', ')}, updated_at = NOW() WHERE asin = $${values.length} ${RETURN_PRODUCT}`,
      values,
    );
    return (rows[0] as Product) ?? null;
  }

  async setEstado(asin: string, estado: Estado): Promise<Product | null> {
    const { rows } = await this.pool.query(
      `UPDATE vine_products SET estado = $2, updated_at = NOW() WHERE asin = $1 ${RETURN_PRODUCT}`,
      [asin, estado],
    );
    return (rows[0] as Product) ?? null;
  }

  async setResena(
    asin: string,
    r: { resena_producto: string; resena_resumida: string; resena_extendida: string },
  ): Promise<Product | null> {
    const { rows } = await this.pool.query(
      `UPDATE vine_products
         SET resena_producto = $2, resena_resumida = $3, resena_extendida = $4,
             estado = 'resena_generada', updated_at = NOW()
       WHERE asin = $1 ${RETURN_PRODUCT}`,
      [asin, r.resena_producto, r.resena_resumida, r.resena_extendida],
    );
    return (rows[0] as Product) ?? null;
  }

  async addMedia(m: { asin: string; filename: string; type: MediaType; size: number }): Promise<MediaRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO vine_media (asin, filename, type, size) VALUES ($1, $2, $3, $4)
       RETURNING id, asin, filename, type, size::float8 AS size, created_at`,
      [m.asin, m.filename, m.type, m.size],
    );
    await this.pool.query('UPDATE vine_products SET updated_at = NOW() WHERE asin = $1', [m.asin]);
    return rows[0] as MediaRow;
  }

  async getMedia(asin: string, filename: string): Promise<MediaRow | null> {
    const { rows } = await this.pool.query(
      `SELECT id, asin, filename, type, size::float8 AS size, created_at
       FROM vine_media WHERE asin = $1 AND filename = $2`,
      [asin, filename],
    );
    return (rows[0] as MediaRow) ?? null;
  }

  async deleteMedia(asin: string, filename: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM vine_media WHERE asin = $1 AND filename = $2', [
      asin,
      filename,
    ]);
    return (rowCount ?? 0) > 0;
  }

  async counts(): Promise<Record<Estado, number>> {
    const { rows } = await this.pool.query('SELECT estado, COUNT(*)::int AS n FROM vine_products GROUP BY estado');
    const out: Record<Estado, number> = { pendiente: 0, listo: 0, resena_generada: 0, publicado: 0 };
    for (const r of rows as { estado: Estado; n: number }[]) out[r.estado] = r.n;
    return out;
  }
}
