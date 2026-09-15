import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';

const IMAGES_PATH = path.resolve(process.env.PARAISOS_IMAGES_PATH || './data/images');
const SEED_IMAGES_PATH = path.resolve(__dirname, '../../seed-images');

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
]);

function ensureImagesPath(): void {
  if (!fs.existsSync(IMAGES_PATH)) {
    fs.mkdirSync(IMAGES_PATH, { recursive: true });
  }
}

/** Copia las imágenes legado (seed) al volumen persistente si aún no están. Idempotente. */
export function seedLegacyImages(): void {
  ensureImagesPath();
  if (!fs.existsSync(SEED_IMAGES_PATH)) return;
  for (const file of fs.readdirSync(SEED_IMAGES_PATH)) {
    const dest = path.join(IMAGES_PATH, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(SEED_IMAGES_PATH, file), dest);
    }
  }
}

/** Procesa y guarda una imagen subida. Devuelve el nombre de archivo generado. */
export async function saveUploadedImage(stream: Readable): Promise<string> {
  ensureImagesPath();
  const filename = `${crypto.randomUUID()}.jpg`;
  const dest = path.join(IMAGES_PATH, filename);
  const transformer = sharp()
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 82 });
  await pipeline(stream, transformer, fs.createWriteStream(dest));
  return filename;
}

/** Resuelve un nombre de archivo a ruta absoluta, evitando path traversal. */
export function getImagePath(filename: string): string | null {
  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const full = path.join(IMAGES_PATH, filename);
  return fs.existsSync(full) ? full : null;
}

const MANAGED_IMAGE_PREFIX = '/paraisos/api/images/';

/**
 * Extrae el nombre de archivo de una imagen_url solo si es una de las
 * gestionadas por este backend (generadas por saveUploadedImage/POST
 * /images). Una URL externa (https://...) no matchea y devuelve null —
 * nunca hay que parsear ni tocar disco por ella.
 */
function extractManagedFilename(imagenUrl: string): string | null {
  if (!imagenUrl.startsWith(MANAGED_IMAGE_PREFIX)) return null;
  const filename = imagenUrl.slice(MANAGED_IMAGE_PREFIX.length);
  return filename || null;
}

/**
 * Borra del disco el fichero subido al que apuntaba `imagenUrl`, pero SOLO
 * si es una de nuestras propias imágenes gestionadas (prefijo
 * /paraisos/api/images/<filename>). Una URL externa, null o vacía no hace
 * nada. Reutiliza getImagePath (mismo guard anti path-traversal) para
 * resolver la ruta. Nunca lanza: un fallo de limpieza no debe romper la
 * petición de PATCH/DELETE de spot que la disparó.
 */
export function deleteImageIfManaged(imagenUrl: string | null | undefined): void {
  if (!imagenUrl) return;

  const filename = extractManagedFilename(imagenUrl);
  if (!filename) return;

  try {
    const filePath = getImagePath(filename);
    if (filePath) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[imageService] No se pudo borrar la imagen huérfana ${filename}:`, err);
  }
}
