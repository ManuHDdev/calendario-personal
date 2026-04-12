import fs from 'fs';
import path from 'path';
import { v5 as uuidv5 } from 'uuid';
import mime from 'mime-types';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const BASE_PATH = process.env.STORAGE_PATH || '/mnt/storage-ssd';

const UUID_NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'application/pdf',
]);

// Carpetas del sistema que nunca deben mostrarse
const HIDDEN_DIRS = new Set(['lost+found', '.Trash-1000', '$RECYCLE.BIN']);

export interface FileEntry {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  createdAt: string;
  /** Ruta relativa completa de la carpeta padre, ej. "Dron/Fotos" o null si está en raíz */
  folder: string | null;
}

export function ensureBasePath(): void {
  if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, { recursive: true });
  }
}

function toRelative(absolutePath: string): string {
  return absolutePath.slice(BASE_PATH.length).replace(/\\/g, '/').replace(/^\//, '');
}

function buildEntry(absolutePath: string): FileEntry {
  const stat = fs.statSync(absolutePath);
  const relativePath = toRelative(absolutePath);
  const name = path.basename(absolutePath);
  const ext = path.extname(name).toLowerCase();
  const detected = mime.lookup(ext) || 'application/octet-stream';
  const segments = relativePath.split('/');
  // Guardar la ruta completa del directorio padre (soporte multinivel)
  const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : null;

  return {
    id: uuidv5(relativePath, UUID_NAMESPACE),
    name,
    relativePath,
    size: stat.size,
    mimeType: detected,
    createdAt: stat.birthtime.toISOString(),
    folder,
  };
}

/** Evita path traversal — lanza error si la ruta sale de BASE_PATH */
function safePath(relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/\\/g, '/');
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error('Invalid path');
  }
  const absolute = path.join(BASE_PATH, normalized);
  if (!absolute.startsWith(BASE_PATH + path.sep) && absolute !== BASE_PATH) {
    throw new Error('Path traversal detected');
  }
  return absolute;
}

/**
 * Devuelve todos los archivos permitidos.
 * Si se especifica folder, sólo devuelve los archivos dentro de esa carpeta
 * (incluyendo subcarpetas). Sin folder devuelve TODOS los archivos del disco.
 */
export function getAllFiles(folder?: string): FileEntry[] {
  const results: FileEntry[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!HIDDEN_DIRS.has(entry.name)) walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const file = buildEntry(fullPath);
          if (ALLOWED_MIME_TYPES.has(file.mimeType)) results.push(file);
        } catch {
          // archivo no accesible, ignorar
        }
      }
    }
  }

  if (folder) {
    const folderPath = safePath(folder);
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return [];
    walk(folderPath);
  } else {
    // FIX: recorrer TODO el árbol, no solo la raíz
    walk(BASE_PATH);
  }

  return results;
}

/** Devuelve todas las carpetas del disco como rutas relativas planas, ordenadas.
 *  Ej: ["Dron", "Dron/Fotos", "Viajes", "Viajes/2024"]
 */
export function getFolders(): string[] {
  const results: string[] = [];

  function walkDirs(dir: string, prefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (HIDDEN_DIRS.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      results.push(rel);
      walkDirs(path.join(dir, entry.name), rel);
    }
  }

  walkDirs(BASE_PATH, '');
  return results.sort();
}

/** Guarda un archivo. Devuelve el FileEntry resultante. */
export async function saveFile(
  filename: string,
  mimeType: string,
  stream: Readable,
  folder?: string,
): Promise<FileEntry> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`MIME type not allowed: ${mimeType}`);
  }

  const targetDir = folder ? safePath(folder) : BASE_PATH;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let finalName = filename;
  let counter = 1;
  while (fs.existsSync(path.join(targetDir, finalName))) {
    finalName = `${base}_${counter}${ext}`;
    counter++;
  }

  const dest = path.join(targetDir, finalName);
  const writeStream = fs.createWriteStream(dest);
  await pipeline(stream, writeStream);

  return buildEntry(dest);
}

/** Mueve un archivo a otra carpeta (o a la raíz si targetFolder es undefined). */
export function moveFile(relativePath: string, targetFolder?: string): FileEntry {
  const srcAbsolute = safePath(relativePath);
  if (!fs.existsSync(srcAbsolute) || !fs.statSync(srcAbsolute).isFile()) {
    throw new Error('File not found');
  }

  const filename = path.basename(relativePath);
  const targetDir = targetFolder ? safePath(targetFolder) : BASE_PATH;
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Evitar colisión de nombre en destino
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let finalName = filename;
  let counter = 1;
  const srcNorm = path.normalize(srcAbsolute);
  while (
    fs.existsSync(path.join(targetDir, finalName)) &&
    path.normalize(path.join(targetDir, finalName)) !== srcNorm
  ) {
    finalName = `${base}_${counter}${ext}`;
    counter++;
  }

  const destAbsolute = path.join(targetDir, finalName);
  fs.renameSync(srcAbsolute, destAbsolute);
  return buildEntry(destAbsolute);
}

/** Borra un archivo del disco. */
export function deleteFile(relativePath: string): void {
  const absolute = safePath(relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error('File not found');
  }
  fs.unlinkSync(absolute);
}

/** Crea una carpeta. Permite rutas anidadas como "Viajes/2024". */
export function createFolder(relativePath: string): void {
  // Permitir '/' para subcarpetas pero rechazar otros caracteres peligrosos
  if (!relativePath || /[\\<>:"|?*]/.test(relativePath)) {
    throw new Error('Invalid folder name');
  }
  const target = safePath(relativePath);
  if (fs.existsSync(target)) {
    throw new Error('Folder already exists');
  }
  fs.mkdirSync(target, { recursive: true });
}

/** Renombra una carpeta (solo cambia el último segmento del nombre). */
export function renameFolder(folderPath: string, newName: string): string {
  if (!newName || /[/\\<>:"|?*]/.test(newName)) {
    throw new Error('Invalid folder name');
  }
  const oldAbsolute = safePath(folderPath);
  if (!fs.existsSync(oldAbsolute) || !fs.statSync(oldAbsolute).isDirectory()) {
    throw new Error('Folder not found');
  }
  const parentDir = path.dirname(oldAbsolute);
  const newAbsolute = path.join(parentDir, newName);
  if (fs.existsSync(newAbsolute)) {
    throw new Error('A folder with that name already exists');
  }
  fs.renameSync(oldAbsolute, newAbsolute);
  // Devolver la nueva ruta relativa
  return toRelative(newAbsolute);
}

/** Borra una carpeta sólo si está vacía. */
export function deleteFolder(folderPath: string): void {
  if (!folderPath) throw new Error('Invalid folder path');
  const target = safePath(folderPath);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error('Folder not found');
  }
  const contents = fs.readdirSync(target);
  if (contents.length > 0) {
    throw new Error('Folder is not empty');
  }
  fs.rmdirSync(target);
}

/** Devuelve la ruta absoluta y los stats de un archivo. */
export function resolveFile(relativePath: string): { absolute: string; entry: FileEntry } {
  const absolute = safePath(relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error('File not found');
  }
  return { absolute, entry: buildEntry(absolute) };
}
