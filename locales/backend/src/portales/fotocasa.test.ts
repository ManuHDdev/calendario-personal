import { describe, it, expect } from 'vitest';
import { parsearPagina } from './fotocasa';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<script type="application/json" id="__initial_props__">
{"search":{"result":{"realEstates":[
  {"id":300111222,"buildingType":"Premises","buildingSubtype":"Premises","transactionTypeId":1,
   "rawPrice":195000,"price":"195.000 &#8364;",
   "detail":{"es-ES":"/es/comprar/local/malaga-capital/centro/300111222/d"},
   "address":{"municipality":"M&#xE1;laga","district":"Centro","province":"M&#xE1;laga"},
   "coordinates":{"latitude":36.7213,"longitude":-4.4213},
   "features":[{"key":"surface","value":[140]}],
   "multimedia":[{"type":"image","src":"https://static.fotocasa.es/images/ads/xyz?rule=original"}],
   "description":"Local a pie de calle en el centro"},
  {"id":300111333,"buildingSubtype":"Flat","transactionTypeId":1,"rawPrice":150000,
   "detail":{"es-ES":"/es/comprar/vivienda/malaga/x/300111333/d"},
   "features":[{"key":"surface","value":[80]}]},
  {"id":300111444,"buildingSubtype":"Premises","transactionTypeId":3,"rawPrice":900,
   "detail":{"es-ES":"/es/alquiler/local/malaga/x/300111444/d"},"features":[]}
]}}}
</script>
</body></html>`;

describe('fotocasa (locales) · parsearPagina', () => {
  it('lee un local comercial en venta con precio, superficie e imagen', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1); // vivienda y alquiler descartados

    const a = anuncios[0];
    expect(a.tipo).toBe('local');
    expect(a.portal).toBe('fotocasa');
    expect(a.portalId).toBe('300111222');
    expect(a.precio).toBe(195000);
    expect(a.superficieM2).toBe(140);
    expect(a.facturacion).toBeNull();
    expect(a.municipio).toBe('Málaga'); // entidad decodificada
    expect(a.latitud).toBeCloseTo(36.7213);
    expect(a.precision).toBe('aproximada');
    expect(a.imagenUrl).toContain('static.fotocasa.es');
    expect(a.url).toBe('https://www.fotocasa.es/es/comprar/local/malaga-capital/centro/300111222/d');
  });

  it('descarta alquiler y subtipos residenciales', () => {
    const ids = parsearPagina(HTML).map((a) => a.portalId);
    expect(ids).not.toContain('300111333');
    expect(ids).not.toContain('300111444');
  });
});
