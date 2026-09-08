import { describe, it, expect } from 'vitest';
import { parsearPagina, milanunciosFarmaciasProvider } from './milanunciosFarmacias';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<article class="ma-AdCard">
  <a href="/traspaso-farmacia-en-murcia/farmacia-en-traspaso-99010.htm"><h3>Traspaso de farmacia en Murcia</h3></a>
  <p>Facturaci&oacute;n 430.000 &#8364;. Zona Murcia. Precio 700.000 €.</p>
</article>
</body></html>`;

describe('milanuncios (farmacias) · parsearPagina', () => {
  it('es un portal separado, con su propio id', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1);

    const a = anuncios[0];
    expect(a.portal).toBe('milanuncios-farmacias');
    expect(a.tipo).toBe('farmacia');
    expect(a.facturacion).toBe(430000);
    expect(a.comunidad).toBe('murcia');
    expect(a.latitud).toBeNull();
    expect(a.precision).toBe('desconocida');
  });

  it('puedeBuscar devuelve { ok: false }: no rastreable desde servidor', () => {
    expect(milanunciosFarmaciasProvider.puedeBuscar({ provincia: 'Madrid' } as never).ok).toBe(false);
  });
});
