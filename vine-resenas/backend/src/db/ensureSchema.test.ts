import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { ensureSchema, SCHEMA_SQL } from './ensureSchema';
import { pool } from './pool';

vi.mock('./pool', () => ({ pool: { query: vi.fn() } }));

const strip = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('schema', () => {
  it('ensureSchema and infra/init.sql define exactly the same statements', () => {
    const init = readFileSync(path.resolve(__dirname, '../../../infra/init.sql'), 'utf8');
    expect(strip(init)).toBe(strip(SCHEMA_SQL));
  });
  it('is idempotent (IF NOT EXISTS everywhere)', () => {
    for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      expect(stmt).toMatch(/IF NOT EXISTS/);
    }
  });
  it('declares the one-video-per-product partial unique index', () => {
    expect(SCHEMA_SQL).toMatch(/UNIQUE INDEX IF NOT EXISTS vine_media_one_video ON vine_media \(asin\) WHERE type = 'video'/);
  });
  it('dedupes legacy videos before creating the unique index and survives them', async () => {
    const query = vi.mocked(pool.query) as unknown as ReturnType<typeof vi.fn>;
    query.mockReset();
    query.mockImplementation(async (sql: string) =>
      /^\s*DELETE/.test(sql) ? { rows: [{ asin: 'B0FQBYHJ17', filename: 'old.mp4' }] } : { rows: [] },
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await ensureSchema();
    const sqls = query.mock.calls.map((c) => String(c[0]));
    const del = sqls.findIndex((q) => /DELETE FROM vine_media/.test(q));
    const idx = sqls.findIndex((q) => /vine_media_one_video/.test(q));
    expect(del).toBeGreaterThan(-1);
    expect(idx).toBeGreaterThan(del);
    expect(sqls[del]).toMatch(/m\.id < n\.id/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('B0FQBYHJ17/old.mp4'));
    warn.mockRestore();
  });
});
