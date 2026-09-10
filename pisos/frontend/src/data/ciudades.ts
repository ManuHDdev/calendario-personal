/**
 * Lista fija de ciudades principales de España — las 50 capitales de provincia,
 * Ceuta y Melilla, y las dos capitales autonómicas que no son capital de
 * provincia (Mérida y Santiago de Compostela).
 *
 * Sirve para dos cosas en el formulario de búsqueda:
 *  1. Sugerir nombres en el campo "Ubicación" (un `<datalist>`), sin quitar la
 *     posibilidad de escribir cualquier otro municipio a mano.
 *  2. Rellenar latitud/longitud al vuelo cuando el texto coincide exactamente
 *     con una de estas ciudades, para no tener que buscar las coordenadas del
 *     centro a mano cada vez que se quiere activar Wallapop.
 *
 * Las coordenadas son el centro aproximado de cada ciudad (4 decimales ≈ 11 m,
 * de sobra para un radio de búsqueda en km). El `nombre` es también el valor
 * que se envía como `ubicacion`: se han elegido las formas que el backend ya
 * reconoce como capital de provincia (`esCapitalDeProvincia`) para que la URL
 * del portal apunte a la ciudad y no a la provincia entera.
 */
export interface Ciudad {
  nombre: string;
  lat: number;
  lng: number;
}

export const CIUDADES_PRINCIPALES: readonly Ciudad[] = [
  { nombre: 'A Coruña', lat: 43.3623, lng: -8.4115 },
  { nombre: 'Albacete', lat: 38.9943, lng: -1.8585 },
  { nombre: 'Alicante', lat: 38.3452, lng: -0.481 },
  { nombre: 'Almería', lat: 36.8381, lng: -2.4597 },
  { nombre: 'Ávila', lat: 40.6566, lng: -4.6812 },
  { nombre: 'Badajoz', lat: 38.8794, lng: -6.9707 },
  { nombre: 'Barcelona', lat: 41.3874, lng: 2.1686 },
  { nombre: 'Bilbao', lat: 43.263, lng: -2.935 },
  { nombre: 'Burgos', lat: 42.3439, lng: -3.6969 },
  { nombre: 'Cáceres', lat: 39.4753, lng: -6.3724 },
  { nombre: 'Cádiz', lat: 36.5271, lng: -6.2886 },
  { nombre: 'Castellón de la Plana', lat: 39.9864, lng: -0.0513 },
  { nombre: 'Ceuta', lat: 35.8894, lng: -5.3213 },
  { nombre: 'Ciudad Real', lat: 38.9861, lng: -3.9291 },
  { nombre: 'Córdoba', lat: 37.8882, lng: -4.7794 },
  { nombre: 'Cuenca', lat: 40.0704, lng: -2.1374 },
  { nombre: 'Girona', lat: 41.9794, lng: 2.8214 },
  { nombre: 'Granada', lat: 37.1773, lng: -3.5986 },
  { nombre: 'Guadalajara', lat: 40.6297, lng: -3.1614 },
  { nombre: 'Huelva', lat: 37.2614, lng: -6.9447 },
  { nombre: 'Huesca', lat: 42.1362, lng: -0.4087 },
  { nombre: 'Jaén', lat: 37.7796, lng: -3.7849 },
  { nombre: 'Las Palmas de Gran Canaria', lat: 28.1235, lng: -15.4363 },
  { nombre: 'León', lat: 42.5987, lng: -5.5671 },
  { nombre: 'Lleida', lat: 41.6176, lng: 0.6200 },
  { nombre: 'Logroño', lat: 42.4627, lng: -2.4449 },
  { nombre: 'Lugo', lat: 43.0121, lng: -7.5559 },
  { nombre: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { nombre: 'Málaga', lat: 36.7213, lng: -4.4214 },
  { nombre: 'Mérida', lat: 38.9165, lng: -6.3437 },
  { nombre: 'Murcia', lat: 37.9922, lng: -1.1307 },
  { nombre: 'Ourense', lat: 42.3358, lng: -7.8639 },
  { nombre: 'Oviedo', lat: 43.3619, lng: -5.8494 },
  { nombre: 'Palencia', lat: 42.0096, lng: -4.5288 },
  { nombre: 'Palma', lat: 39.5696, lng: 2.6502 },
  { nombre: 'Pamplona', lat: 42.8125, lng: -1.6458 },
  { nombre: 'Pontevedra', lat: 42.4310, lng: -8.6444 },
  { nombre: 'Salamanca', lat: 40.9701, lng: -5.6635 },
  { nombre: 'San Sebastián', lat: 43.3183, lng: -1.9812 },
  { nombre: 'Santa Cruz de Tenerife', lat: 28.4636, lng: -16.2518 },
  { nombre: 'Santander', lat: 43.4623, lng: -3.8100 },
  { nombre: 'Santiago de Compostela', lat: 42.8782, lng: -8.5448 },
  { nombre: 'Segovia', lat: 40.9429, lng: -4.1088 },
  { nombre: 'Sevilla', lat: 37.3891, lng: -5.9845 },
  { nombre: 'Soria', lat: 41.7665, lng: -2.4790 },
  { nombre: 'Tarragona', lat: 41.1189, lng: 1.2445 },
  { nombre: 'Teruel', lat: 40.3456, lng: -1.1065 },
  { nombre: 'Toledo', lat: 39.8628, lng: -4.0273 },
  { nombre: 'Valencia', lat: 39.4699, lng: -0.3763 },
  { nombre: 'Valladolid', lat: 41.6523, lng: -4.7245 },
  { nombre: 'Vitoria', lat: 42.8467, lng: -2.6716 },
  { nombre: 'Zamora', lat: 41.5033, lng: -5.7446 },
  { nombre: 'Zaragoza', lat: 41.6488, lng: -0.8891 },
  { nombre: 'Melilla', lat: 35.2923, lng: -2.9381 },
];

/** Normaliza para comparar: sin acentos, minúsculas, espacios colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devuelve la ciudad cuyo nombre coincide EXACTAMENTE con el texto (ignorando
 * acentos y mayúsculas), o `null` si el texto es libre. No hace coincidencia
 * parcial a propósito: "Sant" no debe autocompletar coordenadas de Santander.
 */
export function buscarCiudad(texto: string): Ciudad | null {
  const objetivo = normalizar(texto);
  if (!objetivo) return null;
  return CIUDADES_PRINCIPALES.find((c) => normalizar(c.nombre) === objetivo) ?? null;
}
