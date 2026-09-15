import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// PARAISOS_IMAGES_PATH debe fijarse ANTES de importar el módulo: la ruta se
// resuelve una sola vez a nivel de módulo (const IMAGES_PATH = ...). Se hace
// en beforeAll con import() dinámico en vez de top-level await para no
// depender de module=esnext en tsconfig.
let tmpDir: string;
let deleteImageIfManaged: typeof import('./imageService').deleteImageIfManaged;
let getImagePath: typeof import('./imageService').getImagePath;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paraisos-images-test-'));
  process.env.PARAISOS_IMAGES_PATH = tmpDir;
  const mod = await import('./imageService');
  deleteImageIfManaged = mod.deleteImageIfManaged;
  getImagePath = mod.getImagePath;
});

describe('deleteImageIfManaged', () => {
  let filePath: string;
  const filename = 'test-image.jpg';

  beforeEach(() => {
    filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, 'contenido de prueba');
  });

  afterEach(() => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    vi.restoreAllMocks();
  });

  it('borra el fichero cuando la URL es una de nuestras imágenes gestionadas', () => {
    expect(fs.existsSync(filePath)).toBe(true);

    deleteImageIfManaged(`/paraisos/api/images/${filename}`);

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('ignora una URL externa y no toca el disco', () => {
    deleteImageIfManaged('https://example.com/foto.jpg');

    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('ignora null', () => {
    expect(() => deleteImageIfManaged(null)).not.toThrow();
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('ignora undefined', () => {
    expect(() => deleteImageIfManaged(undefined)).not.toThrow();
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('ignora una cadena vacía', () => {
    expect(() => deleteImageIfManaged('')).not.toThrow();
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('no lanza si el fichero gestionado ya no existe en disco', () => {
    fs.unlinkSync(filePath);

    expect(() => deleteImageIfManaged(`/paraisos/api/images/${filename}`)).not.toThrow();
  });

  it('no lanza y no borra nada si el nombre de fichero intenta path traversal', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // getImagePath rechaza '..' — deleteImageIfManaged debe apoyarse en ese
    // mismo guard y no lanzar, simplemente no borrar nada.
    expect(() => deleteImageIfManaged('/paraisos/api/images/../../etc/passwd')).not.toThrow();
    expect(getImagePath('../../etc/passwd')).toBeNull();
    expect(fs.existsSync(filePath)).toBe(true);

    errorSpy.mockRestore();
  });

  it('no borra si el filename tras el prefijo está vacío', () => {
    expect(() => deleteImageIfManaged('/paraisos/api/images/')).not.toThrow();
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
