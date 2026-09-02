import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
  createUpload,
  appendChunk,
  completeUpload,
  cancelUpload,
  getUploadProgress,
  sweepStaleUploads,
  UploadError,
} from './uploadService';
import { ensureBasePath, getAllFiles } from './fileService';
import { getDb, closeDb } from '../db';

const BASE_PATH = process.env.STORAGE_PATH as string;
const PARTS_DIR = path.join(BASE_PATH, '.meta', 'uploads');

const owner = { sub: 'owner-sub', username: 'propietario' };
const otro = { sub: 'otro-sub', username: 'otro' };
const viewer = { sub: owner.sub, isAdmin: true };

function bytes(n: number, fill = 0x61): Buffer {
  return Buffer.alloc(n, fill);
}

/** Manda un buffer como si fuera el cuerpo de la petición. */
function body(buf: Buffer): Readable {
  return Readable.from([buf]);
}

async function subirEntero(nombre: string, contenido: Buffer, folder?: string) {
  const { uploadId } = createUpload({
    filename: nombre,
    mimeType: 'video/quicktime',
    totalBytes: contenido.length,
    folder,
    owner,
  });
  await appendChunk(uploadId, owner.sub, 0, body(contenido));
  return completeUpload(uploadId, owner.sub);
}

beforeAll(() => {
  ensureBasePath();
});

afterAll(() => {
  closeDb();
  fs.rmSync(BASE_PATH, { recursive: true, force: true });
});

beforeEach(() => {
  getDb().exec('DELETE FROM upload_session; DELETE FROM file_meta; DELETE FROM grants;');
  fs.rmSync(PARTS_DIR, { recursive: true, force: true });
  for (const entry of fs.readdirSync(BASE_PATH)) {
    if (entry !== '.meta') fs.rmSync(path.join(BASE_PATH, entry), { recursive: true, force: true });
  }
});

describe('subida troceada', () => {
  it('junta los trozos en un archivo idéntico al original', async () => {
    const contenido = Buffer.concat([bytes(1000, 1), bytes(1000, 2), bytes(500, 3)]);
    const { uploadId } = createUpload({
      filename: 'IMG_0001.MOV',
      mimeType: 'video/quicktime',
      totalBytes: contenido.length,
      owner,
    });

    await appendChunk(uploadId, owner.sub, 0, body(contenido.subarray(0, 1000)));
    await appendChunk(uploadId, owner.sub, 1000, body(contenido.subarray(1000, 2000)));
    const progreso = await appendChunk(uploadId, owner.sub, 2000, body(contenido.subarray(2000)));
    expect(progreso.receivedBytes).toBe(contenido.length);

    const entry = completeUpload(uploadId, owner.sub);
    expect(entry.name).toBe('IMG_0001.MOV');
    expect(entry.size).toBe(contenido.length);
    expect(fs.readFileSync(path.join(BASE_PATH, 'IMG_0001.MOV')).equals(contenido)).toBe(true);
  });

  it('reanuda por donde iba tras un corte, sin repetir lo ya subido', async () => {
    const contenido = Buffer.concat([bytes(600, 7), bytes(400, 8)]);
    const { uploadId } = createUpload({
      filename: 'corte.mov',
      mimeType: 'video/quicktime',
      totalBytes: contenido.length,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(contenido.subarray(0, 600)));

    // El cliente vuelve tras el corte y pregunta por dónde iba.
    expect(getUploadProgress(uploadId, owner.sub).receivedBytes).toBe(600);

    await appendChunk(uploadId, owner.sub, 600, body(contenido.subarray(600)));
    completeUpload(uploadId, owner.sub);
    expect(fs.readFileSync(path.join(BASE_PATH, 'corte.mov')).equals(contenido)).toBe(true);
  });

  it('un trozo reenviado no se duplica: devuelve el estado real y descarta el cuerpo', async () => {
    const { uploadId } = createUpload({
      filename: 'reintento.mov',
      mimeType: 'video/quicktime',
      totalBytes: 300,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(200)));

    // Se perdió la respuesta y el cliente reenvía el mismo trozo.
    const progreso = await appendChunk(uploadId, owner.sub, 0, body(bytes(200)));
    expect(progreso.receivedBytes).toBe(200);

    await appendChunk(uploadId, owner.sub, 200, body(bytes(100)));
    completeUpload(uploadId, owner.sub);
    expect(fs.statSync(path.join(BASE_PATH, 'reintento.mov')).size).toBe(300);
  });

  it('rechaza un trozo que deja un hueco', async () => {
    const { uploadId } = createUpload({
      filename: 'hueco.mov',
      mimeType: 'video/quicktime',
      totalBytes: 300,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(100)));

    await expect(appendChunk(uploadId, owner.sub, 250, body(bytes(50)))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('recorta el .part si tiene más bytes de los confirmados (proceso muerto a medias)', async () => {
    const { uploadId } = createUpload({
      filename: 'medias.mov',
      mimeType: 'video/quicktime',
      totalBytes: 200,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(100, 1)));

    // Simula el escenario: se escribió en disco pero no se llegó a confirmar,
    // así que el .part va por delante de la base de datos.
    fs.appendFileSync(path.join(PARTS_DIR, `${uploadId}.part`), bytes(40, 9));

    await appendChunk(uploadId, owner.sub, 100, body(bytes(100, 2)));
    const entry = completeUpload(uploadId, owner.sub);

    expect(entry.size).toBe(200);
    const escrito = fs.readFileSync(path.join(BASE_PATH, 'medias.mov'));
    expect(escrito.subarray(0, 100).equals(bytes(100, 1))).toBe(true);
    expect(escrito.subarray(100).equals(bytes(100, 2))).toBe(true);
  });

  it('no cierra una subida incompleta', async () => {
    const { uploadId } = createUpload({
      filename: 'incompleta.mov',
      mimeType: 'video/quicktime',
      totalBytes: 500,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(100)));

    expect(() => completeUpload(uploadId, owner.sub)).toThrow(UploadError);
    expect(fs.existsSync(path.join(BASE_PATH, 'incompleta.mov'))).toBe(false);
  });

  it('no acepta más bytes de los declarados', async () => {
    const { uploadId } = createUpload({
      filename: 'pasada.mov',
      mimeType: 'video/quicktime',
      totalBytes: 100,
      owner,
    });
    await expect(appendChunk(uploadId, owner.sub, 0, body(bytes(150)))).rejects.toMatchObject({
      statusCode: 413,
    });
  });

  it('rechaza tipos no admitidos y tamaños imposibles antes de gastar ancho de banda', () => {
    expect(() =>
      createUpload({ filename: 'x.exe', mimeType: 'application/x-msdownload', totalBytes: 10, owner }),
    ).toThrow(UploadError);
    expect(() =>
      createUpload({ filename: 'x.mov', mimeType: 'video/quicktime', totalBytes: 0, owner }),
    ).toThrow(UploadError);
  });

  it('una subida es privada: otro usuario no puede ni consultarla ni continuarla', async () => {
    const { uploadId } = createUpload({
      filename: 'mia.mov',
      mimeType: 'video/quicktime',
      totalBytes: 100,
      owner,
    });
    expect(() => getUploadProgress(uploadId, otro.sub)).toThrow(UploadError);
    await expect(appendChunk(uploadId, otro.sub, 0, body(bytes(100)))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(() => cancelUpload(uploadId, otro.sub)).toThrow(UploadError);
  });

  it('cancelar borra el .part y la sesión', async () => {
    const { uploadId } = createUpload({
      filename: 'cancelada.mov',
      mimeType: 'video/quicktime',
      totalBytes: 100,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(50)));
    cancelUpload(uploadId, owner.sub);

    expect(fs.existsSync(path.join(PARTS_DIR, `${uploadId}.part`))).toBe(false);
    expect(() => getUploadProgress(uploadId, owner.sub)).toThrow(UploadError);
  });

  it('el barrido se lleva las subidas abandonadas y sus .part', async () => {
    const { uploadId } = createUpload({
      filename: 'abandonada.mov',
      mimeType: 'video/quicktime',
      totalBytes: 100,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(50)));

    // Aún reciente: no se toca.
    expect(sweepStaleUploads()).toBe(0);
    // Una semana después sí.
    expect(sweepStaleUploads(Date.now() + 7 * 24 * 60 * 60 * 1000)).toBe(1);
    expect(fs.existsSync(path.join(PARTS_DIR, `${uploadId}.part`))).toBe(false);
  });

  it('el archivo terminado queda en la carpeta indicada y con su dueño', async () => {
    const entry = await subirEntero('en-carpeta.mov', bytes(300), 'Viajes');
    expect(entry.folder).toBe('Viajes');
    expect(entry.ownerId).toBe(owner.sub);
    expect(fs.existsSync(path.join(BASE_PATH, 'Viajes', 'en-carpeta.mov'))).toBe(true);
  });

  it('no pisa un archivo existente: lo renombra', async () => {
    await subirEntero('repe.mov', bytes(100));
    const segundo = await subirEntero('repe.mov', bytes(120));

    expect(segundo.name).toBe('repe_1.mov');
    expect(fs.statSync(path.join(BASE_PATH, 'repe.mov')).size).toBe(100);
    expect(fs.statSync(path.join(BASE_PATH, 'repe_1.mov')).size).toBe(120);
  });

  it('los .part no asoman en el listado de archivos', async () => {
    const { uploadId } = createUpload({
      filename: 'a-medias.mov',
      mimeType: 'video/quicktime',
      totalBytes: 500,
      owner,
    });
    await appendChunk(uploadId, owner.sub, 0, body(bytes(100)));

    const listado = getAllFiles(undefined, viewer);
    expect(listado.some((f) => f.name.includes('.part'))).toBe(false);
    expect(listado.some((f) => f.name === 'a-medias.mov')).toBe(false);
  });
});
