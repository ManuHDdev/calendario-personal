import { describe, it, expect } from 'vitest';
import { parsearPagina } from './pisoscom';

// Extracto REAL de `/venta/locales-madrid/` (2026-09). Puntos clave:
//  - el `id` de la tarjeta y el `@id` del JSON-LD son idénticos
//  - el `@type` del JSON-LD es `SingleFamilyResidence` aunque sea un local
//  - el precio limpio está en `data-ad-price`, la superficie en `ad-preview__char`
const HTML = `
<html><body>
<div id="63367423608.994867" class="ad-preview   ad-preview--has-desc  ad-preview--has-top-product" data-lnk-href="/comprar/local_comercial-numancia28038-63367423608_994867/">
  <div class="ad-preview__bottom">
    <div class="ad-preview__inline ad-preview__inline--has-logo">
      <span class="ad-preview__price"> 138.000 &#8364; </span>
    </div>
    <div class="ad-preview__section">
      <a href="/comprar/local_comercial-numancia28038-63367423608_994867/" class="ad-preview__title">Local comercial en calle de la Sierra Toledana, 47</a>
      <p class="p-sm ad-preview__subtitle">Numancia (Distrito Puente de Vallecas. Madrid Capital)</p>
    </div>
    <div class="ad-preview__section">
      <div class="ad-preview__inline">
        <p class="ad-preview__char p-sm">102 m&#xB2;</p>
        <p class="ad-preview__char p-sm">Bajo</p>
      </div>
    </div>
    <img decoding="async" src="https://fotos.imghs.net/mm-wp/994867/63367423608.994867/994867_63367423608_163efd86.jpg" alt="Local comercial">
    <div class="contact-box" data-ad-id="63367423608.994867" data-ad-price="138000"></div>
  </div>
</div>
<script type="application/ld+json">
{
    "@context": "https://schema.org/",
    "@type": "SingleFamilyResidence",
    "@id": "63367423608.994867",
    "name": "Local comercial en calle de la Sierra Toledana, 47",
    "url": "/comprar/local_comercial-numancia28038-63367423608_994867/",
    "address": { "@type": "PostalAddress", "addressLocality":"Madrid Capital", "addressRegion":"Madrid" },
    "geo": { "@type": "GeoCoordinates", "latitude":"40.404022", "longitude":"-3.6597006" }
}
</script>

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
    expect(a.portalId).toBe('63367423608.994867');
    expect(a.precio).toBe(138000); // de data-ad-price, no del texto
    expect(a.superficieM2).toBe(102);
    expect(a.titulo).toBe('Local comercial en calle de la Sierra Toledana, 47');
    // el cruce @id (JSON-LD) ↔ id (tarjeta) puebla las coordenadas
    expect(a.latitud).toBeCloseTo(40.404022);
    expect(a.longitud).toBeCloseTo(-3.6597006);
    expect(a.precision).toBe('aproximada');
    expect(a.imagenUrl).toBe('https://fotos.imghs.net/mm-wp/994867/63367423608.994867/994867_63367423608_163efd86.jpg');
  });

  it('descarta una vivienda que se cuele en el listado', () => {
    expect(parsearPagina(HTML).map((a) => a.portalId)).not.toContain('88999900011.222000');
  });
});
