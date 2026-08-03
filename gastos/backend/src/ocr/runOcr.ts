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

// Tesseract rinde mucho mejor a partir de ~300 DPI equivalentes (tessdoc
// "ImproveQuality"); una foto de Telegram comprimida puede llegar con el
// lado largo muy por debajo de eso. Si el lado largo actual queda corto, se
// escala hasta este objetivo con un kernel de calidad — nunca se reduce una
// imagen que ya es lo bastante grande.
const MIN_LONG_EDGE_PX = 1500;

// Umbral de respaldo si por lo que sea no se puede calcular Otsu (buffer
// vacío, etc.) — mismo valor por defecto que usa sharp en threshold().
const FALLBACK_THRESHOLD = 128;

/**
 * Calcula el umbral de binarización óptimo con el método de Otsu (maximiza
 * la varianza entre clases del histograma de 256 niveles de gris). sharp no
 * trae un modo de threshold automático/Otsu — solo admite un valor fijo
 * (128 por defecto, confirmado en su documentación de `threshold()`) — así
 * que se calcula a mano sobre el buffer en crudo (1 canal, ya en escala de
 * grises) para adaptarse al contraste real de cada foto en vez de un valor
 * fijo que sobre- o sub-binariza según la iluminación del ticket de papel
 * térmico o el fondo de la captura de la app bancaria.
 */
export function computeOtsuThreshold(grayscaleData: Buffer): number {
  if (grayscaleData.length === 0) return FALLBACK_THRESHOLD;

  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < grayscaleData.length; i++) {
    histogram[grayscaleData[i]]++;
  }

  const total = grayscaleData.length;
  let sum = 0;
  for (let level = 0; level < 256; level++) sum += level * histogram[level];

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = 0;
  let threshold = FALLBACK_THRESHOLD;

  for (let level = 0; level < 256; level++) {
    weightBackground += histogram[level];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += level * histogram[level];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const betweenClassVariance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (betweenClassVariance > maxVariance) {
      maxVariance = betweenClassVariance;
      threshold = level;
    }
  }

  return threshold;
}

/**
 * Preprocesa la imagen (escala de grises, normalización de contraste,
 * upscale si el lado largo queda corto, umbralización adaptativa por Otsu)
 * con sharp — operaciones baratas que ayudan a Tesseract con fotos de
 * recibos de papel térmico de bajo contraste y capturas de apps bancarias
 * (ver design.md) — y ejecuta `tesseract` como proceso hijo vía execFile
 * (argv array, nunca un string de shell, mismo patrón que ytdl usa para
 * invocar yt-dlp/ffmpeg).
 */
export async function runOcr(imageBuffer: Buffer): Promise<string> {
  let pipeline = sharp(imageBuffer).grayscale().normalize();

  const metadata = await pipeline.metadata();
  const longEdge = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  if (longEdge > 0 && longEdge < MIN_LONG_EDGE_PX) {
    pipeline = pipeline.resize({
      width: MIN_LONG_EDGE_PX,
      height: MIN_LONG_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: false,
      kernel: 'lanczos3',
    });
  }

  // clone() para leer el buffer en crudo (histograma) por una rama
  // independiente sin consumir el pipeline que genera la imagen final.
  const { data: grayscaleRaw } = await pipeline
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const otsuThreshold = computeOtsuThreshold(grayscaleRaw);

  const processed = await pipeline.threshold(otsuThreshold).png().toBuffer();

  const dir = await mkdtemp(path.join(tmpdir(), 'gastos-ocr-'));
  const inputPath = path.join(dir, 'input.png');
  const outputBase = path.join(dir, 'output');

  try {
    await writeFile(inputPath, processed);
    await new Promise<void>((resolve, reject) => {
      execFile(
        TESSERACT_BIN,
        // --psm 6 ("uniform block of text"): el PSM 3 por defecto (auto
        // completo + OSD) está pensado para páginas de documento genéricas;
        // un ticket de papel es una tira estrecha de texto y una captura de
        // app bancaria suele venir ya recortada a la región relevante — en
        // ambos casos un único bloque uniforme describe mejor la imagen que
        // la segmentación automática. La documentación de Tesseract no fija
        // un PSM único para recibos, así que este es el valor conservador
        // recomendado para regiones ya acotadas de texto (tessdoc
        // ImproveQuality / tesseract --help-psm).
        [inputPath, outputBase, '-l', 'spa', '--psm', '6'],
        { timeout: OCR_TIMEOUT_MS },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return await readFile(`${outputBase}.txt`, 'utf-8');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
