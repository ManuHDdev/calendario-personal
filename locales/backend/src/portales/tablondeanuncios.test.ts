import { describe, it, expect } from 'vitest';
import { parsearPagina } from './tablondeanuncios';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<li class="aditem-list">
  <a href="/farmacias-en-venta/anuncio-farmacia-valencia-8821"><h3>Se vende farmacia en Valencia</h3></a>
  <div>VF 540.000 &#8364; anuales. Comunidad Valenciana. Local de 70 m&#xB2;.</div>
</li>
<li class="aditem-list">
  <a href="/farmacias-en-venta/anuncio-farmacia-valencia-8822"><h3>Farmacia en Valencia, buen barrio</h3></a>
  <div>Facturaci&oacute;n aproximada 1.100.000 &#8364;.</div>
</li>
</body></html>`;

describe('Tablón de Anuncios · parsearPagina', () => {
  it('entiende la abreviatura "VF" como facturación', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(2);
    expect(anuncios[0].portal).toBe('tablondeanuncios');
    expect(anuncios[0].facturacion).toBe(540000);
    expect(anuncios[0].superficieM2).toBe(70);
    expect(anuncios[0].comunidad).toBe('valenciana');
    expect(anuncios[1].facturacion).toBe(1100000);
  });
});
