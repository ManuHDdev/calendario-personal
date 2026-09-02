import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import {
  insertUploadSession,
  getUploadSession,
  setUploadReceivedBytes,
  deleteUploadSession,
  listStaleUploadSessions,
  setOwner,
  type UploadSessionRow,
} from '../db';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  resolveDestination,
  describeFile,
  type FileEntry,
} from './fileService';

const BASE_PATH = path.resolve(process.env.STORAGE_PATH || '/mnt/storage-ssd');
const PARTS_DIR = path.join(BASE_PATH, '.meta', 'uploads');

/**
 * Tamaño de trozo. 8 MB es un equilibrio: bastante grande para que subir 2 GB
 * no sean miles de peticiones, y bastante pequeño para que perder uno por un
 * corte de red cueste segundos, no minutos.
 */
export const CHUNK_BYTES = 8 * 1024 * 1024;

/** Margen sobre CHUNK_BYTES: un trozo mayor que esto es un cliente que miente. */
const MAX_CHUNK_BYTES = CHUNK_BYTES * 2;

/** Una subida abandonada más de esto se barre junto con su .part. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export class UploadError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

function partPath(id: string): string {
  return path.join(PARTS_DIR, `${id}.part`);
}

function ensurePartsDir(): void {
  if (!fs.existsSync(PARTS_DIR)) fs.mkdirSync(PARTS_DIR, { recursive: true });
}

/** Bytes realmente escritos en el .part (0 si aún no existe). */
function partSize(id: string): number {
  try {
    return fs.statSync(partPath(id)).size;
  } catch {
    return 0;
  }
}

export interface UploadProgress {
  uploadId: string;
  receivedBytes: number;
  totalBytes: number;
  chunkBytes: number;
}

function toProgress(session: UploadSessionRow): UploadProgress {
  return {
    uploadId: session.id,
    receivedBytes: session.received_bytes,
    totalBytes: session.total_bytes,
    chunkBytes: CHUNK_BYTES,
  };
}

/**
 * Abre una subida troceada. Valida aquí todo lo que se pueda validar antes de
 * gastar ancho de banda: tipo y tamaño. De poco sirve descubrir a los 2 GB que
 * el formato no estaba admitido.
 */
export function createUpload(input: {
  filename: string;
  mimeType: string;
  totalBytes: number;
  folder?: string;
  owner: { sub: string; username: string };
}): UploadProgress {
  const { filename, mimeType, totalBytes, folder, owner } = input;

  if (!filename.trim()) throw new UploadError(400, 'Falta el nombre del archivo');
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) {
    throw new UploadError(400, 'Tamaño de archivo inválido');
  }
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw new UploadError(413, `El archivo supera el límite de ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new UploadError(415, `MIME type not allowed: ${mimeType}`);
  }

  sweepStaleUploads();
  ensurePartsDir();

  const id = randomUUID();
  insertUploadSession({
    id,
    filename: path.basename(filename),
    mime_type: mimeType,
    total_bytes: totalBytes,
    folder: folder ?? null,
    owner_id: owner.sub,
    owner_username: owner.username,
  });
  fs.writeFileSync(partPath(id), '');

  return { uploadId: id, receivedBytes: 0, totalBytes, chunkBytes: CHUNK_BYTES };
}

/** Sesión del usuario, o error. Nadie puede tocar la subida de otro. */
function requireOwnSession(id: string, ownerId: string): UploadSessionRow {
  const session = getUploadSession(id);
  // Mismo 404 para "no existe" y "no es tuya": no hace falta confirmarle a
  // nadie que un id ajeno existe.
  if (!session || session.owner_id !== ownerId) throw new UploadError(404, 'Subida no encontrada');
  return session;
}

/** Por dónde va la subida — lo que consulta el cliente para reanudar. */
export function getUploadProgress(id: string, ownerId: string): UploadProgress {
  return toProgress(requireOwnSession(id, ownerId));
}

/**
 * Añade un trozo en `offset`. El cliente manda siempre desde dónde escribe, y
 * el servidor solo acepta el trozo que continúa justo donde se quedó:
 *
 * - offset === received  → se escribe.
 * - offset < received    → un reintento cuya respuesta se perdió por el
 *                          camino. Se descarta el cuerpo y se devuelve el
 *                          estado real, para que el cliente se resitúe en vez
 *                          de duplicar datos.
 * - offset > received    → hay un hueco; 409 y que el cliente pregunte.
 */
export async function appendChunk(
  id: string,
  ownerId: string,
  offset: number,
  chunk: Readable,
): Promise<UploadProgress> {
  const session = requireOwnSession(id, ownerId);

  if (!Number.isInteger(offset) || offset < 0) throw new UploadError(400, 'Offset inválido');

  if (offset < session.received_bytes) {
    chunk.resume();
    return toProgress(session);
  }
  if (offset > session.received_bytes) {
    chunk.resume();
    throw new UploadError(409, `Hueco en la subida: el servidor tiene ${session.received_bytes} bytes`);
  }

  // El .part puede tener MÁS bytes que received_bytes si el proceso murió
  // entre escribir y confirmar en la base de datos. La base de datos manda:
  // se recorta el sobrante antes de escribir para no duplicar nada.
  ensurePartsDir();
  if (partSize(id) !== session.received_bytes) {
    fs.truncateSync(partPath(id), session.received_bytes);
  }

  // Transform en vez de contar a mano sobre el evento 'data': así la escritura
  // en disco ejerce contrapresión sobre la red y no se acumula el trozo entero
  // en memoria si el disco va más lento que la conexión.
  let written = 0;
  const limiter = new Transform({
    transform(buf: Buffer, _encoding, callback) {
      written += buf.length;
      if (written > MAX_CHUNK_BYTES) {
        callback(new UploadError(413, 'Trozo demasiado grande'));
        return;
      }
      if (session.received_bytes + written > session.total_bytes) {
        callback(new UploadError(413, 'La subida excede el tamaño declarado'));
        return;
      }
      callback(null, buf);
    },
  });

  const out = fs.createWriteStream(partPath(id), { flags: 'a' });
  // Se deja el .part como esté si esto falla: el truncado del próximo intento
  // lo recorta a received_bytes, así que un trozo a medias nunca contamina la
  // subida.
  await pipeline(chunk, limiter, out);

  const received = session.received_bytes + written;
  setUploadReceivedBytes(id, received);
  return { ...toProgress(session), receivedBytes: received };
}

/**
 * Cierra la subida: mueve el .part a su sitio definitivo. El rename es atómico
 * (mismo sistema de ficheros), así que el archivo aparece entero o no aparece.
 */
export function completeUpload(id: string, ownerId: string): FileEntry {
  const session = requireOwnSession(id, ownerId);

  if (session.received_bytes !== session.total_bytes) {
    throw new UploadError(
      409,
      `Subida incompleta: ${session.received_bytes} de ${session.total_bytes} bytes`,
    );
  }
  const onDisk = partSize(id);
  if (onDisk !== session.total_bytes) {
    throw new UploadError(409, `El archivo en servidor tiene ${onDisk} bytes, se esperaban ${session.total_bytes}`);
  }

  const dest = resolveDestination(session.filename, session.folder ?? undefined);
  fs.renameSync(partPath(id), dest);
  deleteUploadSession(id);

  const entry = describeFile(dest);
  setOwner('file', entry.relativePath, session.owner_id, session.owner_username);
  return { ...entry, ownerId: session.owner_id, ownerUsername: session.owner_username };
}

/** Cancela una subida y borra su .part. */
export function cancelUpload(id: string, ownerId: string): void {
  requireOwnSession(id, ownerId);
  fs.rmSync(partPath(id), { force: true });
  deleteUploadSession(id);
}

/**
 * Barre subidas abandonadas. Sin esto, cada subida que alguien empieza y no
 * termina deja su .part ocupando disco para siempre.
 */
export function sweepStaleUploads(now: number = Date.now()): number {
  const cutoff = new Date(now - STALE_AFTER_MS).toISOString();
  let removed = 0;
  for (const session of listStaleUploadSessions(cutoff)) {
    fs.rmSync(partPath(session.id), { force: true });
    deleteUploadSession(session.id);
    removed++;
  }
  return removed;
}
