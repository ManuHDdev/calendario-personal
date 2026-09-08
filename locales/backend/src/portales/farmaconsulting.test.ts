import { describe, it, expect } from 'vitest';
import { parsearPagina } from './farmaconsulting';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<div class="oportunidad-card">
  <a href="/oportunidades/farmacia-ref-2451">
    <h3>Farmacia en venta en Toledo</h3>
  </a>
  <p>Referencia 2451. Ubicada en Toledo, Castilla-La Mancha.
     Facturaci&oacute;n 780.000 &#8364; anuales. Precio de venta 1.150.000 €. Superficie 95 m&#xB2;.</p>
</div>
<div class="oportunidad-card">
  <a href="/oportunidades/farmacia-ref-2452"><h3>Farmacia en venta en zona sur de Madrid</h3></a>
  <p>Facturaci&oacute;n 1.200.000 &#8364;. Comunidad de Madrid.</p>
</div>
</body></html>`;

describe('Farmaconsulting · parsearPagina', () => {
  it('lee facturación, precio y comunidad de la tarjeta, sin coordenadas', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(2);

    const a = anuncios[0];
    expect(a.tipo).toBe('farmacia');
    expect(a.portal).toBe('farmaconsulting');
    expect(a.portalId).toBe('farmacia-ref-2451');
    expect(a.facturacion).toBe(780000);
    expect(a.precio).toBe(1150000);
    expect(a.comunidad).toBe('castilla-mancha');
    expect(a.latitud).toBeNull();
    expect(a.precision).toBe('desconocida');
    expect(a.url).toBe('https://www.farmaconsulting.es/oportunidades/farmacia-ref-2451');
  });

  it('deduce la comunidad aunque solo haya una ubicación difusa', () => {
    expect(parsearPagina(HTML)[1].comunidad).toBe('madrid');
  });
});
