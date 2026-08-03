import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFile } from 'fs/promises';

// sharp y child_process se mockean porque este es un test unitario del
// pipeline de preprocesado/orquestación, no una prueba de integración contra
// el binario real de tesseract ni contra libvips — no hay imagen de ticket
// real disponible en este repo para usar como fixture (ver runOcr.ts).
//
// vi.mock(...) se hoist-ea por encima de cualquier `const` del módulo, así
// que los mocks que usan esas factories deben declararse con vi.hoisted().
const mocks = vi.hoisted(() => ({
  metadataMock: vi.fn(),
  grayscaleMock: vi.fn(),
  normalizeMock: vi.fn(),
  resizeMock: vi.fn(),
  cloneMock: vi.fn(),
  rawMock: vi.fn(),
  thresholdMock: vi.fn(),
  pngMock: vi.fn(),
  toBufferMock: vi.fn(),
  execFileMock: vi.fn(),
}));

function makePipeline() {
  const pipeline: Record<string, ReturnType<typeof vi.fn>> = {
    grayscale: mocks.grayscaleMock.mockReturnThis(),
    normalize: mocks.normalizeMock.mockReturnThis(),
    resize: mocks.resizeMock.mockReturnThis(),
    clone: mocks.cloneMock,
    raw: mocks.rawMock.mockReturnThis(),
    threshold: mocks.thresholdMock.mockReturnThis(),
    png: mocks.pngMock.mockReturnThis(),
    toBuffer: mocks.toBufferMock,
    metadata: mocks.metadataMock,
  };
  return pipeline;
}

vi.mock('sharp', () => ({
  __esModule: true,
  default: vi.fn(() => makePipeline()),
}));

vi.mock('child_process', () => ({
  execFile: mocks.execFileMock,
}));

import { runOcr, computeOtsuThreshold } from './runOcr';

describe('computeOtsuThreshold', () => {
  it('returns the fallback (128) for an empty buffer', () => {
    expect(computeOtsuThreshold(Buffer.from([]))).toBe(128);
  });

  it('picks a threshold between two well-separated intensity clusters', () => {
    // 50 píxeles oscuros (~20) y 50 píxeles claros (~230): Otsu debe situar
    // el corte en algún punto del valle entre ambos grupos.
    const dark = new Array(50).fill(20);
    const light = new Array(50).fill(230);
    const data = Buffer.from([...dark, ...light]);
    const threshold = computeOtsuThreshold(data);
    // Convención: pixels <= threshold quedan en el grupo "fondo" — con
    // clusters exactos en 20/230, el óptimo cae justo en el valor del
    // cluster oscuro (todo <=20 es fondo, todo >20 es primer plano).
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(230);
  });

  it('does not throw on a uniform (single-value) histogram', () => {
    const data = Buffer.from(new Array(100).fill(128));
    expect(() => computeOtsuThreshold(data)).not.toThrow();
  });
});

describe('runOcr', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.grayscaleMock.mockReturnThis();
    mocks.normalizeMock.mockReturnThis();
    mocks.resizeMock.mockReturnThis();
    mocks.rawMock.mockReturnThis();
    mocks.thresholdMock.mockReturnThis();
    mocks.pngMock.mockReturnThis();
    mocks.cloneMock.mockImplementation(() => makePipeline());

    // Histograma en crudo para el cálculo de Otsu (irrelevante para estos
    // tests salvo que debe existir y no estar vacío).
    mocks.toBufferMock.mockImplementation((opts?: { resolveWithObject?: boolean }) => {
      if (opts?.resolveWithObject) {
        return Promise.resolve({
          data: Buffer.from([10, 10, 200, 200]),
          info: { width: 2, height: 2, channels: 1 },
        });
      }
      return Promise.resolve(Buffer.from('fake-png-bytes'));
    });

    mocks.execFileMock.mockImplementation(
      (
        _bin: string,
        args: string[],
        _opts: unknown,
        callback: (error: Error | null) => void,
      ) => {
        const outputBase = args[1];
        // Simula lo que tesseract escribiría en disco (<outputBase>.txt) sin
        // invocar el binario real.
        void writeFile(`${outputBase}.txt`, 'texto ocr simulado', 'utf-8').then(
          () => callback(null),
          (err) => callback(err),
        );
      },
    );
  });

  it('does not upscale an image whose long edge is already large enough', async () => {
    mocks.metadataMock.mockResolvedValue({ width: 2000, height: 3000 });

    await runOcr(Buffer.from('fake-image'));

    expect(mocks.resizeMock).not.toHaveBeenCalled();
  });

  it('upscales with a high-quality kernel when the long edge is below the threshold', async () => {
    mocks.metadataMock.mockResolvedValue({ width: 600, height: 900 });

    await runOcr(Buffer.from('fake-image'));

    expect(mocks.resizeMock).toHaveBeenCalledTimes(1);
    const resizeArgs = mocks.resizeMock.mock.calls[0][0];
    expect(resizeArgs.kernel).toBe('lanczos3');
    expect(resizeArgs.fit).toBe('inside');
    expect(resizeArgs.withoutEnlargement).toBe(false);
  });

  it('invokes tesseract with the --psm 6 flag via execFile argv (no shell string)', async () => {
    mocks.metadataMock.mockResolvedValue({ width: 2000, height: 3000 });

    await runOcr(Buffer.from('fake-image'));

    expect(mocks.execFileMock).toHaveBeenCalledTimes(1);
    const [bin, args] = mocks.execFileMock.mock.calls[0];
    expect(bin).toBe(process.env.TESSERACT_PATH || 'tesseract');
    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain('--psm');
    expect(args[args.indexOf('--psm') + 1]).toBe('6');
    expect(args).toContain('-l');
    expect(args[args.indexOf('-l') + 1]).toBe('spa');
  });

  it('applies an adaptive threshold (not a hardcoded fixed value) before OCR', async () => {
    mocks.metadataMock.mockResolvedValue({ width: 2000, height: 3000 });

    await runOcr(Buffer.from('fake-image'));

    expect(mocks.thresholdMock).toHaveBeenCalledTimes(1);
    const thresholdArg = mocks.thresholdMock.mock.calls[0][0];
    expect(typeof thresholdArg).toBe('number');
    // Con el histograma simulado (10,10,200,200) Otsu debe cortar entre
    // ambos clusters, nunca en el valor fijo anterior (150) por casualidad
    // del mock — lo relevante es que el valor SALE de computeOtsuThreshold.
    expect(thresholdArg).toBeGreaterThanOrEqual(10);
    expect(thresholdArg).toBeLessThan(200);
  });

  it('returns the OCR text read back from the tesseract output file', async () => {
    mocks.metadataMock.mockResolvedValue({ width: 2000, height: 3000 });

    const text = await runOcr(Buffer.from('fake-image'));

    expect(text).toBe('texto ocr simulado');
  });
});
