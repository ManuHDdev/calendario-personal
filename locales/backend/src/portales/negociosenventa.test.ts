import { describe, it, expect } from 'vitest';
import { parsearPagina } from './negociosenventa';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<div class="anuncio-item">
  <a href="/negocios-en-venta/farmacias/detalle/farmacia-en-galicia-4410">
    <span>Farmacia en venta en A Coru&ntilde;a</span>
  </a>
  <p>Cifra de negocio de 610.000 &#8364;. Galicia. Precio de venta 980.000 €.</p>
</div>
</body></html>`;

describe('Negocios en Venta · parsearPagina', () => {
  it('lee la cifra de negocio como facturación y deduce la comunidad', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1);

    const a = anuncios[0];
    expect(a.portal).toBe('negociosenventa');
    expect(a.tipo).toBe('farmacia');
    expect(a.facturacion).toBe(610000);
    expect(a.precio).toBe(980000);
    expect(a.comunidad).toBe('galicia');
    expect(a.precision).toBe('desconocida');
  });
});
