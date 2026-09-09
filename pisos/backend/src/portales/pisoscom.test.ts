import { describe, it, expect } from 'vitest';
import { construirUrl, parsearPagina } from './pisoscom';
import type { CriteriosPortal } from './types';

const CRITERIOS_BASE: CriteriosPortal = {
  tipo: 'vivienda',
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
 * FIXTURE PLACEHOLDER — hecho a mano con la forma conocida de pisos.com, NO
 * capturado de la sección real de locales. Reemplazar con:
 *   npm run smoke -- pisos "<zona>" --tipo local
 * Hasta entonces prueba la rama por `tipo` (rechazo por slug, superficie
 * ampliada, geo sin filtro `@type`), no que pisos.com sirva hoy esta forma.
 */
const HTML_LOCALES = `
<html><body>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"SingleFamilyResidence","@id":"11111111111.222222",
 "geo":{"@type":"GeoCoordinates","latitude":"40.0289","longitude":"-6.0876"},
 "address":{"@type":"PostalAddress","addressLocality":"Plasencia"}}
</script>
<div id="11111111111.222222" class="ad-preview" data-lnk-href="/comprar/local-plasencia-11111111111_222222/">
  <div class="ad-preview__inline"><span class="ad-preview__price"> 180.000 &#8364; </span></div>
  <a href="/comprar/local-plasencia-11111111111_222222/" class="ad-preview__title">Local en el centro</a>
  <p class="p-sm ad-preview__subtitle">Plasencia</p>
  <p class="ad-preview__char p-sm">2.000 m&#xB2;</p>
  <div class="contact-box" data-ad-id="11111111111.222222" data-ad-price="180000"></div>
</div>
<div id="33333333333.444444" class="ad-preview" data-lnk-href="/comprar/piso-plasencia-33333333333_444444/">
  <span class="ad-preview__price"> 95.000 &#8364; </span>
  <a href="/comprar/piso-plasencia-33333333333_444444/" class="ad-preview__title">Piso reformado</a>
  <p class="ad-preview__char p-sm">70 m&#xB2;</p>
  <div class="contact-box" data-ad-price="95000"></div>
</div>
</body></html>`;

/**
 * Fixture con la forma real (2026-08) de pisos.com: el JSON-LD ya solo trae
 * geo y dirección; precio, m² y habitaciones viven en el marcado de la
 * tarjeta `.ad-preview__*`, con entidades HTML sin decodificar.
 */
const HTML = `
<html><body>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"SingleFamilyResidence","@id":"57566514347.101000",
 "geo":{"@type":"GeoCoordinates","latitude":"40.0289","longitude":"-6.0876"},
 "address":{"@type":"PostalAddress","addressLocality":"Plasencia","addressRegion":"C&#xE1;ceres"}}
</script>

<div id="57566514347.101000" class="ad-preview ad-preview--has-desc" data-lnk-href="/comprar/piso-plasencia-57566514347_101000/">
  <div class="ad-preview__inline"><span class="ad-preview__price"> 60.000 &#8364; </span></div>
  <a href="/comprar/piso-plasencia-57566514347_101000/" class="ad-preview__title">Piso en Avd. Espa&#xF1;a</a>
  <p class="p-sm ad-preview__subtitle">Plasencia</p>
  <div class="ad-preview__inline">
    <p class="ad-preview__char p-sm">5 habs.</p>
    <p class="ad-preview__char p-sm">1 ba&#xF1;o</p>
    <p class="ad-preview__char p-sm">131 m&#xB2;</p>
    <p class="ad-preview__char p-sm">2&#xAA; planta</p>
  </div>
  <img decoding="async" src="https://fotos.imghs.net/mm-wp/1010/foto.jpg">
  <div class="contact-box" data-ad-id="57566514347.101000" data-ad-price="60000"></div>
</div>

<div id="99999999999.888888" class="ad-preview" data-lnk-href="/comprar/piso-caceres-99999999999_888888/">
  <span class="ad-preview__price"> 210.000 &#8364; </span>
  <a href="/comprar/piso-caceres-99999999999_888888/" class="ad-preview__title">Piso en C&#xE1;ceres</a>
  <p class="p-sm ad-preview__subtitle">C&#xE1;ceres Capital</p>
  <p class="ad-preview__char p-sm">3 habs.</p>
  <p class="ad-preview__char p-sm">90 m&#xB2;</p>
</div>
</body></html>`;

describe('pisos.com · parsearPagina', () => {
  it('extrae cada tarjeta con precio limpio, m², habitaciones y baños', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(2);

    const a = anuncios[0];
    expect(a.portal).toBe('pisos');
    expect(a.portalId).toBe('57566514347.101000');
    expect(a.precio).toBe(60000); // de data-ad-price, no del texto "60.000 €"
    expect(a.metros).toBe(131);
    expect(a.habitaciones).toBe(5); // "5 habs."
    expect(a.banos).toBe(1); // "1 baño"
    expect(a.planta).toBe('2ª');
    expect(a.titulo).toBe('Piso en Avd. España'); // entidad decodificada
    expect(a.ubicacion).toBe('Plasencia');
    expect(a.latitud).toBeCloseTo(40.0289); // del JSON-LD, cruzado por @id
    expect(a.imagenUrl).toBe('https://fotos.imghs.net/mm-wp/1010/foto.jpg');
  });

  it('no mezcla los datos de una tarjeta con los de la siguiente', () => {
    const [, b] = parsearPagina(HTML);
    expect(b.portalId).toBe('99999999999.888888');
    expect(b.precio).toBe(210000);
    expect(b.metros).toBe(90);
    expect(b.habitaciones).toBe(3);
  });
});

describe('pisos.com · locales (tipo=local)', () => {
  it('construye la URL de la sección comercial sin habitacionesDesde', () => {
    const url = construirUrl({ ...CRITERIOS_BASE, tipo: 'local' }, 1);
    expect(url).toContain('/venta/locales-plasencia/');
    expect(url).not.toContain('habitacionesDesde');
    expect(url).toContain('orden=relevancia-desc');
  });

  it('en vivienda usa la sección de pisos y sí manda habitacionesDesde', () => {
    const url = construirUrl(CRITERIOS_BASE, 1);
    expect(url).toContain('/venta/pisos-plasencia/');
    expect(url).toContain('habitacionesDesde=3');
  });

  it('descarta por slug un anuncio de vivienda colado en un listado de local', () => {
    const ids = parsearPagina(HTML_LOCALES, 'local').map((a) => a.portalId);
    expect(ids).toContain('11111111111.222222'); // local
    expect(ids).not.toContain('33333333333.444444'); // piso descartado por el slug /piso-
  });

  it('usa la superficie ampliada y resuelve geo con el JSON-LD de un SingleFamilyResidence', () => {
    const local = parsearPagina(HTML_LOCALES, 'local').find((a) => a.portalId === '11111111111.222222');
    expect(local?.tipo).toBe('local');
    expect(local?.metros).toBe(2000); // pasaría a null con el extractor de vivienda ([15,1000])
    expect(local?.latitud).toBeCloseTo(40.0289); // mapaGeoPorId ya no filtra por @type
  });
});
