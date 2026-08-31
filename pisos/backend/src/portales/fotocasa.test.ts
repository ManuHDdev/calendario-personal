import { describe, it, expect } from 'vitest';
import { parsearPagina } from './fotocasa';

/**
 * Fixture reducido con la forma real (2026-08) del bloque
 * `<script type="application/json" id="__initial_props__">` de Fotocasa:
 * cada anuncio es un nodo de `realEstates` con `rawPrice`, `detail["es-ES"]`
 * y `features: [{ key, value }]`.
 */
const HTML = `
<html><body>
<script type="application/json" id="__initial_props__">
{"seo":{"title":"x"},"search":{"result":{"realEstates":[
  {"id":190620092,"buildingType":"Flat","buildingSubtype":"Flat","transactionTypeId":1,
   "rawPrice":138000,"price":"138.000 €",
   "detail":{"es-ES":"/es/comprar/vivienda/caceres-capital/aire/190620092/d"},
   "detailWithParams":{"es-ES":"/es/comprar/vivienda/caceres-capital/aire/190620092/d?from=list"},
   "address":{"municipality":"Cáceres","district":"Casco Antiguo","province":"Cáceres"},
   "coordinates":{"latitude":39.4694,"longitude":-6.3756},
   "features":[{"key":"air_conditioner","value":1},{"key":"bathrooms","value":1},
               {"key":"rooms","value":3},{"key":"surface","value":84},{"key":"elevator","value":13}],
   "multimedia":[{"type":"image","src":"https://static.fotocasa.es/images/ads/abc?rule=original"}],
   "description":"Piso reformado en pleno centro"},
  {"id":190600001,"buildingSubtype":"Garage","transactionTypeId":1,"rawPrice":15000,
   "detail":{"es-ES":"/es/comprar/garaje/caceres/x/190600001/d"},"features":[]},
  {"id":190600002,"buildingSubtype":"Flat","transactionTypeId":3,"rawPrice":650,
   "detail":{"es-ES":"/es/alquiler/vivienda/caceres/x/190600002/d"},
   "features":[{"key":"rooms","value":2},{"key":"surface","value":55}]}
]}}}
</script>
</body></html>`;

describe('fotocasa · parsearPagina', () => {
  it('lee precio, superficie, habitaciones y baños del estado embebido', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1); // garaje y alquiler descartados

    const a = anuncios[0];
    expect(a.portal).toBe('fotocasa');
    expect(a.portalId).toBe('190620092');
    expect(a.precio).toBe(138000);
    expect(a.metros).toBe(84);
    expect(a.habitaciones).toBe(3);
    expect(a.banos).toBe(1);
    expect(a.ascensor).toBe(true);
    expect(a.url).toBe('https://www.fotocasa.es/es/comprar/vivienda/caceres-capital/aire/190620092/d');
    expect(a.ubicacion).toContain('Cáceres');
    expect(a.latitud).toBeCloseTo(39.4694);
    expect(a.imagenUrl).toContain('static.fotocasa.es');
  });

  it('descarta alquiler y tipos que no son vivienda', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios.map((a) => a.portalId)).not.toContain('190600001');
    expect(anuncios.map((a) => a.portalId)).not.toContain('190600002');
  });
});
