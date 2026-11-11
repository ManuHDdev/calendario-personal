import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { SCHEMA_SQL } from './ensureSchema';

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
});
