import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectParser, parseImage, persistGasto, runOcrPipeline } from './pipeline';
import { parseTicket } from './parseTicket';
import { parseBanco } from './parseBanco';
import type { DraftGasto, Gasto } from '../types/gasto';

describe('selectParser', () => {
  it('maps "ticket" to parseTicket', () => {
    expect(selectParser('ticket')).toBe(parseTicket);
  });

  it('maps "banco" to parseBanco', () => {
    expect(selectParser('banco')).toBe(parseBanco);
  });
});

const mockRunOcr = vi.fn();
vi.mock('./runOcr', () => ({
  runOcr: (...args: unknown[]) => mockRunOcr(...args),
}));

const mockQuery = vi.fn();
vi.mock('../db/pool', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
vi.mock('fs', () => ({
  promises: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  },
}));

describe('parseImage', () => {
  beforeEach(() => {
    mockRunOcr.mockReset();
  });

  it('runs OCR and delegates parsing to the selected parser — no filesystem or DB access', async () => {
    mockRunOcr.mockResolvedValue('TOTAL 12.50\n01/02/2026\nMi Tienda');

    const draft = await parseImage(Buffer.from('fake-image'), 'ticket');

    expect(mockRunOcr).toHaveBeenCalledWith(Buffer.from('fake-image'));
    expect(draft.importe).toBe(12.5);
    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('persistGasto', () => {
  beforeEach(() => {
    mockMkdir.mockReset();
    mockWriteFile.mockReset();
    mockQuery.mockReset();
  });

  const draft: DraftGasto = { importe: 9.99, fecha: '2026-08-03', comercio: 'Mi Tienda' };
  const gasto: Gasto = {
    id: '1',
    importe: 9.99,
    fecha: '2026-08-03',
    comercio: 'Mi Tienda',
    concepto: null,
    categoria: null,
    origen: 'ticket',
    estado: 'pendiente_revision',
    imagen_path: '/data/images/x.jpg',
    activo: true,
    deleted_at: null,
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  };

  it('writes the source image to disk and inserts the gasto as pendiente_revision', async () => {
    mockQuery.mockResolvedValue({ rows: [gasto] });

    const result = await persistGasto(draft, 'ticket', Buffer.from('fake-image'));

    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("'pendiente_revision'"),
      [draft.importe, draft.fecha, draft.comercio, null, 'ticket', expect.any(String)],
    );
    expect(result).toEqual(gasto);
  });
});

describe('runOcrPipeline', () => {
  beforeEach(() => {
    mockRunOcr.mockReset();
    mockMkdir.mockReset();
    mockWriteFile.mockReset();
    mockQuery.mockReset();
  });

  it('composes parseImage + persistGasto and returns both the gasto and the draft', async () => {
    mockRunOcr.mockResolvedValue('TOTAL 5.00\n01/02/2026\nOtra Tienda');
    const insertedGasto: Gasto = {
      id: '2',
      importe: 5,
      fecha: '2026-02-01',
      comercio: 'Otra Tienda',
      concepto: null,
      categoria: null,
      origen: 'ticket',
      estado: 'pendiente_revision',
      imagen_path: '/data/images/y.jpg',
      activo: true,
      deleted_at: null,
      created_at: '2026-08-03T00:00:00.000Z',
      updated_at: '2026-08-03T00:00:00.000Z',
    };
    mockQuery.mockResolvedValue({ rows: [insertedGasto] });

    const result = await runOcrPipeline(Buffer.from('fake-image'), 'ticket');

    expect(mockRunOcr).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalled();
    expect(result.gasto).toEqual(insertedGasto);
    expect(result.draft.comercio).toBe('Otra Tienda');
  });
});
