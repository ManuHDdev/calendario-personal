import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  canViewFile,
  canViewFolder,
  ensureBasePath,
  resolveMimeType,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  getAllFiles,
} from './fileService';
import { getDb, closeDb, setOwner, setGrantees, renamePathPrefix } from '../db';

const BASE_PATH = process.env.STORAGE_PATH as string;

const admin = { sub: 'admin-sub', isAdmin: true };
const alice = { sub: 'alice-sub', isAdmin: false };
const bob = { sub: 'bob-sub', isAdmin: false };

function resetDb(): void {
  const db = getDb();
  db.exec('DELETE FROM file_meta; DELETE FROM folder_meta; DELETE FROM grants;');
}

function touchFile(relativePath: string): void {
  const absolute = path.join(BASE_PATH, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, 'x');
}

beforeAll(() => {
  ensureBasePath();
});

afterAll(() => {
  closeDb();
  fs.rmSync(BASE_PATH, { recursive: true, force: true });
});

beforeEach(() => {
  resetDb();
});

describe('canViewFile', () => {
  it('legacy file (no owner recorded) is visible to anyone', () => {
    expect(canViewFile('legacy.jpg', alice)).toBe(true);
    expect(canViewFile('legacy.jpg', bob)).toBe(true);
  });

  it('admin sees everything regardless of ownership', () => {
    setOwner('file', 'private.jpg', alice.sub, 'alice');
    expect(canViewFile('private.jpg', admin)).toBe(true);
  });

  it('owner sees their own file, others do not', () => {
    setOwner('file', 'private.jpg', alice.sub, 'alice');
    expect(canViewFile('private.jpg', alice)).toBe(true);
    expect(canViewFile('private.jpg', bob)).toBe(false);
  });

  it('a direct grant on the file makes it visible to the grantee only', () => {
    setOwner('file', 'shared.jpg', alice.sub, 'alice');
    setGrantees('file', 'shared.jpg', [bob.sub], alice.sub);
    expect(canViewFile('shared.jpg', bob)).toBe(true);
    expect(canViewFile('shared.jpg', { sub: 'carol-sub', isAdmin: false })).toBe(false);
  });

  it('a grant on the parent folder makes files inside it visible', () => {
    setOwner('folder', 'Trip', alice.sub, 'alice');
    setOwner('file', 'Trip/photo.jpg', alice.sub, 'alice');
    setGrantees('folder', 'Trip', [bob.sub], alice.sub);
    expect(canViewFile('Trip/photo.jpg', bob)).toBe(true);
  });

  it('owning the parent folder implies visibility of files inside it', () => {
    setOwner('folder', 'Trip', alice.sub, 'alice');
    // archivo subido por bob dentro de una carpeta de alice
    setOwner('file', 'Trip/photo.jpg', bob.sub, 'bob');
    expect(canViewFile('Trip/photo.jpg', alice)).toBe(true);
  });
});

describe('canViewFolder', () => {
  it('legacy folder (no owner recorded) is visible to anyone', () => {
    expect(canViewFolder('LegacyFolder', alice)).toBe(true);
  });

  it('owned folder is visible to its owner and hidden from others with no grant/content', () => {
    setOwner('folder', 'Private', alice.sub, 'alice');
    touchFile('Private/photo.jpg');
    setOwner('file', 'Private/photo.jpg', alice.sub, 'alice');
    expect(canViewFolder('Private', alice)).toBe(true);
    expect(canViewFolder('Private', bob)).toBe(false);
  });

  it('folder with no direct grant is still shown if it contains a file visible to the viewer', () => {
    setOwner('folder', 'Mixed', alice.sub, 'alice');
    touchFile('Mixed/shared.jpg');
    setOwner('file', 'Mixed/shared.jpg', alice.sub, 'alice');
    setGrantees('file', 'Mixed/shared.jpg', [bob.sub], alice.sub);
    expect(canViewFolder('Mixed', bob)).toBe(true);
  });

  it('admin always sees folders regardless of ownership', () => {
    setOwner('folder', 'Private', alice.sub, 'alice');
    expect(canViewFolder('Private', admin)).toBe(true);
  });
});

describe('renamePathPrefix', () => {
  it('cascades path updates to the folder itself and all descendants, without touching similarly-named siblings', () => {
    setOwner('folder', 'Viajes', alice.sub, 'alice');
    setOwner('folder', 'Viajes/2024', alice.sub, 'alice');
    setOwner('file', 'Viajes/2024/foto.jpg', alice.sub, 'alice');
    setOwner('folder', 'Viajes2', bob.sub, 'bob'); // sibling con prefijo parecido, no debe verse afectado
    setGrantees('folder', 'Viajes/2024', [bob.sub], alice.sub);

    renamePathPrefix('Viajes', 'Excursiones');

    const db = getDb();
    const folderPaths = (db.prepare('SELECT path FROM folder_meta ORDER BY path').all() as { path: string }[]).map((r) => r.path);
    const filePaths = (db.prepare('SELECT path FROM file_meta').all() as { path: string }[]).map((r) => r.path);
    const grantPaths = (db.prepare('SELECT resource_path FROM grants').all() as { resource_path: string }[]).map((r) => r.resource_path);

    expect(folderPaths).toEqual(['Excursiones', 'Excursiones/2024', 'Viajes2']);
    expect(filePaths).toEqual(['Excursiones/2024/foto.jpg']);
    expect(grantPaths).toEqual(['Excursiones/2024']);
  });
});

describe('resolveMimeType', () => {
  it('respeta el tipo que declara el navegador cuando es concreto', () => {
    expect(resolveMimeType('foto.jpg', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveMimeType('IMG_0001.HEIC', 'image/heic')).toBe('image/heic');
  });

  it('deduce el tipo de la extensión cuando el navegador manda uno genérico', () => {
    // Windows no registra .heic, así que Chrome/Firefox suben las fotos de
    // iPhone como octet-stream o sin tipo.
    expect(resolveMimeType('IMG_0001.HEIC', 'application/octet-stream')).toBe('image/heic');
    expect(resolveMimeType('IMG_0001.heic', '')).toBe('image/heic');
    expect(resolveMimeType('foto.jpg', 'application/octet-stream')).toBe('image/jpeg');
  });

  it('normaliza mayúsculas y espacios del tipo declarado', () => {
    expect(resolveMimeType('foto.jpg', ' IMAGE/JPEG ')).toBe('image/jpeg');
  });

  it('devuelve octet-stream si ni el navegador ni la extensión lo dicen', () => {
    expect(resolveMimeType('archivo.desconocido', '')).toBe('application/octet-stream');
  });

  it('el tipo deducido de una foto de iPhone pasa el filtro de subida', () => {
    expect(ALLOWED_MIME_TYPES.has(resolveMimeType('IMG_0001.HEIC', ''))).toBe(true);
    expect(ALLOWED_MIME_TYPES.has(resolveMimeType('IMG_0002.heif', ''))).toBe(true);
  });

  it('sigue rechazando lo que no está permitido aunque la extensión sea conocida', () => {
    expect(ALLOWED_MIME_TYPES.has(resolveMimeType('script.sh', ''))).toBe(false);
    expect(ALLOWED_MIME_TYPES.has(resolveMimeType('doc.docx', ''))).toBe(false);
  });
});

// ── Tope de subida: los tres sitios deben coincidir ────────────────────────
//
// El límite vive en el backend (MAX_UPLOAD_BYTES) y en dos nginx distintos: el
// que va dentro de la imagen del frontend y el bloque /storage/ del nginx
// compartido del VPS. Si uno se queda corto, corta la subida con un 413 antes
// de que llegue al backend; si se le olvida la directiva, aplica el default de
// nginx (1 MB) y falla hasta una foto. Ya pasó una vez, así que se comprueba.

/** Sube directorios desde cwd hasta encontrar la raíz del monorepo. */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'nginx', 'calendario.conf'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`No se encuentra la raíz del repo subiendo desde ${process.cwd()}`);
}

/** "2048M" → bytes. nginx admite sufijo k/m/g, o bytes sin sufijo. */
function parseNginxSize(raw: string): number {
  const match = /^(\d+)([kmg]?)$/i.exec(raw.trim());
  if (!match) throw new Error(`Tamaño de nginx no reconocido: "${raw}"`);
  const factor = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[match[2].toLowerCase()] as number;
  return Number(match[1]) * factor;
}

/**
 * client_max_body_size del fichero. Con `insideLocation` se busca solo dentro
 * de ese bloque location — calendario.conf tiene además un límite global mucho
 * menor a nivel de server, que es justo el que NO queremos leer.
 */
function clientMaxBodySize(confPath: string, insideLocation?: string): number {
  let conf = fs.readFileSync(confPath, 'utf-8');

  if (insideLocation) {
    const start = conf.indexOf(`location ${insideLocation} {`);
    expect(start, `no hay bloque "location ${insideLocation}" en ${confPath}`).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = conf.indexOf('{', start); i < conf.length; i++) {
      if (conf[i] === '{') depth++;
      else if (conf[i] === '}' && --depth === 0) { end = i; break; }
    }
    conf = conf.slice(start, end);
  }

  const directive = /^\s*client_max_body_size\s+(\S+?);/m.exec(conf);
  expect(directive, `falta client_max_body_size en ${confPath} — nginx aplicaría su default de 1 MB`).not.toBeNull();
  return parseNginxSize((directive as RegExpExecArray)[1]);
}

describe('tope de subida alineado entre backend y los dos nginx', () => {
  it('el nginx de la imagen del frontend admite lo mismo que el backend', () => {
    const conf = path.join(repoRoot(), 'storage', 'frontend', 'nginx.conf');
    expect(clientMaxBodySize(conf, '/storage/api/')).toBe(MAX_UPLOAD_BYTES);
  });

  it('el bloque /storage/ del nginx compartido admite lo mismo que el backend', () => {
    const conf = path.join(repoRoot(), 'nginx', 'calendario.conf');
    expect(clientMaxBodySize(conf, '/storage/')).toBe(MAX_UPLOAD_BYTES);
  });

  it('el bloque /storage/ sobreescribe el límite global del server, que es menor', () => {
    const conf = path.join(repoRoot(), 'nginx', 'calendario.conf');
    // Si algún día el global sube por encima del de Storage, el override deja
    // de tener sentido y este test avisa de que hay que revisarlo.
    expect(clientMaxBodySize(conf)).toBeLessThan(MAX_UPLOAD_BYTES);
  });
});

describe('getAllFiles con rootOnly', () => {
  // La carpeta virtual "Sin carpeta" del sidebar: los archivos sueltos en la
  // raíz. No existe en disco, es este filtro.
  const admin2 = { sub: 'admin-sub', isAdmin: true };

  beforeEach(() => {
    for (const entry of fs.readdirSync(BASE_PATH)) {
      if (entry !== '.meta') fs.rmSync(path.join(BASE_PATH, entry), { recursive: true, force: true });
    }
    touchFile('suelta.jpg');
    touchFile('otra-suelta.png');
    touchFile('Viajes/dentro.jpg');
    touchFile('Viajes/2024/muy-dentro.jpg');
  });

  it('sin rootOnly devuelve todo, incluidas las subcarpetas', () => {
    const nombres = getAllFiles(undefined, admin2).map((f) => f.relativePath).sort();
    expect(nombres).toEqual([
      'Viajes/2024/muy-dentro.jpg',
      'Viajes/dentro.jpg',
      'otra-suelta.png',
      'suelta.jpg',
    ]);
  });

  it('con rootOnly devuelve solo los que no están en ninguna carpeta', () => {
    const archivos = getAllFiles(undefined, admin2, { rootOnly: true });
    expect(archivos.map((f) => f.relativePath).sort()).toEqual(['otra-suelta.png', 'suelta.jpg']);
    expect(archivos.every((f) => f.folder === null)).toBe(true);
  });
});
