import { describe, it, expect } from 'vitest';
import { construirUrl, parsearPagina } from './fotocasa';
import type { CriteriosPortal } from './types';

const CRITERIOS_BASE: CriteriosPortal = {
  tipo: 'vivienda',
  operacion: 'venta',
  ubicacion: 'Plasencia',
  latitud: null,
  longitud: null,
  radioKm: null,
  precioMin: null,
  precioMax: null,
  metrosMin: null,
  metrosMax: null,
  habitacionesMin: 3,
  banosMin: null,
};

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

/**
 * Fixture con la forma REAL de la sección comercial de Fotocasa, verificada
 * contra el portal en vivo el 2026-09-10 (`npm run smoke -- fotocasa "Madrid"
 * --tipo local`): el nodo trae `buildingType: "Business"` y NO trae
 * `buildingSubtype`; la ficha vuelve bajo `/es/comprar/local-comercial/…`;
 * `features` mantiene `[{ key, value }]` (surface, bathrooms).
 */
const HTML_LOCALES = `
<html><body>
<script type="application/json" id="__initial_props__">
{"search":{"result":{"realEstates":[
  {"id":300100001,"buildingType":"Business","transactionTypeId":1,
   "rawPrice":180000,"price":"180.000 €",
   "detail":{"es-ES":"/es/comprar/local-comercial/badajoz-capital/centro/300100001/d"},
   "address":{"municipality":"Badajoz","district":"Centro","province":"Badajoz"},
   "coordinates":{"latitude":38.8794,"longitude":-6.9707},
   "features":[{"key":"surface","value":2500,"maxValue":0,"minValue":0}],
   "description":"Nave industrial de 2.500 m² con muelle de carga"},
  {"id":300100002,"buildingType":"Flat","buildingSubtype":"Flat","transactionTypeId":1,"rawPrice":95000,
   "detail":{"es-ES":"/es/comprar/vivienda/badajoz/x/300100002/d"},
   "features":[{"key":"surface","value":70},{"key":"rooms","value":2}]},
  {"id":300100003,"buildingType":"Business","transactionTypeId":1,"rawPrice":120000,
   "detail":{"es-ES":"/es/comprar/local-comercial/badajoz/y/300100003/d"},
   "features":[{"key":"surface","value":140,"maxValue":0,"minValue":0},{"key":"bathrooms","value":1}]}
]}}}
</script>
</body></html>`;

describe('fotocasa · parsearPagina — locales (tipo=local)', () => {
  it('construye la URL de la sección comercial y no manda minRooms', () => {
    const url = construirUrl({ ...CRITERIOS_BASE, tipo: 'local' }, 1);
    expect(url).toContain('/es/comprar/locales/plasencia/todas-las-zonas/l');
    expect(url).not.toContain('minRooms');
    expect(url).toContain('sortType=publicationDate');
  });

  it('en vivienda mantiene la sección de viviendas y sí manda minRooms', () => {
    const url = construirUrl(CRITERIOS_BASE, 1);
    expect(url).toContain('/es/comprar/viviendas/plasencia/todas-las-zonas/l');
    expect(url).toContain('minRooms=3');
  });

  it('acepta local/nave/oficina, rechaza el subtipo residencial y usa la superficie ampliada', () => {
    const anuncios = parsearPagina(HTML_LOCALES, 'local');
    const ids = anuncios.map((a) => a.portalId);
    expect(ids).toContain('300100001'); // nave
    expect(ids).toContain('300100003'); // oficina
    expect(ids).not.toContain('300100002'); // piso descartado

    const nave = anuncios.find((a) => a.portalId === '300100001');
    expect(nave?.tipo).toBe('local');
    expect(nave?.metros).toBe(2500); // pasaría a null con el extractor de vivienda ([15,1000])
  });

  it('el mismo HTML en modo vivienda descarta la nave y la oficina', () => {
    const ids = parsearPagina(HTML_LOCALES, 'vivienda').map((a) => a.portalId);
    expect(ids).toContain('300100002');
    expect(ids).not.toContain('300100001');
    expect(ids).not.toContain('300100003');
  });
});

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

  it('en operación venta (por defecto) descarta alquiler y tipos que no son vivienda', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios.map((a) => a.portalId)).not.toContain('190600001');
    expect(anuncios.map((a) => a.portalId)).not.toContain('190600002');
  });
});

describe('fotocasa · operación (venta/alquiler)', () => {
  it('construye la URL de compra para venta y de alquiler para alquiler', () => {
    const urlVenta = construirUrl(CRITERIOS_BASE, 1);
    expect(urlVenta).toContain('/es/comprar/viviendas/plasencia/');

    const urlAlquiler = construirUrl({ ...CRITERIOS_BASE, operacion: 'alquiler' }, 1);
    expect(urlAlquiler).toContain('/es/alquiler/viviendas/plasencia/');
  });

  it('en operación alquiler acepta el nodo con transactionTypeId=3 y descarta el de venta', () => {
    const anuncios = parsearPagina(HTML, 'vivienda', 'alquiler');
    const ids = anuncios.map((a) => a.portalId);
    expect(ids).toContain('190600002'); // alquiler
    expect(ids).not.toContain('190620092'); // venta, descartado en modo alquiler
  });
});
