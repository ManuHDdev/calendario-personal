import { describe, it, expect } from 'vitest';
import { parsearPagina } from './milanuncios';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"ads":[
  {"id":"ma-70001","title":"Local en venta en Cáceres","subtype":"local",
   "price":85000,"surface":110,"url":"/local-en-venta-caceres-70001.htm",
   "municipality":"Cáceres","province":"Cáceres","description":"Local comercial, planta calle"},
  {"id":"ma-70002","title":"Traspaso bar en Cáceres","subtype":"traspaso",
   "price":30000,"surface":80,"url":"/traspaso-bar-caceres-70002.htm"}
]}}}
</script>
</body></html>`;

describe('milanuncios (locales) · parsearPagina', () => {
  it('lee el anuncio pero SIN coordenadas (las pone buscar vía geocodificación)', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1);

    const a = anuncios[0];
    expect(a.portal).toBe('milanuncios');
    expect(a.portalId).toBe('ma-70001');
    expect(a.tipo).toBe('local');
    expect(a.precio).toBe(85000);
    expect(a.superficieM2).toBe(110);
    expect(a.municipio).toBe('Cáceres');
    expect(a.latitud).toBeNull();
    expect(a.longitud).toBeNull();
    expect(a.precision).toBe('desconocida');
  });

  it('descarta los traspasos', () => {
    expect(parsearPagina(HTML).map((a) => a.portalId)).not.toContain('ma-70002');
  });
});
