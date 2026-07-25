import { execFile } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import sharp from 'sharp';

// Ruta al binario. Configurable para tests/entornos alternativos; en el
// Dockerfile se instala como paquete apk en el PATH (mismo patrón que
// ytdl/backend/src/services/ytdlp.ts usa para yt-dlp/ffmpeg).
const TESSERACT_BIN = process.env.TESSERACT_PATH || 'tesseract';
const OCR_TIMEOUT_MS = 30_000;

/**
 * Preprocesa la imagen (escala de grises, normalización de contraste,
 * umbralización) con sharp — operaciones baratas que ayudan a Tesseract con
 * fotos de recibos de papel térmico de bajo contraste (ver design.md) — y
 * ejecuta `tesseract` como proceso hijo vía execFile (argv array, nunca un
 * string de shell, mismo patrón que ytdl usa para invocar yt-dlp/ffmpeg).
 */
export async function runOcr(imageBuffer: Buffer): Promise<string> {
  const processed = await sharp(imageBuffer)
    .grayscale()
    .normalize()
    .threshold(150)
    .toBuffer();

  const dir = await mkdtemp(path.join(tmpdir(), 'gastos-ocr-'));
  const inputPath = path.join(dir, 'input.png');
  const outputBase = path.join(dir, 'output');

  try {
    await writeFile(inputPath, processed);
    await new Promise<void>((resolve, reject) => {
      execFile(
        TESSERACT_BIN,
        [inputPath, outputBase, '-l', 'spa'],
        { timeout: OCR_TIMEOUT_MS },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return await readFile(`${outputBase}.txt`, 'utf-8');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
