import { describe, it, expect } from 'vitest';
import { parsearPagina } from './pisoscom';

// forma real aproximada (2026-09), sin verificar contra el portal
const HTML = `
<html><body>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Store","@id":"77112233445.606000",
 "geo":{"@type":"GeoCoordinates","latitude":"39.4699","longitude":"-6.3722"},
 "address":{"@type":"PostalAddress","addressLocality":"C&#xE1;ceres"}}
</script>

<div id="77112233445.606000" class="ad-preview ad-preview--has-desc" data-lnk-href="/comprar/local-caceres-77112233445_606000/">
  <div class="ad-preview__inline"><span class="ad-preview__price"> 120.000 &#8364; </span></div>
  <a href="/comprar/local-caceres-77112233445_606000/" class="ad-preview__title">Local en Avd. Espa&#xF1;a</a>
  <p class="p-sm ad-preview__subtitle">C&#xE1;ceres</p>
  <div class="ad-preview__inline">
    <p class="ad-preview__char p-sm">220 m&#xB2;</p>
    <p class="ad-preview__char p-sm">a pie de calle</p>
  </div>
  <img decoding="async" src="https://fotos.imghs.net/mm-wp/2020/local.jpg">
  <div class="contact-box" data-ad-id="77112233445.606000" data-ad-price="120000"></div>
</div>

<div id="88999900011.222000" class="ad-preview" data-lnk-href="/comprar/piso-caceres-88999900011_222000/">
  <a href="/comprar/piso-caceres-88999900011_222000/" class="ad-preview__title">Piso en C&#xE1;ceres</a>
  <p class="ad-preview__char p-sm">90 m&#xB2;</p>
  <div class="contact-box" data-ad-price="150000"></div>
</div>
</body></html>`;

describe('pisos.com (locales) · parsearPagina', () => {
  it('extrae un local con precio limpio, superficie y coords del JSON-LD', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1); // el piso queda fuera

    const a = anuncios[0];
    expect(a.tipo).toBe('local');
    expect(a.portal).toBe('pisoscom');
    expect(a.portalId).toBe('77112233445.606000');
    expect(a.precio).toBe(120000); // de data-ad-price, no del texto
    expect(a.superficieM2).toBe(220);
    expect(a.titulo).toBe('Local en Avd. España'); // entidad decodificada
    expect(a.latitud).toBeCloseTo(39.4699);
    expect(a.precision).toBe('aproximada');
    expect(a.imagenUrl).toBe('https://fotos.imghs.net/mm-wp/2020/local.jpg');
  });

  it('descarta una vivienda que se cuele en el listado', () => {
    expect(parsearPagina(HTML).map((a) => a.portalId)).not.toContain('88999900011.222000');
  });
});
