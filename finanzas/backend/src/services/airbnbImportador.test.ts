import { describe, it, expect } from 'vitest';
import { extraerEnlacesPorCiudad, construirUpsertFilaListingQuery } from './airbnbImportador';
import type { FilaListingAirbnb } from './airbnbCsvParser';

/**
 * Fragmento sintético que reproduce la MISMA estructura de enlace verificada
 * en vivo el 2026-09-24 contra `https://insideairbnb.com/get-the-data/`
 * (`curl` normal, sin JS — ver airbnbImportador.ts). No se versiona el HTML
 * real completo (572KB) como fixture: bastan unas pocas filas de ejemplo,
 * con la misma forma exacta de URL, más un par de "distractores" (otro país,
 * y otros ficheros del mismo bloque de España) para probar que el filtro
 * por ciudad soportada y por fichero funciona.
 */
function construirHtmlSintetico(): string {
  return `
    <html><body>
      <table>
        <tr><td>Albany</td><td>United States</td>
          <td><a href="https://data.insideairbnb.com/united-states/ny/albany/2026-06-16/data/listings.csv.gz">Listings</a></td>
          <td><a href="https://data.insideairbnb.com/united-states/ny/albany/2026-06-16/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Madrid</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/comunidad-de-madrid/madrid/2026-06-20/data/listings.csv.gz">Listings</a></td>
          <td><a href="https://data.insideairbnb.com/spain/comunidad-de-madrid/madrid/2026-06-20/data/calendar.csv.gz">Calendar</a></td>
          <td><a href="https://data.insideairbnb.com/spain/comunidad-de-madrid/madrid/2026-06-20/data/reviews.csv.gz">Reviews</a></td>
          <td><a href="https://data.insideairbnb.com/spain/comunidad-de-madrid/madrid/2026-06-20/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Barcelona</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/catalonia/barcelona/2026-06-24/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Girona</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/catalonia/girona/2026-06-30/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Malaga</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/andalucía/malaga/2026-06-30/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Mallorca</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/islas-baleares/mallorca/2026-06-23/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Menorca</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/islas-baleares/menorca/2026-06-30/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Euskadi</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/pv/euskadi/2026-06-30/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Sevilla</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/andalucía/sevilla/2026-06-30/visualisations/listings.csv">Summary</a></td>
        </tr>
        <tr><td>Valencia</td><td>Spain</td>
          <td><a href="https://data.insideairbnb.com/spain/vc/valencia/2026-06-26/visualisations/listings.csv">Summary</a></td>
        </tr>
      </table>
    </body></html>
  `;
}

describe('extraerEnlacesPorCiudad', () => {
  it('extrae las 9 ciudades españolas soportadas con su fecha de snapshot', () => {
    const enlaces = extraerEnlacesPorCiudad(construirHtmlSintetico());

    expect(enlaces).toHaveLength(9);
    const porSlug = new Map(enlaces.map((e) => [e.slug, e]));
    expect(porSlug.get('madrid')).toMatchObject({ snapshotDate: '2026-06-20' });
    expect(porSlug.get('barcelona')).toMatchObject({ snapshotDate: '2026-06-24' });
    expect(porSlug.get('sevilla')).toMatchObject({ snapshotDate: '2026-06-30' });
    expect(porSlug.get('valencia')).toMatchObject({ snapshotDate: '2026-06-26' });
  });

  it('ignora ciudades de otros países (Albany/Estados Unidos)', () => {
    const enlaces = extraerEnlacesPorCiudad(construirHtmlSintetico());
    expect(enlaces.some((e) => e.slug === 'albany')).toBe(false);
  });

  it('la URL extraída para cada ciudad apunta al summary CSV, no al gz completo', () => {
    const enlaces = extraerEnlacesPorCiudad(construirHtmlSintetico());
    const madrid = enlaces.find((e) => e.slug === 'madrid');
    expect(madrid?.url).toMatch(/visualisations\/listings\.csv$/);
    expect(madrid?.url).not.toMatch(/\.csv\.gz$/);
  });

  it('un HTML sin ningún enlace reconocible devuelve una lista vacía', () => {
    expect(extraerEnlacesPorCiudad('<html><body>nada aquí</body></html>')).toEqual([]);
  });
});

describe('construirUpsertFilaListingQuery', () => {
  const fila: FilaListingAirbnb = {
    listing_id: '1008521039996399925',
    ciudad: 'madrid',
    snapshot_date: '2026-06-20',
    nombre: 'Alojamiento tranquilo',
    barrio_grupo: 'Carabanchel',
    barrio: 'Opañel',
    latitud: 40.38799,
    longitud: -3.7247,
    tipo_habitacion: 'Private room',
    precio_noche: 42,
    estancia_minima_noches: 1,
    num_resenas: 0,
    resenas_ultimos_12_meses: 0,
    resenas_por_mes: null,
    ultima_resena: null,
    anuncios_del_anfitrion: 1,
    disponibilidad_365: 268,
  };

  it('usa ON CONFLICT sobre (listing_id, snapshot_date) para no duplicar', () => {
    const { text } = construirUpsertFilaListingQuery(fila);
    expect(text).toMatch(/ON CONFLICT \(listing_id, snapshot_date\)/);
    expect(text).toMatch(/DO UPDATE SET/);
  });

  it('importar la misma fila dos veces produce la misma query parametrizada (idempotente)', () => {
    const primera = construirUpsertFilaListingQuery(fila);
    const segunda = construirUpsertFilaListingQuery({ ...fila });
    expect(primera.text).toBe(segunda.text);
    expect(primera.values).toEqual(segunda.values);
  });

  it('el listing_id viaja como string en los valores parametrizados, nunca como number', () => {
    const { values } = construirUpsertFilaListingQuery(fila);
    expect(typeof values[0]).toBe('string');
    expect(values[0]).toBe('1008521039996399925');
  });
});
