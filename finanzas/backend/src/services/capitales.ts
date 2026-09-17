/**
 * Mapa canónico provincia → capital de provincia, usado por el scraper de
 * precios de vivienda de capitales (`capitalScraper.ts`).
 *
 * Igual que la estructura canónica de `xlsParser.ts` (comunidad autónoma →
 * provincias), este mapa es fijo y no se deriva de ningún origen externo: la
 * geografía administrativa de España no cambia entre despliegues, así que un
 * mapa a mano es más fiable que cualquier heurística sobre un nombre de
 * ciudad. Las 52 claves son exactamente los 52 nombres de provincia que ya
 * existen en `precio_vivienda` (ambito='provincia'), para que ambas
 * funcionalidades — histórico oficial por provincia e histórico de anuncios
 * por capital — hablen del mismo universo de 52 provincias.
 */
export const PROVINCIA_A_CAPITAL: Record<string, string> = {
  'Almería': 'Almería',
  'Cádiz': 'Cádiz',
  'Córdoba': 'Córdoba',
  'Granada': 'Granada',
  'Huelva': 'Huelva',
  'Jaén': 'Jaén',
  'Málaga': 'Málaga',
  'Sevilla': 'Sevilla',
  'Huesca': 'Huesca',
  'Teruel': 'Teruel',
  'Zaragoza': 'Zaragoza',
  'Asturias': 'Oviedo',
  'Balears': 'Palma',
  'Las Palmas': 'Las Palmas de Gran Canaria',
  'Santa Cruz de Tenerife': 'Santa Cruz de Tenerife',
  'Cantabria': 'Santander',
  'Ávila': 'Ávila',
  'Burgos': 'Burgos',
  'León': 'León',
  'Palencia': 'Palencia',
  'Salamanca': 'Salamanca',
  'Segovia': 'Segovia',
  'Soria': 'Soria',
  'Valladolid': 'Valladolid',
  'Zamora': 'Zamora',
  'Albacete': 'Albacete',
  'Ciudad Real': 'Ciudad Real',
  'Cuenca': 'Cuenca',
  'Guadalajara': 'Guadalajara',
  'Toledo': 'Toledo',
  'Barcelona': 'Barcelona',
  'Girona': 'Girona',
  'Lleida': 'Lleida',
  'Tarragona': 'Tarragona',
  'Alicante': 'Alicante',
  'Castellón': 'Castellón de la Plana',
  'Valencia': 'Valencia',
  'Badajoz': 'Badajoz',
  'Cáceres': 'Cáceres',
  'A Coruña': 'A Coruña',
  'Lugo': 'Lugo',
  'Ourense': 'Ourense',
  'Pontevedra': 'Pontevedra',
  'Madrid': 'Madrid',
  'Murcia': 'Murcia',
  'Navarra': 'Pamplona',
  'Araba': 'Vitoria-Gasteiz',
  'Gipuzkoa': 'San Sebastián',
  'Bizkaia': 'Bilbao',
  'La Rioja': 'Logroño',
  'Ceuta': 'Ceuta',
  'Melilla': 'Melilla',
};

/** Las 52 capitales, en el mismo orden que las provincias del mapa. */
export const CAPITALES = Object.values(PROVINCIA_A_CAPITAL);

/** Provincia de una capital dada, o `null` si no es una capital conocida. */
export function provinciaDeCapital(capital: string): string | null {
  for (const [provincia, cap] of Object.entries(PROVINCIA_A_CAPITAL)) {
    if (cap === capital) return provincia;
  }
  return null;
}
