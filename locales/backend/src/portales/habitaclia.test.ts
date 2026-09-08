import { describe, it, expect } from 'vitest';
import { parsearPagina } from './habitaclia';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"data":{"results":[
  {"id":"hc-9001","title":"Local comercial en Girona centro","subtype":"local",
   "price":175000,"surface":160,"url":"/local-en-venta-girona-centro-9001.htm",
   "coordinates":{"latitude":41.9831,"longitude":2.8249},
   "municipality":"Girona","province":"Girona","description":"Gran local a pie de calle"},
  {"id":"hc-9002","title":"Piso reformado en Girona","subtype":"piso",
   "price":210000,"surface":95,"url":"/piso-en-venta-girona-9002.htm"}
]}}}}
</script>
</body></html>`;

describe('habitaclia (locales) · parsearPagina', () => {
  it('lee un local del estado embebido por su forma', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1);

    const a = anuncios[0];
    expect(a.tipo).toBe('local');
    expect(a.portal).toBe('habitaclia');
    expect(a.portalId).toBe('hc-9001');
    expect(a.precio).toBe(175000);
    expect(a.superficieM2).toBe(160);
    expect(a.municipio).toBe('Girona');
    expect(a.latitud).toBeCloseTo(41.9831);
    expect(a.precision).toBe('aproximada');
    expect(a.url).toBe('https://www.habitaclia.com/local-en-venta-girona-centro-9001.htm');
  });

  it('rechaza los anuncios de vivienda', () => {
    expect(parsearPagina(HTML).map((a) => a.portalId)).not.toContain('hc-9002');
  });
});
