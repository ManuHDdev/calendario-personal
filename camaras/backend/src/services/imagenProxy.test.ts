import { describe, it, expect, vi } from 'vitest';
import { CacheImagenes, ImagenNoDisponibleError, type Capturador } from './imagenProxy';

const imagen = (t: number) => ({ cuerpo: Buffer.from('jpg'), tipo: 'image/jpeg', capturadaEn: t });

function crear(capturador: Capturador, reloj: { t: number }, extra: Partial<{ maxEntradas: number }> = {}) {
  return new CacheImagenes({
    ttlMs: 60_000,
    ttlErrorMs: 10_000,
    maxEntradas: extra.maxEntradas ?? 100,
    capturador,
    ahora: () => reloj.t,
  });
}

describe('CacheImagenes', () => {
  it('sirve de caché dentro del TTL y vuelve a descargar al caducar', async () => {
    const reloj = { t: 0 };
    const capturador = vi.fn<Capturador>(async () => imagen(reloj.t));
    const cache = crear(capturador, reloj);

    await cache.obtener('1', 'https://x.test/a.jpg');
    reloj.t = 59_000;
    await cache.obtener('1', 'https://x.test/a.jpg');
    expect(capturador).toHaveBeenCalledTimes(1);

    reloj.t = 61_000;
    await cache.obtener('1', 'https://x.test/a.jpg');
    expect(capturador).toHaveBeenCalledTimes(2);
  });

  it('peticiones simultáneas de la misma cámara comparten una sola descarga', async () => {
    const reloj = { t: 0 };
    const capturador = vi.fn<Capturador>(() => new Promise((r) => setTimeout(() => r(imagen(0)), 10)));
    const cache = crear(capturador, reloj);

    await Promise.all([cache.obtener('1', 'u'), cache.obtener('1', 'u'), cache.obtener('1', 'u')]);
    expect(capturador).toHaveBeenCalledTimes(1);
  });

  it('recuerda un fallo un rato corto para no martillear el origen', async () => {
    const reloj = { t: 0 };
    const capturador = vi.fn<Capturador>(async () => {
      throw new ImagenNoDisponibleError('caído');
    });
    const cache = crear(capturador, reloj);

    await expect(cache.obtener('1', 'u')).rejects.toThrow('caído');
    reloj.t = 5_000;
    await expect(cache.obtener('1', 'u')).rejects.toThrow('caído');
    expect(capturador).toHaveBeenCalledTimes(1);

    reloj.t = 11_000;
    await expect(cache.obtener('1', 'u')).rejects.toThrow('caído');
    expect(capturador).toHaveBeenCalledTimes(2);
  });

  it('envuelve errores inesperados en ImagenNoDisponibleError', async () => {
    const cache = crear(async () => { throw new Error('socket hang up'); }, { t: 0 });
    await expect(cache.obtener('1', 'u')).rejects.toBeInstanceOf(ImagenNoDisponibleError);
  });

  it('expulsa las entradas más antiguas al superar el máximo', async () => {
    const reloj = { t: 0 };
    const cache = crear(async () => imagen(0), reloj, { maxEntradas: 2 });
    await cache.obtener('a', 'u');
    await cache.obtener('b', 'u');
    await cache.obtener('c', 'u');
    expect(cache.tamano).toBe(2);
  });
});
