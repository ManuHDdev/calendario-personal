import { describe, it, expect } from 'vitest';
import { parsearPagina, farmaconsultingProvider } from './farmaconsulting';

// Extracto REAL de https://www.farmaconsulting.es/farmacias-en-venta/ (2026-09).
const HTML = `
<html><body>
<div class="flex_column av_one_fourth flex_column_table_cell av-equal-height-column first"><div class="bloqueFarmaciaVenta"><p class="provincia"><a href="#formulario-registro-header" class="popup-with-form">ISLAS BALEARES</a></p><h4><a href="#formulario-registro-header" class="popup-with-form">Una farmacia de referencia preparada para seguir creciendo j...</a></h4><p>F&aacute;cil gesti&oacute;n, sin competencia y una ubicaci&oacute;n estrat&eacute;gica para atender a la...</p><p><a href="#formulario-registro-header" class="popup-with-form">&gt; CCL-17.1_12802</a</p></div><div class="opcs flex_column_table"><!-- NOVEDAD / +INFO --><div class="flex_column_table_cell av_three_fifth"><a href="#formulario-registro-header" class="estado popup-with-form novedad">Novedad</a>  </div><div class="flex_column_table_cell av_two_fifth"><a href="#formulario-registro-header" onclick="jQuery('#redirection').val('/farmacias-en-venta/farmacia-detalle/?farmacia=8575&operacion=CCL-17.1_12802');" class="popup-with-form masinfo">info</a></div></div></div>
<div class="av-flex-placeholder"></div>
<div class="flex_column av_one_fourth flex_column_table_cell av-equal-height-column"><div class="bloqueFarmaciaVenta"><p class="provincia"><a href="#formulario-registro-header" class="popup-with-form">MADRID</a></p><h4><a href="#formulario-registro-header" class="popup-with-form">La farmacia m&aacute;s deseada de la zona norte de Madrid por su u...</a></h4><p>Facturaci&oacute;n elevada, instalaciones de primer nivel y oportunidades de mejora en...</p><p><a href="#formulario-registro-header" class="popup-with-form">&gt; CCL-17.1_12986</a</p></div><div class="opcs flex_column_table"><div class="flex_column_table_cell av_two_fifth"><a href="#formulario-registro-header" onclick="jQuery('#redirection').val('/farmacias-en-venta/farmacia-detalle/?farmacia=9012&operacion=CCL-17.1_12986');" class="popup-with-form masinfo">info</a></div></div></div>
</body></html>`;

describe('Farmaconsulting · parsearPagina', () => {
  it('lee cada oportunidad: región, título, descripción y código de operación', () => {
    const anuncios = parsearPagina(HTML);
    expect(anuncios).toHaveLength(2);

    const a = anuncios[0];
    expect(a.tipo).toBe('farmacia');
    expect(a.portal).toBe('farmaconsulting');
    expect(a.portalId).toBe('CCL-17.1_12802');
    expect(a.url).toBe(
      'https://www.farmaconsulting.es/farmacias-en-venta/farmacia-detalle/?farmacia=8575&operacion=CCL-17.1_12802',
    );
    expect(a.provincia).toBe('ISLAS BALEARES');
    expect(a.comunidad).toBe('baleares');
    expect(a.titulo).toBe('Una farmacia de referencia preparada para seguir creciendo j');
    // el listado no publica ni facturación ni precio ni superficie ni coords
    expect(a.facturacion).toBeNull();
    expect(a.precio).toBeNull();
    expect(a.superficieM2).toBeNull();
    expect(a.latitud).toBeNull();
    expect(a.precision).toBe('desconocida');
  });

  it('deduce la comunidad de la región', () => {
    expect(parsearPagina(HTML)[1].comunidad).toBe('madrid');
  });

  it('es un listado nacional: puedeBuscar siempre ok', () => {
    expect(farmaconsultingProvider.puedeBuscar({} as never)).toEqual({ ok: true });
  });
});
