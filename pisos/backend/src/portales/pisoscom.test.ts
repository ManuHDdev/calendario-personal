import { describe, it, expect } from 'vitest';
import { parsearPagina } from './pisoscom';

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
