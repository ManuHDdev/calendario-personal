import { describe, it, expect } from 'vitest';
import { parsearPagina, tablonDeAnunciosProvider } from './tablondeanuncios';

// Extracto REAL de https://www.tablondeanuncios.com/farmacias-venta/ (2026-09).
const HTML = `
<html><body>
<article class="result-item" id="4388606">
<div class="grid-x small-12 cell">
	<div class="small-9 cell">
		<p>			 en Sevilla</p>
</div>
<div class="small-3 cell text-right fecha"><i class="fa fa-clock-o"></i>  07/09/2026</div>
</div>
<div class="small-12 cell">
<img alt="Venta de locales y negocios" class="lazyload" src="https://images0.tablondeanuncios.com/imagenes/no-image-thumb.jpg"/>
<h3><a id="a4388606" href="https://www.tablondeanuncios.com/traspasos-venta-negocios/venta_de_locales_y_negocios-4388606.htm" rel="bookmark" target="_blank" class="titleAd">Venta de locales y negocios</a></h3>
<p class="hide-for-small-only">Interesado en la compra de un local en Sevilla. Tambien disponemos de negocios como Bares, Restaurantes, Farmacias, etc.</p>
</div>
<footer class="grid-x small-12 cell">
<p class="medium-2 cell hide-for-small-only ">
Precio A convenir </p>
</footer>
</article>
<article class="result-item" id="4877721">
<div class="grid-x small-12 cell"><div class="small-9 cell"><p> en Madrid</p></div></div>
<div class="small-12 cell">
<h3><a id="a4877721" href="https://www.tablondeanuncios.com/traspasos-talleres-mecanicos/se_vende_taller_mecanico_y_chapa_y_pintura-4877721.htm" rel="bookmark" target="_blank" class="titleAd">Se vende taller mecanico y chapa y pintura</a></h3>
<p class="hide-for-small-only">Vendemos nuestro taller, facturaci&oacute;n 480.000 &euro; anuales.</p>
</div>
<footer class="grid-x small-12 cell">
<p class="medium-2 cell hide-for-small-only "><strong>650.000&euro;</strong></p>
</footer>
</article>
</body></html>`;

describe('Tablón de Anuncios · parsearPagina', () => {
  it('parsea las tarjetas result-item: id, url, título, ubicación y precio', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(2);

    const a = anuncios[0];
    expect(a.portal).toBe('tablondeanuncios');
    expect(a.tipo).toBe('farmacia');
    expect(a.portalId).toBe('4388606');
    expect(a.url).toBe(
      'https://www.tablondeanuncios.com/traspasos-venta-negocios/venta_de_locales_y_negocios-4388606.htm',
    );
    expect(a.titulo).toBe('Venta de locales y negocios');
    expect(a.municipio).toBe('Sevilla');
    expect(a.comunidad).toBe('andalucia');
    expect(a.precio).toBeNull(); // "A convenir"
    expect(a.imagenUrl).toBeNull(); // no-image-thumb se descarta
    expect(a.latitud).toBeNull();
    expect(a.precision).toBe('desconocida');
  });

  it('lee precio numérico y facturación del texto libre', () => {
    const b = parsearPagina(HTML)[1];
    expect(b.precio).toBe(650000);
    expect(b.facturacion).toBe(480000);
  });

  it('es un listado nacional: puedeBuscar siempre ok', () => {
    expect(tablonDeAnunciosProvider.puedeBuscar({} as never)).toEqual({ ok: true });
  });
});
