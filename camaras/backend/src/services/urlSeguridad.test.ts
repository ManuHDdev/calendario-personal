import { describe, it, expect } from 'vitest';
import { esIpPrivada, validarUrlPublica, esUrlHttp, UrlNoPermitidaError } from './urlSeguridad';

describe('esIpPrivada', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1',
  ])('%s es privada', (ip) => expect(esIpPrivada(ip)).toBe(true));

  it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '193.144.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    '%s es pública', (ip) => expect(esIpPrivada(ip)).toBe(false),
  );

  it('texto que no es una IP se trata como privado', () => {
    expect(esIpPrivada('no-es-ip')).toBe(true);
  });
});

describe('validarUrlPublica', () => {
  const publico = async () => ['8.8.8.8'];

  it('acepta una URL https que resuelve a IP pública', async () => {
    const url = await validarUrlPublica('https://camaras.ejemplo.es/a.jpg', publico);
    expect(url.hostname).toBe('camaras.ejemplo.es');
  });

  it('rechaza protocolos que no son http(s)', async () => {
    await expect(validarUrlPublica('file:///etc/passwd', publico)).rejects.toBeInstanceOf(UrlNoPermitidaError);
    await expect(validarUrlPublica('ftp://x.test/a.jpg', publico)).rejects.toBeInstanceOf(UrlNoPermitidaError);
  });

  it('rechaza IP literal privada y metadatos de nube', async () => {
    await expect(validarUrlPublica('http://127.0.0.1:3000/x', publico)).rejects.toThrow(/no pública/);
    await expect(validarUrlPublica('http://169.254.169.254/latest/meta-data', publico)).rejects.toThrow(/no pública/);
    await expect(validarUrlPublica('http://[::1]/x', publico)).rejects.toThrow(/no pública/);
  });

  it('rechaza un nombre que resuelve a una IP privada', async () => {
    await expect(validarUrlPublica('http://interno.ejemplo.es/a.jpg', async () => ['10.0.0.5'])).rejects.toThrow(/no pública/);
  });

  it('rechaza si CUALQUIERA de las IP resueltas es privada', async () => {
    await expect(
      validarUrlPublica('http://mixto.ejemplo.es/a.jpg', async () => ['8.8.8.8', '192.168.0.1']),
    ).rejects.toThrow(/no pública/);
  });

  it('rechaza un host que no resuelve y credenciales en la URL', async () => {
    await expect(validarUrlPublica('http://nada.ejemplo.es/', async () => [])).rejects.toThrow(/resolver/);
    await expect(validarUrlPublica('http://user:pw@x.test/', publico)).rejects.toThrow(/credenciales/);
  });

  it('rechaza texto que no es URL', async () => {
    await expect(validarUrlPublica('esto no es una url', publico)).rejects.toThrow(/no válida/);
  });
});

describe('esUrlHttp', () => {
  it('solo acepta http(s)', () => {
    expect(esUrlHttp('https://a.test/x')).toBe(true);
    expect(esUrlHttp('javascript:alert(1)')).toBe(false);
    expect(esUrlHttp('nada')).toBe(false);
  });
});
