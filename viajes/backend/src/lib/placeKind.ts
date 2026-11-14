import type { PlaceType } from './types';

/** Result of mapping an OSM class/type pair to the app's place types. */
export interface PlaceClassification {
  kind: PlaceType;
  /** Short Spanish label of the OSM feature type ("Museo", "Castillo"...). */
  label: string;
  /** True for settlements / administrative areas (not points of interest). */
  admin: boolean;
}

type Entry = { kind: PlaceType; label: string };

const lodging = (label: string): Entry => ({ kind: 'alojamiento', label });
const sight = (label: string): Entry => ({ kind: 'interes', label });
const food = (label: string): Entry => ({ kind: 'comida', label });

const TOURISM: Record<string, Entry> = {
  attraction: sight('Atracción'),
  museum: sight('Museo'),
  viewpoint: sight('Mirador'),
  gallery: sight('Galería'),
  artwork: sight('Obra de arte'),
  zoo: sight('Zoo'),
  aquarium: sight('Acuario'),
  theme_park: sight('Parque temático'),
  hotel: lodging('Hotel'),
  hostel: lodging('Albergue'),
  guest_house: lodging('Casa de huéspedes'),
  apartment: lodging('Apartamento'),
  motel: lodging('Motel'),
  camp_site: lodging('Camping'),
  caravan_site: lodging('Área de caravanas'),
  chalet: lodging('Chalet'),
};

const HISTORIC: Record<string, string> = {
  castle: 'Castillo',
  monument: 'Monumento',
  memorial: 'Memorial',
  ruins: 'Ruinas',
  archaeological_site: 'Yacimiento',
  fort: 'Fuerte',
  palace: 'Palacio',
  manor: 'Casa señorial',
  city_gate: 'Puerta de ciudad',
  church: 'Iglesia',
  monastery: 'Monasterio',
  tower: 'Torre',
};

const LEISURE: Record<string, string> = {
  park: 'Parque',
  garden: 'Jardín',
  nature_reserve: 'Reserva natural',
  stadium: 'Estadio',
};

const NATURAL: Record<string, string> = {
  peak: 'Pico',
  volcano: 'Volcán',
  beach: 'Playa',
  water: 'Lago',
  bay: 'Bahía',
  cave_entrance: 'Cueva',
  waterfall: 'Cascada',
  cliff: 'Acantilado',
  valley: 'Valle',
  hot_spring: 'Aguas termales',
};

const MAN_MADE: Record<string, string> = {
  tower: 'Torre',
  lighthouse: 'Faro',
  bridge: 'Puente',
  obelisk: 'Obelisco',
  windmill: 'Molino',
};

const AMENITY: Record<string, Entry> = {
  place_of_worship: sight('Lugar de culto'),
  theatre: sight('Teatro'),
  arts_centre: sight('Centro de arte'),
  cinema: sight('Cine'),
  library: sight('Biblioteca'),
  fountain: sight('Fuente'),
  restaurant: food('Restaurante'),
  cafe: food('Café'),
  bar: food('Bar'),
  pub: food('Pub'),
  fast_food: food('Comida rápida'),
  food_court: food('Zona de restaurantes'),
  ice_cream: food('Heladería'),
  biergarten: food('Cervecería'),
};

/** Settlements and regions: useful to move the map, but not places to visit. */
const PLACE_LABELS: Record<string, string> = {
  country: 'País',
  state: 'Región',
  region: 'Región',
  province: 'Provincia',
  county: 'Comarca',
  city: 'Ciudad',
  town: 'Localidad',
  village: 'Pueblo',
  hamlet: 'Aldea',
  municipality: 'Municipio',
  suburb: 'Barrio',
  quarter: 'Barrio',
  neighbourhood: 'Barrio',
  borough: 'Distrito',
  city_district: 'Distrito',
  district: 'Distrito',
  island: 'Isla',
  isolated_dwelling: 'Vivienda aislada',
  locality: 'Paraje',
  administrative: 'Zona administrativa',
};

const ADMIN_PLACE_TYPES = new Set(Object.keys(PLACE_LABELS));

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

/**
 * Maps an OSM class/type (and optionally Nominatim's `addresstype`, used to
 * label administrative boundaries) to one of the app's place types.
 */
export function classifyPlace(category?: string, type?: string, addresstype?: string): PlaceClassification {
  const c = (category ?? '').toLowerCase();
  const t = (type ?? '').toLowerCase();
  const poi = (kind: PlaceType, label: string): PlaceClassification => ({ kind, label, admin: false });

  if (c === 'tourism' && TOURISM[t]) return { ...TOURISM[t], admin: false };
  if (c === 'tourism') return poi('interes', t ? cap(t) : 'Turismo');
  if (c === 'historic') return poi('interes', HISTORIC[t] ?? 'Lugar histórico');
  if (c === 'leisure' && LEISURE[t]) return poi('interes', LEISURE[t]);
  if (c === 'natural') return poi('interes', NATURAL[t] ?? 'Paraje natural');
  if (c === 'man_made' && MAN_MADE[t]) return poi('interes', MAN_MADE[t]);
  if (c === 'amenity' && AMENITY[t]) return { ...AMENITY[t], admin: false };

  if (c === 'boundary' || c === 'place') {
    const key = c === 'boundary' ? (addresstype ?? '').toLowerCase() : t;
    if (c === 'boundary' || ADMIN_PLACE_TYPES.has(t)) {
      return { kind: 'otro', label: PLACE_LABELS[key] ?? PLACE_LABELS[t] ?? 'Zona administrativa', admin: true };
    }
    return poi('otro', 'Dirección');
  }

  if (c === 'highway') return poi('otro', 'Calle');
  if (c === 'building') return poi('otro', 'Edificio');
  if (c === 'amenity' || c === 'shop' || c === 'office') return poi('otro', t ? cap(t) : 'Lugar');
  return poi('otro', 'Lugar');
}
