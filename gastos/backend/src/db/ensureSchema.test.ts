import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('./pool', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { ensureSchema } from './ensureSchema';

describe('ensureSchema', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  async function issuedSql(): Promise<string> {
    await ensureSchema();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    return mockQuery.mock.calls[0][0] as string;
  }

  it('keeps reconciling the estado CHECK with previsto', async () => {
    const sql = await issuedSql();
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS gasto_estado_check');
    expect(sql).toMatch(/gasto_estado_check\s+CHECK \(estado IN \('pendiente_revision', 'confirmado', 'previsto'\)\)/);
  });

  it("adds tipo defaulting to 'gasto' so existing rows stay expenses", async () => {
    const sql = await issuedSql();
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'gasto'",
    );
  });

  it("constrains tipo to 'gasto' | 'ganancia' under the named gasto_tipo_check", async () => {
    const sql = await issuedSql();
    expect(sql).toMatch(/gasto_tipo_check\s+CHECK \(tipo IN \('gasto', 'ganancia'\)\)/);
  });

  it('is idempotent in shape: every ADD is guarded or preceded by a DROP IF EXISTS', async () => {
    const sql = await issuedSql();
    for (const name of ['gasto_estado_check', 'gasto_tipo_check']) {
      const drop = sql.indexOf(`DROP CONSTRAINT IF EXISTS ${name}`);
      const add = sql.indexOf(`ADD CONSTRAINT ${name}`);
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(add).toBeGreaterThan(drop);
    }
    expect(sql).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
  });

  it('runs the same statements again on a second start', async () => {
    await ensureSchema();
    await ensureSchema();
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toBe(mockQuery.mock.calls[0][0]);
  });

  it('propagates a failure so startup aborts instead of serving a stale schema', async () => {
    mockQuery.mockRejectedValueOnce(new Error('boom'));
    await expect(ensureSchema()).rejects.toThrow('boom');
  });
});
