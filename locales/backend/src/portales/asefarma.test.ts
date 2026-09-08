import { describe, it, expect } from 'vitest';
import { parsearPagina, asefarmaProvider } from './asefarma';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<article class="farmacia-listing">
  <a href="/farmacias-en-venta/detalle-farmacia-madrid-118"><h2>Farmacia en venta en Madrid capital</h2></a>
  <div>Facturaci&oacute;n 1.450.000 &euro;. Zona centro de Madrid. Precio 2.900.000 €.</div>
</article>
<article class="farmacia-listing">
  <a href="/farmacias-en-venta/detalle-farmacia-sevilla-119"><h2>Farmacia rural en Sevilla</h2></a>
  <div>Factura anual 320.000 euros. Provincia de Sevilla.</div>
</article>
</body></html>`;

describe('Asefarma · parsearPagina', () => {
  it('extrae dos farmacias con su facturación', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(2);
    expect(anuncios[0].portal).toBe('asefarma');
    expect(anuncios[0].tipo).toBe('farmacia');
    expect(anuncios[0].portalId).toBe('detalle-farmacia-madrid-118');
    expect(anuncios[0].facturacion).toBe(1450000);
    expect(anuncios[0].comunidad).toBe('madrid');
    expect(anuncios[1].facturacion).toBe(320000);
    expect(anuncios[1].comunidad).toBe('andalucia');
  });

  it('nunca inventa coordenadas para una farmacia intermediada', () => {
    for (const a of parsearPagina(HTML)) {
      expect(a.latitud).toBeNull();
      expect(a.longitud).toBeNull();
      expect(a.precision).toBe('desconocida');
    }
  });

  it('puedeBuscar devuelve { ok: false }: no rastreable desde servidor', () => {
    expect(asefarmaProvider.puedeBuscar({} as never).ok).toBe(false);
  });
});
