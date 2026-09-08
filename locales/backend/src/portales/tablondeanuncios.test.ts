import { describe, it, expect } from 'vitest';
import { parsearPagina, tablonDeAnunciosProvider } from './tablondeanuncios';

// Extracto REAL de https://www.tablondeanuncios.com/farmacias-venta/ (2026-09).
// El buscador es MUY laxo: mezcla farmacias de verdad con relojes, talleres y
// lámparas. El fixture tiene una de cada para comprobar el filtro `pareceFarmacia`.
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
<img alt="Traspaso oficina de farmacia" class="lazyload" src="https://images0.tablondeanuncios.com/imagenes/no-image-thumb.jpg"/>
<h3><a id="a4388606" href="https://www.tablondeanuncios.com/farmacias-venta/se_traspasa_oficina_de_farmacia-4388606.htm" rel="bookmark" target="_blank" class="titleAd">Se traspasa oficina de farmacia</a></h3>
<p class="hide-for-small-only">Farmacia en Sevilla capital, facturaci&oacute;n 620.000 &euro; anuales, 90 m&sup2;.</p>
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
<article class="result-item" id="5096879">
<div class="grid-x small-12 cell"><div class="small-9 cell"><p> en Madrid</p></div></div>
<div class="small-12 cell">
<h3><a id="a5096879" href="https://www.tablondeanuncios.com/antiguedades/reloj_de_pie_carillon-5096879.htm" rel="bookmark" target="_blank" class="titleAd">Reloj de pie carillon</a></h3>
<p class="hide-for-small-only">Antiguo reloj de pie restaurado.</p>
</div>
<footer class="grid-x small-12 cell">
<p class="medium-2 cell hide-for-small-only "><strong>2.200&euro;</strong></p>
</footer>
</article>
</body></html>`;

describe('Tablón de Anuncios · parsearPagina', () => {
  it('se queda solo con los anuncios que mencionan una farmacia', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(1); // el taller y el reloj se descartan
    expect(anuncios[0].portalId).toBe('4388606');
  });

  it('parsea la tarjeta de farmacia: id, url, título, ubicación, facturación', () => {
    const a = parsearPagina(HTML)[0];
    expect(a.portal).toBe('tablondeanuncios');
    expect(a.tipo).toBe('farmacia');
    expect(a.url).toBe(
      'https://www.tablondeanuncios.com/farmacias-venta/se_traspasa_oficina_de_farmacia-4388606.htm',
    );
    expect(a.titulo).toBe('Se traspasa oficina de farmacia');
    expect(a.municipio).toBe('Sevilla');
    expect(a.comunidad).toBe('andalucia');
    expect(a.facturacion).toBe(620000);
    expect(a.precio).toBeNull(); // "A convenir"
    expect(a.imagenUrl).toBeNull(); // no-image-thumb se descarta
    expect(a.latitud).toBeNull();
    expect(a.precision).toBe('desconocida');
  });

  it('es un listado nacional: puedeBuscar siempre ok', () => {
    expect(tablonDeAnunciosProvider.puedeBuscar({} as never)).toEqual({ ok: true });
  });
});
