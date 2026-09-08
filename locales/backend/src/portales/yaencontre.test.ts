import { describe, it, expect } from 'vitest';
import { parsearPagina, yaencontreProvider } from './yaencontre';

// forma real aproximada (2026-09), sin verificar contra el portal
// Aquí no hay estado embebido: se ejercita el plan B (JSON-LD).
const HTML = `
<html><body>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
  {"@type":"Product","identifier":"ye-5501","name":"Local comercial en Valencia",
   "url":"https://www.yaencontre.com/locales-comerciales/venta/valencia/5501",
   "description":"Local diáfano de 200 m2 a pie de calle","image":"https://img.yaencontre.com/5501.jpg",
   "offers":{"@type":"Offer","price":"240000","priceCurrency":"EUR"},
   "address":{"@type":"PostalAddress","addressLocality":"Valencia","addressRegion":"Valencia"}},
  {"@type":"Product","identifier":"ye-5502","name":"Piso en Valencia",
   "url":"https://www.yaencontre.com/pisos/venta/valencia/5502",
   "offers":{"@type":"Offer","price":"180000"}}
]}
</script>
</body></html>`;

describe('yaencontre (locales) · parsearPagina', () => {
  it('cae al JSON-LD cuando no hay estado embebido', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1);

    const a = anuncios[0];
    expect(a.portal).toBe('yaencontre');
    expect(a.portalId).toBe('ye-5501');
    expect(a.precio).toBe(240000);
    expect(a.superficieM2).toBe(200); // del texto de la descripción
    expect(a.municipio).toBe('Valencia');
    expect(a.imagenUrl).toBe('https://img.yaencontre.com/5501.jpg');
  });

  it('rechaza el piso', () => {
    expect(parsearPagina(HTML).map((a) => a.portalId)).not.toContain('ye-5502');
  });

  it('puedeBuscar devuelve { ok: false }: no rastreable desde servidor', () => {
    expect(yaencontreProvider.puedeBuscar({ zonaTexto: 'Madrid' } as never).ok).toBe(false);
  });
});
