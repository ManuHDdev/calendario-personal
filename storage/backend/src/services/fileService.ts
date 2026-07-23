import fs from 'fs';
import path from 'path';
import { v5 as uuidv5 } from 'uuid';
import mime from 'mime-types';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  getOwner,
  setOwner,
  deleteOwner,
  updateResourcePath,
  renamePathPrefix,
  hasDirectGrant,
  hasFolderGrantOnAny,
  deleteGrants,
} from '../db';

// path.resolve normaliza los separadores al estilo de la plataforma — si
// STORAGE_PATH llega con barras "/" en Windows, una comparación de prefijos
// contra path.join (que usa "\") fallaría y safePath() lanzaría "Path
// traversal detected" para archivos legítimos.
const BASE_PATH = path.resolve(process.env.STORAGE_PATH || '/mnt/storage-ssd');

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
const HIDDEN_DIRS = new Set(['lost+found', '.Trash-1000', '$RECYCLE.BIN', '.meta']);

export interface FileEntry {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  mimeType: string;
  createdAt: string;
  /** Ruta relativa completa de la carpeta padre, ej. "Dron/Fotos" o null si está en raíz */
  folder: string | null;
  /** Ausente si el archivo es anterior a la función de permisos (legado, visible para todos) */
  ownerId?: string;
  ownerUsername?: string;
}

export interface Viewer {
  sub: string;
  isAdmin: boolean;
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
  const owner = getOwner('file', relativePath);

  return {
    id: uuidv5(relativePath, UUID_NAMESPACE),
    name,
    relativePath,
    size: stat.size,
    mimeType: detected,
    createdAt: stat.birthtime.toISOString(),
    folder,
    ownerId: owner?.owner_id,
    ownerUsername: owner?.owner_username,
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

/** ¿Existe esa carpeta en disco? */
export function folderExists(relativePath: string): boolean {
  try {
    const absolute = safePath(relativePath);
    return fs.existsSync(absolute) && fs.statSync(absolute).isDirectory();
  } catch {
    return false;
  }
}

/** Cadena de una ruta y todos sus ancestros, empezando por ella misma. */
function pathChain(relativePath: string): string[] {
  const parts = relativePath.split('/').filter(Boolean);
  const chain: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    chain.push(parts.slice(0, i).join('/'));
  }
  return chain;
}

function folderChainOf(relativePath: string): string[] {
  const segments = relativePath.split('/');
  if (segments.length <= 1) return [];
  return pathChain(segments.slice(0, -1).join('/'));
}

/** ¿Puede `viewer` ver este archivo concreto? */
export function canViewFile(relativePath: string, viewer: Viewer): boolean {
  if (viewer.isAdmin) return true;

  const owner = getOwner('file', relativePath);
  if (!owner) return true; // sin propietario registrado = legado, visible para todos

  if (owner.owner_id === viewer.sub) return true;
  if (hasDirectGrant('file', relativePath, viewer.sub)) return true;

  const folderChain = folderChainOf(relativePath);
  if (folderChain.some((f) => getOwner('folder', f)?.owner_id === viewer.sub)) return true;
  if (hasFolderGrantOnAny(folderChain, viewer.sub)) return true;

  return false;
}

/** ¿Puede `viewer` ver esta carpeta (aparece en el árbol de navegación)? */
export function canViewFolder(folderPath: string, viewer: Viewer): boolean {
  if (viewer.isAdmin) return true;

  const chain = pathChain(folderPath);
  if (chain.some((f) => getOwner('folder', f)?.owner_id === viewer.sub)) return true;
  if (hasFolderGrantOnAny(chain, viewer.sub)) return true;

  const owner = getOwner('folder', folderPath);
  if (!owner) return true; // carpeta legado sin propietario registrado, visible para todos

  // Carpeta nueva de otro propietario sin grant: solo se muestra si contiene
  // algo que el viewer sí puede ver (para no ocultar rutas intermedias).
  return walkFilesRaw(safePath(folderPath)).some((entry) => canViewFile(entry.relativePath, viewer));
}

function walkFilesRaw(startDir: string): FileEntry[] {
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

  walk(startDir);
  return results;
}

/** ¿Puede `viewer` mover/renombrar/borrar este archivo? (legado sin dueño = sin restricción, como antes) */
export function canMutateFile(relativePath: string, viewer: Viewer): boolean {
  if (viewer.isAdmin) return true;
  const owner = getOwner('file', relativePath);
  if (!owner) return true;
  return owner.owner_id === viewer.sub;
}

/** ¿Puede `viewer` renombrar/borrar esta carpeta? (legado sin dueño = sin restricción, como antes) */
export function canMutateFolder(folderPath: string, viewer: Viewer): boolean {
  if (viewer.isAdmin) return true;
  const owner = getOwner('folder', folderPath);
  if (!owner) return true;
  return owner.owner_id === viewer.sub;
}

/**
 * Devuelve todos los archivos permitidos y visibles para `viewer`.
 * Si se especifica folder, sólo devuelve los archivos dentro de esa carpeta
 * (incluyendo subcarpetas). Sin folder devuelve TODOS los archivos del disco.
 */
export function getAllFiles(folder: string | undefined, viewer: Viewer): FileEntry[] {
  const startDir = folder ? safePath(folder) : BASE_PATH;
  if (folder && (!fs.existsSync(startDir) || !fs.statSync(startDir).isDirectory())) return [];

  const results = walkFilesRaw(startDir);
  if (viewer.isAdmin) return results;
  return results.filter((file) => canViewFile(file.relativePath, viewer));
}

export interface FolderEntry {
  path: string;
  ownerId?: string;
  ownerUsername?: string;
}

/** Devuelve todas las carpetas del disco visibles para `viewer`.
 *  Ej: [{ path: "Dron" }, { path: "Dron/Fotos" }, { path: "Viajes" }, { path: "Viajes/2024" }]
 */
export function getFolders(viewer: Viewer): FolderEntry[] {
  const paths: string[] = [];

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
      paths.push(rel);
      walkDirs(path.join(dir, entry.name), rel);
    }
  }

  walkDirs(BASE_PATH, '');
  paths.sort();
  const visible = viewer.isAdmin ? paths : paths.filter((folderPath) => canViewFolder(folderPath, viewer));
  return visible.map((folderPath) => {
    const owner = getOwner('folder', folderPath);
    return { path: folderPath, ownerId: owner?.owner_id, ownerUsername: owner?.owner_username };
  });
}

/** Guarda un archivo. Devuelve el FileEntry resultante. */
export async function saveFile(
  filename: string,
  mimeType: string,
  stream: Readable,
  folder: string | undefined,
  owner: { sub: string; username: string },
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

  const entry = buildEntry(dest);
  setOwner('file', entry.relativePath, owner.sub, owner.username);
  return { ...entry, ownerId: owner.sub, ownerUsername: owner.username };
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
  const entry = buildEntry(destAbsolute);
  updateResourcePath('file', relativePath, entry.relativePath);
  return entry;
}

/** Borra un archivo del disco. */
/**
 * En Windows, borrar un archivo justo después de servirlo (thumbnail/preview)
 * puede fallar con EPERM/EBUSY por un bloqueo transitorio del SO mientras
 * libera el handle — no ocurre en Linux (producción), pero reintentamos unas
 * pocas veces con una espera corta para que el borrado no falle en local.
 */
async function unlinkWithRetry(absolute: string, retries = 4, delayMs = 75): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.unlinkSync(absolute);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= retries || (code !== 'EPERM' && code !== 'EBUSY')) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function deleteFile(relativePath: string): Promise<void> {
  const absolute = safePath(relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error('File not found');
  }
  await unlinkWithRetry(absolute);
  deleteOwner('file', relativePath);
  deleteGrants('file', relativePath);
}

/** Crea una carpeta. Permite rutas anidadas como "Viajes/2024". */
export function createFolder(relativePath: string, owner: { sub: string; username: string }): void {
  // Permitir '/' para subcarpetas pero rechazar otros caracteres peligrosos
  if (!relativePath || /[\\<>:"|?*]/.test(relativePath)) {
    throw new Error('Invalid folder name');
  }
  const target = safePath(relativePath);
  if (fs.existsSync(target)) {
    throw new Error('Folder already exists');
  }
  fs.mkdirSync(target, { recursive: true });
  setOwner('folder', relativePath, owner.sub, owner.username);
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
  const newPath = toRelative(newAbsolute);
  // El rename arrastra todo el subárbol en disco: reescribir el prefijo de
  // propietarios y permisos de la carpeta y de todo lo que cuelgue de ella.
  renamePathPrefix(folderPath, newPath);
  return newPath;
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
  deleteOwner('folder', folderPath);
  deleteGrants('folder', folderPath);
}

/** Devuelve la ruta absoluta y los stats de un archivo. */
export function resolveFile(relativePath: string): { absolute: string; entry: FileEntry } {
  const absolute = safePath(relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error('File not found');
  }
  return { absolute, entry: buildEntry(absolute) };
}
