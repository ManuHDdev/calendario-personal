import { describe, it, expect } from 'vitest';
import { parseListingsCsv } from './airbnbCsvParser';

const CABECERA =
  'id,name,host_id,host_profile_id,host_name,neighbourhood_group,neighbourhood,latitude,longitude,room_type,price,minimum_nights,number_of_reviews,last_review,reviews_per_month,calculated_host_listings_count,availability_365,number_of_reviews_ltm,license';

describe('parseListingsCsv', () => {
  it('parsea una fila completa con todos los campos presentes', () => {
    const csv = `${CABECERA}
887679074200493161,Hermoso para disfrutar Madrid,425181129,1469928150179759623,Felix,Puente de Vallecas,Palomeras Sureste,40.38548249999999,-3.6408404,Entire home/apt,210,1,1,2023-05-14,0.03,1,364,0,`;

    const filas = parseListingsCsv(csv, 'madrid', '2026-06-20');

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      listing_id: '887679074200493161',
      ciudad: 'madrid',
      snapshot_date: '2026-06-20',
      nombre: 'Hermoso para disfrutar Madrid',
      barrio_grupo: 'Puente de Vallecas',
      barrio: 'Palomeras Sureste',
      tipo_habitacion: 'Entire home/apt',
      precio_noche: 210,
      disponibilidad_365: 364,
    });
  });

  it('un id de 19 dígitos se conserva como string exacto, sin perder precisión', () => {
    // 1008521039996399925 supera Number.MAX_SAFE_INTEGER (9007199254740991) —
    // si se parseara a number, perdería los últimos dígitos.
    const csv = `${CABECERA}
1008521039996399925,Alojamiento tranquilo,509530871,1470290716592357752,Sandra,Carabanchel,Opañel,40.38799,-3.7247,Private room,42,1,0,,,1,268,0,`;

    const filas = parseListingsCsv(csv, 'madrid', '2026-06-20');

    expect(filas[0].listing_id).toBe('1008521039996399925');
    expect(typeof filas[0].listing_id).toBe('string');
  });

  it('un price vacío se guarda como null, nunca como 0', () => {
    const csv = `${CABECERA}
1517952008444895376,Standard Queen,,,,Moncloa - Aravaca,Argüelles,40.42058,-3.71615,Private room,,1,2,2026-01-08,0.34,,43,2,`;

    const filas = parseListingsCsv(csv, 'madrid', '2026-06-20');

    expect(filas[0].precio_noche).toBeNull();
  });

  it('un nombre con comas dentro de comillas no rompe el resto de las columnas', () => {
    const csv = `${CABECERA}
21376743,"Bright & comfortable, Malasana Madrid",43556711,1465646726675829521,Anthony,Centro,Universidad,40.42294,-3.70374,Entire home/apt,,3,4,2018-01-18,0.04,1,0,0,`;

    const filas = parseListingsCsv(csv, 'madrid', '2026-06-20');

    expect(filas[0].nombre).toBe('Bright & comfortable, Malasana Madrid');
    expect(filas[0].tipo_habitacion).toBe('Entire home/apt');
    expect(filas[0].estancia_minima_noches).toBe(3);
  });

  it('una fila sin id se descarta con un aviso, sin abortar el resto del fichero', () => {
    const csv = `${CABECERA}
,Sin id,1,,,Centro,Sol,40.4,-3.7,Private room,50,1,0,,,1,100,0,
887679074200493161,Con id,425181129,,Felix,Centro,Sol,40.4,-3.7,Entire home/apt,80,1,0,,,1,200,0,`;
    const warnings: string[] = [];

    const filas = parseListingsCsv(csv, 'madrid', '2026-06-20', warnings);

    expect(filas).toHaveLength(1);
    expect(filas[0].listing_id).toBe('887679074200493161');
    expect(warnings.some((w) => w.includes('sin id'))).toBe(true);
  });

  it('un CSV vacío (solo cabecera) devuelve una lista vacía', () => {
    const filas = parseListingsCsv(CABECERA, 'madrid', '2026-06-20');
    expect(filas).toEqual([]);
  });

  it('avisa si la cabecera no trae las columnas esperadas', () => {
    const csvConCabeceraDistinta = 'id,name\n1,Test';
    const warnings: string[] = [];

    parseListingsCsv(csvConCabeceraDistinta, 'madrid', '2026-06-20', warnings);

    expect(warnings.some((w) => w.includes('no trae las columnas esperadas'))).toBe(true);
  });
});
